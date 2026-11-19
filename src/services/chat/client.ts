import { fetch as expoFetch } from 'expo/fetch';

import { resolveApiBaseUrl } from '@/services/api/config';
import { getAppToken } from '@/services/auth/token';

import type { ChatPortfolio } from './context';

export class ChatError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
  }
}

export type SseEvent = { event: string; data: string };

export type SseParser = {
  /** Feed the next chunk. Chunks may split a line or a CRLF pair. */
  push: (chunk: string) => void;
  /** Emit a trailing block that never received a blank line. */
  flush: () => void;
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type ChatSource = { title: string; url: string };

export type ChatPhase = 'thinking' | 'searching_web' | 'searching_x';

const NETWORK_MESSAGE = 'Assistente non raggiungibile. Il worker è avviato?';

const DEFAULT_MESSAGES: Record<string, string> = {
  login_required: 'Accesso xAI scaduto: rifai il login (npm run login:xai).',
  subscription: 'Abbonamento SuperGrok o credito xAI non disponibile per questa richiesta.',
  rate_limited: 'Troppe richieste, riprova tra poco.',
  upstream: 'Servizio xAI non disponibile.',
  chat_disabled: 'Assistente non disponibile.',
  unauthorized: 'Accesso non autorizzato.',
  invalid_body: 'Richiesta non valida.',
  network: NETWORK_MESSAGE,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === 'AbortError';
}

function messageFor(code: string, serverMessage?: string): string {
  const trimmed = serverMessage?.trim();
  const base = trimmed ? trimmed : (DEFAULT_MESSAGES[code] ?? 'Qualcosa è andato storto.');
  if (code === 'login_required' && !base.includes('npm run login:xai')) {
    return `${base} Esegui npm run login:xai nel worker.`;
  }
  return base;
}

function emitBlock(raw: string, onEvent: (event: SseEvent) => void): void {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      const rest = line.slice('data:'.length);
      dataLines.push(rest.startsWith(' ') ? rest.slice(1) : rest);
    }
  }
  if (dataLines.length === 0) return;
  onEvent({ event, data: dataLines.join('\n') });
}

/** Incremental SSE reader. Ignores comment lines (`:`) and joins multi-line `data:`. */
export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let buffer = '';

  const drain = (final: boolean) => {
    // A trailing CR may be the first half of a CRLF split across chunks.
    let hold = '';
    if (!final && buffer.endsWith('\r')) {
      hold = '\r';
      buffer = buffer.slice(0, -1);
    }
    buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      emitBlock(raw, onEvent);
      sep = buffer.indexOf('\n\n');
    }
    buffer += hold;
    if (final && buffer.trim()) {
      const rest = buffer;
      buffer = '';
      emitBlock(rest, onEvent);
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      drain(false);
    },
    flush() {
      drain(true);
    },
  };
}

function parsePhase(value: unknown): ChatPhase | null {
  if (value === 'thinking' || value === 'searching_web' || value === 'searching_x') return value;
  return null;
}

function dispatch(
  event: SseEvent,
  onDelta: (text: string) => void,
  onStatus?: (phase: ChatPhase) => void,
): void {
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }
  if (event.event === 'status') {
    const phase = isRecord(data) ? parsePhase(data.phase) : null;
    if (phase) onStatus?.(phase);
    return;
  }
  if (event.event === 'delta' && isRecord(data) && typeof data.text === 'string' && data.text.length > 0) {
    onDelta(data.text);
    return;
  }
  // Legacy event. Citations are not shown.
  if (event.event === 'sources') return;
  if (event.event === 'error') {
    const code = isRecord(data) && typeof data.code === 'string' ? data.code : 'upstream';
    const serverMessage = isRecord(data) && typeof data.message === 'string' ? data.message : undefined;
    throw new ChatError(code, messageFor(code, serverMessage));
  }
}

function errorFromBody(status: number, raw: string): ChatError {
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const code =
    isRecord(parsed) && typeof parsed.error === 'string'
      ? parsed.error
      : status === 401
        ? 'login_required'
        : status === 402
          ? 'subscription'
          : status === 429
            ? 'rate_limited'
            : status === 503
              ? 'chat_disabled'
              : 'upstream';
  const serverMessage = isRecord(parsed) && typeof parsed.message === 'string' ? parsed.message : undefined;
  return new ChatError(code, messageFor(code, serverMessage));
}

async function readBody(
  res: Awaited<ReturnType<typeof expoFetch>>,
  parser: SseParser,
  signal?: AbortSignal,
): Promise<void> {
  const body = res.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      if (value) parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.flush();
    return;
  }
  parser.push(await res.text());
  parser.flush();
}

/**
 * POST `/chat` and surface SSE deltas. Resolves quietly when `signal` aborts.
 * `expo/fetch` exposes `response.body` in Expo Go (SDK 52+); web uses the browser stream.
 */
export async function streamChat({
  messages,
  portfolio,
  signal,
  onDelta,
  onStatus,
}: {
  messages: ChatTurn[];
  portfolio?: ChatPortfolio;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  onStatus?: (phase: ChatPhase) => void;
}): Promise<void> {
  if (signal?.aborted) return;
  const base = resolveApiBaseUrl();
  if (!base) throw new ChatError('network', NETWORK_MESSAGE);
  const token = await getAppToken();
  if (signal?.aborted) return;

  let res: Awaited<ReturnType<typeof expoFetch>>;
  try {
    res = await expoFetch(`${base}/chat`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-Folio-Token': token,
      },
      body: JSON.stringify(portfolio ? { messages, portfolio } : { messages }),
    });
  } catch (error) {
    if (isAbort(error, signal)) return;
    throw new ChatError('network', NETWORK_MESSAGE);
  }

  if (!res.ok) {
    let raw = '';
    try {
      raw = await res.text();
    } catch (error) {
      if (isAbort(error, signal)) return;
      throw new ChatError('network', NETWORK_MESSAGE);
    }
    throw errorFromBody(res.status, raw);
  }

  const parser = createSseParser((event) => dispatch(event, onDelta, onStatus));
  try {
    await readBody(res, parser, signal);
  } catch (error) {
    if (isAbort(error, signal)) return;
    if (error instanceof ChatError) throw error;
    throw new ChatError('network', NETWORK_MESSAGE);
  }
}

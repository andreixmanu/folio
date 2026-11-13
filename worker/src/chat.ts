import type { Env } from './env';
import { getAccessToken, XaiAuthError, assertXaiUrl, type XaiAuthDeps, type XaiFetcher } from './xai-auth';
import { XAI_DEFAULT_MODEL, XAI_DEFAULT_SEARCH_TOOLS, XAI_RESPONSES_URL } from './xai-config';

const MAX_MESSAGES = 40;
const MAX_CONTENT_CHARS = 8000;
const PORTFOLIO_MAX_BYTES = 20 * 1024;

const LOGIN_REQUIRED_MESSAGE = 'Accesso xAI scaduto: rifai il login (npm run login:xai).';
const SUBSCRIPTION_MESSAGE =
  'Abbonamento SuperGrok o credito xAI non disponibile per questa richiesta.';
const RATE_LIMIT_MESSAGE = 'Troppe richieste, riprova tra poco.';
const UPSTREAM_MESSAGE = 'Servizio xAI non disponibile.';

const SYSTEM_PROMPT = [
  'Sei "Folio Assistente", analista dei mercati finanziari (azioni, ETF, crypto, macroeconomia,',
  'tassi, valute, materie prime) e del portafoglio dell\'utente. Rispondi in italiano (o nella',
  'lingua dell\'utente), conciso, con elenchi puntati quando utile, cifre e date precise; cita le',
  'fonti quando usi notizie recenti. Se la domanda è fuori da mercati/finanza/economia/portafoglio,',
  'rifiuta gentilmente in una frase e proponi un tema di mercato. Non è consulenza finanziaria:',
  'niente raccomandazioni personalizzate di acquisto/vendita come ordini; puoi discutere scenari,',
  'rischi, esposizioni. Usa il contesto del portafoglio (fornito come JSON) quando pertinente.',
].join(' ');

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type PortfolioHolding = {
  symbol: string;
  name: string;
  assetClass: string;
  /** Omitted when the user hides balances. */
  quantity?: number;
  /** Omitted when the user hides balances. */
  value?: number;
  weightPct: number;
  changePct?: number;
};

export type Portfolio = {
  /** Omitted when the user hides balances; weights stay on each holding. */
  totalValue?: number;
  currency: string;
  holdings: PortfolioHolding[];
  allocation?: { label: string; percent: number }[];
};

export type ChatRequest = { messages: ChatMessage[]; portfolio?: Portfolio };

type ChatDeps = XaiAuthDeps;

/** XOR over the longer input so a mismatch does not return early. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  let diff = left.length ^ right.length;
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Absent is fine. A present value must be a finite number (null, strings, NaN fail). */
function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function portfolioOk(value: Record<string, unknown>): boolean {
  if (!isOptionalFiniteNumber(value.totalValue) || typeof value.currency !== 'string') return false;
  if (!Array.isArray(value.holdings)) return false;
  for (const holding of value.holdings) {
    if (!isRecord(holding)) return false;
    if (typeof holding.symbol !== 'string' || typeof holding.name !== 'string') return false;
    if (typeof holding.assetClass !== 'string') return false;
    if (!isOptionalFiniteNumber(holding.quantity) || !isOptionalFiniteNumber(holding.value)) return false;
    if (!isFiniteNumber(holding.weightPct)) return false;
    if (holding.changePct !== undefined && !isFiniteNumber(holding.changePct)) return false;
  }
  if (value.allocation === undefined) return true;
  if (!Array.isArray(value.allocation)) return false;
  for (const slice of value.allocation) {
    if (!isRecord(slice) || typeof slice.label !== 'string' || !isFiniteNumber(slice.percent)) {
      return false;
    }
  }
  return true;
}

export function parseChatBody(raw: string): { ok: true; value: ChatRequest } | { ok: false } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.messages)) return { ok: false };
  if (parsed.messages.length < 1 || parsed.messages.length > MAX_MESSAGES) return { ok: false };

  const messages: ChatMessage[] = [];
  for (const item of parsed.messages) {
    if (!isRecord(item)) return { ok: false };
    if (item.role !== 'user' && item.role !== 'assistant') return { ok: false };
    if (typeof item.content !== 'string' || item.content.length > MAX_CONTENT_CHARS) return { ok: false };
    messages.push({ role: item.role, content: item.content });
  }
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return { ok: false };

  if (parsed.portfolio === undefined) return { ok: true, value: { messages } };
  if (!isRecord(parsed.portfolio)) return { ok: false };
  const encoded = new TextEncoder().encode(JSON.stringify(parsed.portfolio));
  if (encoded.byteLength > PORTFOLIO_MAX_BYTES) return { ok: false };
  if (!portfolioOk(parsed.portfolio)) return { ok: false };
  return { ok: true, value: { messages, portfolio: parsed.portfolio as Portfolio } };
}

const HIDDEN_AMOUNTS_NOTE = 'valori assoluti nascosti dall\'utente: usa solo i pesi';

export function buildSystemContent(nowMs: number, portfolio: Portfolio | undefined): string {
  const date = new Date(nowMs).toISOString().slice(0, 10);
  let content = `${SYSTEM_PROMPT} Data di oggi: ${date}.`;
  if (!portfolio) return content;
  if (portfolio.totalValue === undefined) content += `\n${HIDDEN_AMOUNTS_NOTE}`;
  content += `\n${JSON.stringify(portfolio)}`;
  return content;
}

export function parseSearchTools(raw: string | undefined): { type: string }[] {
  const spec = raw === undefined ? XAI_DEFAULT_SEARCH_TOOLS : raw;
  return spec
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((type) => ({ type }));
}

function jsonBody(status: number, error: string, message?: string): Response {
  const body = message === undefined ? { error } : { error, message };
  return Response.json(body, { status });
}

function mapUpstreamStatus(status: number): Response | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401) return jsonBody(401, 'login_required', LOGIN_REQUIRED_MESSAGE);
  if (status === 402 || status === 403) return jsonBody(402, 'subscription', SUBSCRIPTION_MESSAGE);
  if (status === 429) return jsonBody(429, 'rate_limited', RATE_LIMIT_MESSAGE);
  return jsonBody(502, 'upstream', UPSTREAM_MESSAGE);
}

type Source = { title: string; url: string };

function hostnameTitle(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

function addSource(out: Source[], seen: Set<string>, url: string, title: string): void {
  if (seen.has(url)) return;
  seen.add(url);
  out.push({ title, url });
}

function collectCitations(node: unknown, out: Source[], seen: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectCitations(item, out, seen);
    return;
  }
  const rec = node as Record<string, unknown>;
  if (rec.type === 'url_citation' && typeof rec.url === 'string' && rec.url.length > 0) {
    const title = typeof rec.title === 'string' && rec.title.trim() ? rec.title : rec.url;
    addSource(out, seen, rec.url, title);
  }
  for (const [key, value] of Object.entries(rec)) {
    // Responses API also sends `citations: string[]` (plain URLs), e.g. response.citations.
    if (key === 'citations' && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          const title = hostnameTitle(item);
          if (title) addSource(out, seen, item, title);
        } else {
          collectCitations(item, out, seen);
        }
      }
      continue;
    }
    collectCitations(value, out, seen);
  }
}

function safeErrorCode(data: unknown): string {
  const candidates: unknown[] = [];
  if (isRecord(data)) {
    candidates.push(data.code);
    if (isRecord(data.error)) candidates.push(data.error.code);
    if (isRecord(data.response) && isRecord(data.response.error)) {
      candidates.push(data.response.error.code);
    }
  }
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^[a-z0-9_]{1,64}$/i.test(candidate)) return candidate;
  }
  return 'upstream';
}

function parseSseBlock(raw: string): { event: string; data: unknown } | null {
  let event = '';
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) {
      const rest = line.slice(5);
      dataLines.push(rest.startsWith(' ') ? rest.slice(1) : rest);
    }
  }
  if (dataLines.length === 0) return null;
  const dataStr = dataLines.join('\n');
  if (dataStr === '[DONE]') return null;
  try {
    const data = JSON.parse(dataStr) as unknown;
    const type = isRecord(data) && typeof data.type === 'string' ? data.type : '';
    return { event: event || type, data };
  } catch {
    return null;
  }
}

function encodeSse(encoder: TextEncoder, event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Re-emit upstream Responses SSE as delta / sources / error / done.
 *  Does not buffer the body. Cancelling this stream cancels `upstream`.
 */
export function toClientSse(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  const sources: Source[] = [];
  const seen = new Set<string>();
  let failed: { code: string; message: string } | null = null;
  let clientGone = false;
  const reader = upstream.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (clientGone) return;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (clientGone) return;
          if (done) {
            finish(controller);
            return;
          }
          pushChunk(value, controller);
          if ((controller.desiredSize ?? 0) <= 0) return;
        }
      } catch {
        if (clientGone) return;
        failed = { code: 'upstream', message: UPSTREAM_MESSAGE };
        try {
          finish(controller);
        } catch {
          /* consumer already gone */
        }
      }
    },
    cancel(reason) {
      clientGone = true;
      return reader.cancel(reason);
    },
  });

  function pushChunk(value: Uint8Array, controller: ReadableStreamDefaultController<Uint8Array>): void {
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      consume(raw, controller);
      sep = buffer.indexOf('\n\n');
    }
  }

  function finish(controller: ReadableStreamDefaultController<Uint8Array>): void {
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, '\n');
    if (buffer.trim()) consume(buffer, controller);
    if (sources.length > 0) controller.enqueue(encodeSse(encoder, 'sources', { sources }));
    if (failed) controller.enqueue(encodeSse(encoder, 'error', failed));
    controller.enqueue(encodeSse(encoder, 'done', {}));
    controller.close();
  }

  function consume(raw: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
    const block = parseSseBlock(raw);
    if (!block) return;
    collectCitations(block.data, sources, seen);
    const type = isRecord(block.data) && typeof block.data.type === 'string' ? block.data.type : '';
    const name = block.event || type;
    if (!failed && (name === 'response.output_text.delta' || type === 'response.output_text.delta')) {
      const delta = isRecord(block.data) ? block.data.delta : undefined;
      if (typeof delta === 'string' && delta.length > 0) {
        controller.enqueue(encodeSse(encoder, 'delta', { text: delta }));
      }
    }
    if (name === 'response.failed' || name === 'error' || type === 'response.failed' || type === 'error') {
      failed = { code: safeErrorCode(block.data), message: UPSTREAM_MESSAGE };
    }
  }
}

type UpstreamPayload = {
  model: string;
  input: { role: string; content: string }[];
  stream: true;
  store: false;
  tools?: { type: string }[];
};

function buildPayload(env: Env, req: ChatRequest, nowMs: number, tools: { type: string }[]): UpstreamPayload {
  const payload: UpstreamPayload = {
    model: env.XAI_MODEL?.trim() || XAI_DEFAULT_MODEL,
    input: [
      { role: 'system', content: buildSystemContent(nowMs, req.portfolio) },
      ...req.messages,
    ],
    stream: true,
    store: false,
  };
  if (tools.length > 0) payload.tools = tools;
  return payload;
}

async function postResponses(fetchImpl: XaiFetcher, accessToken: string, payload: UpstreamPayload): Promise<Response> {
  assertXaiUrl(XAI_RESPONSES_URL);
  const res = await fetchImpl(XAI_RESPONSES_URL, {
    method: 'POST',
    // workerd rejects redirect:'error'. Refuse 3xx below so we never follow off *.x.ai.
    redirect: 'manual',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel()?.catch(() => undefined);
    return jsonBody(502, 'upstream', UPSTREAM_MESSAGE);
  }
  return res;
}

async function callUpstream(env: Env, accessToken: string, req: ChatRequest, deps: ChatDeps): Promise<Response> {
  const fetchImpl: XaiFetcher = deps.fetch ?? ((url, init) => fetch(url, init));
  const nowMs = (deps.now ?? Date.now)();
  const tools = parseSearchTools(env.XAI_SEARCH_TOOLS);
  let res = await postResponses(fetchImpl, accessToken, buildPayload(env, req, nowMs, tools));
  if (res.status === 400 && tools.length > 0) {
    const text = await res.text();
    if (/tool/i.test(text)) {
      res = await postResponses(fetchImpl, accessToken, buildPayload(env, req, nowMs, []));
    } else {
      res = new Response(text, { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return res;
}

export async function handleChat(env: Env, tokenHeader: string, rawBody: string, deps: ChatDeps = {}): Promise<Response> {
  const secret = env?.APP_CHAT_TOKEN;
  if (!secret) return jsonBody(503, 'chat_disabled');
  if (!timingSafeEqual(tokenHeader, secret)) return jsonBody(401, 'unauthorized');

  const parsed = parseChatBody(rawBody);
  if (!parsed.ok) return jsonBody(400, 'invalid_body');

  let accessToken: string;
  try {
    accessToken = await getAccessToken(env, deps);
  } catch (err) {
    if (err instanceof XaiAuthError && err.code === 'login_required') {
      return jsonBody(401, 'login_required', LOGIN_REQUIRED_MESSAGE);
    }
    return jsonBody(502, 'upstream', UPSTREAM_MESSAGE);
  }

  try {
    const upstream = await callUpstream(env, accessToken, parsed.value, deps);
    const mapped = mapUpstreamStatus(upstream.status);
    if (mapped) {
      await upstream.body?.cancel()?.catch(() => undefined);
      return mapped;
    }
    if (!upstream.body) return jsonBody(502, 'upstream', UPSTREAM_MESSAGE);
    return new Response(toClientSse(upstream.body), { status: 200, headers: SSE_HEADERS });
  } catch {
    return jsonBody(502, 'upstream', UPSTREAM_MESSAGE);
  }
}

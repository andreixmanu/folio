import { requireAppToken } from './auth';
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
  'lingua dell\'utente), conciso, con elenchi puntati quando utile, cifre e date precise.',
  'Non aggiungere fonti, link, URL, riferimenti o citazioni: niente sezione "Fonti:", niente',
  'note a piè di pagina, niente marcatori [1]. Esponi i fatti con date e cifre nel testo.',
  'Cercare notizie recenti è consentito e incoraggiato. Se la domanda è fuori da',
  'mercati/finanza/economia/portafoglio, rifiuta gentilmente in una frase e proponi un tema di',
  'mercato. Non è consulenza finanziaria: niente raccomandazioni personalizzate di',
  'acquisto/vendita come ordini; puoi discutere scenari, rischi, esposizioni. Usa il contesto',
  'del portafoglio (fornito come JSON) quando pertinente.',
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

export type StatusPhase = 'thinking' | 'searching_web' | 'searching_x';

const SAFE_ID = /^[A-Za-z0-9_.:-]{1,80}$/;

function safeId(value: unknown): string {
  return typeof value === 'string' && SAFE_ID.test(value) ? value : '';
}

/** Function names xAI uses for an `x_search` tool call (`custom_tool_call` items). */
function isXToolName(name: string): boolean {
  return (
    name.includes('x_search') ||
    name === 'x_keyword_search' ||
    name === 'x_semantic_search' ||
    name === 'x_user_search' ||
    name === 'x_thread_fetch'
  );
}

function searchKind(type: string, data: unknown): 'web' | 'x' | null {
  const rec = isRecord(data) ? data : null;
  const item = rec && isRecord(rec.item) ? rec.item : null;
  const event = type.toLowerCase();
  const itemType = safeId(item?.type).toLowerCase();
  const itemName = safeId(item?.name).toLowerCase();
  const topName = safeId(rec?.name).toLowerCase();
  const callId = (safeId(item?.call_id) || safeId(rec?.call_id)).toLowerCase();

  const web =
    event.includes('web_search') ||
    itemType === 'web_search_call' ||
    itemName.includes('web_search') ||
    topName.includes('web_search');
  if (web) return 'web';

  // Attachment search also uses custom_tool_call, with an `as_` call id. Not X.
  if (callId.startsWith('as_')) return null;

  if (event.includes('x_search') || itemType === 'x_search_call') return 'x';
  if (isXToolName(itemName) || isXToolName(topName) || callId.startsWith('xs_')) return 'x';
  // Observed stream: X Search is `custom_tool_call`, not `response.x_search_call.*`.
  if (itemType === 'custom_tool_call' || event.startsWith('response.custom_tool_call')) {
    if (itemName && !isXToolName(itemName)) return null;
    if (topName && !isXToolName(topName)) return null;
    return 'x';
  }
  return null;
}

function searchSettled(type: string, itemStatus: string): boolean {
  const event = type.toLowerCase();
  if (event.endsWith('.in_progress') || event.endsWith('.searching') || event.endsWith('.delta')) return false;
  if (event.endsWith('.completed') || event === 'response.output_item.done') return true;
  return itemStatus === 'completed';
}

/** Phase for one upstream event, or `null` when the event should not change status. */
export function statusPhaseFor(type: string, data: unknown): StatusPhase | null {
  if (typeof type !== 'string' || type.length === 0 || type.length > 120) return null;
  const kind = searchKind(type, data);
  if (kind) {
    const rec = isRecord(data) ? data : null;
    const item = rec && isRecord(rec.item) ? rec.item : null;
    const itemStatus = safeId(item?.status).toLowerCase();
    if (searchSettled(type, itemStatus)) return 'thinking';
    return kind === 'web' ? 'searching_web' : 'searching_x';
  }
  const item = isRecord(data) && isRecord(data.item) ? data.item : null;
  const itemType = safeId(item?.type).toLowerCase();
  const event = type.toLowerCase();
  if (
    event === 'response.created' ||
    event === 'response.in_progress' ||
    event.includes('reasoning') ||
    itemType === 'reasoning'
  ) {
    return 'thinking';
  }
  return null;
}

const DEBUG_TOKEN = /^[A-Za-z0-9_.:-]{1,120}$/;

/** Event type only. For tool-call / output_item events, also the item type and status. */
function logDebugEvent(eventType: string, data: unknown): void {
  const type = DEBUG_TOKEN.test(eventType) ? eventType : 'unknown';
  const item = isRecord(data) && isRecord(data.item) ? data.item : null;
  const rawItemType = item && typeof item.type === 'string' ? item.type : '';
  const rawItemStatus = item && typeof item.status === 'string' ? item.status : '';
  const callLike = type.includes('_call') || type.includes('output_item') || rawItemType.includes('_call');
  if (!callLike) {
    console.log('[xai-event]', type);
    return;
  }
  const itemType = DEBUG_TOKEN.test(rawItemType) ? rawItemType : '';
  const itemStatus = DEBUG_TOKEN.test(rawItemStatus) ? rawItemStatus : '';
  console.log('[xai-event]', type, itemType, itemStatus);
}

export type ClientSseOptions = {
  /** When true, log upstream SSE event type names. Never logs payloads. */
  debugEvents?: boolean;
};

/** One turn so a queued chunk can leave the isolate before the next await. */
function yieldForFlush(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { wait?: (ms: number) => Promise<void> } }).scheduler;
  if (scheduler && typeof scheduler.wait === 'function') return scheduler.wait(1);
  return new Promise((resolve) => {
    setTimeout(resolve, 1);
  });
}

const CITE_HOLD_LIMIT = 200;
const CITE_NUM = String.raw`\d{1,3}(?!\d)`;
const RE_CITE_SINGLE = new RegExp(String.raw`^\[\s*${CITE_NUM}\s*\]`);
const RE_CITE_GROUP = new RegExp(String.raw`^\[\s*${CITE_NUM}(?:\s*,\s*${CITE_NUM})+\s*\]`);
const RE_CITE_DOUBLE = new RegExp(String.raw`^\[\[\s*${CITE_NUM}\s*\]\]`);
const RE_CITE_URL = /^\((https?:\/\/[^)\s]+)\)/i;

/** A line that is only a sources heading, optionally a markdown heading or wrapped in emphasis. */
const SOURCES_HEADING =
  /^\s{0,3}(?:#{1,6}[ \t]+)?(?:(?:\*\*|__)\s*(?:fonti|sources)\s*:?\s*(?:\*\*|__)|(?:\*|_)\s*(?:fonti|sources)\s*:?\s*(?:\*|_)|(?:fonti|sources))\s*:?\s*$/i;

export type CitationStripper = {
  /** Returns text that is safe to show. May hold back a short tail. */
  push: (text: string) => string;
  /** Flush the tail. Drops a trailing sources block that never resumed into prose. */
  flush: () => string;
};

function bracketLen(re: RegExp, text: string): number {
  const match = re.exec(text);
  return match ? match[0].length : 0;
}

function withUrl(text: string, base: number): number {
  if (base <= 0) return 0;
  const match = RE_CITE_URL.exec(text.slice(base));
  return match ? base + match[0].length : 0;
}

/** `(https://...` with no closing `)` yet, sitting right after a citation bracket. */
function danglingUrlLength(text: string): number {
  const base = Math.max(bracketLen(RE_CITE_DOUBLE, text), bracketLen(RE_CITE_GROUP, text), bracketLen(RE_CITE_SINGLE, text));
  if (base <= 0) return 0;
  const after = text.slice(base);
  if (!after.startsWith('(') || after.includes(')') || /\s/.test(after)) return 0;
  const inner = after.slice(1);
  if (inner.length === 0) return text.length;
  const lower = inner.toLowerCase();
  if ('https://'.startsWith(lower) || /^https?:\/\/\S*$/i.test(inner)) return text.length;
  return 0;
}

function partialUrlAt(text: string, index: number): boolean {
  if (text[index] !== '(') return false;
  const inner = text.slice(index + 1);
  if (inner.includes(')') || /\s/.test(inner)) return false;
  if (inner.length === 0) return true;
  const lower = inner.toLowerCase();
  if ('https://'.startsWith(lower)) return true;
  return /^https?:\/\/\S*$/i.test(inner);
}

/** True when `text` is a prefix of a 1–3 digit citation and nothing else. Years (4 digits) are not. */
function incompleteCitation(text: string): boolean {
  if (!text.startsWith('[') || text.length >= CITE_HOLD_LIMIT) return false;
  if (text.length === 1) return true;

  let i = text.startsWith('[[') ? 2 : 1;
  const double = text.startsWith('[[');

  const skipWs = (): void => {
    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i += 1;
  };
  const readNum = (): 'ok' | 'need' | 'bad' => {
    skipWs();
    if (i >= text.length) return 'need';
    if (!/\d/.test(text[i] ?? '')) return 'bad';
    let digits = 0;
    while (i < text.length && /\d/.test(text[i] ?? '')) {
      digits += 1;
      i += 1;
      if (digits > 3) return 'bad';
    }
    return 'ok';
  };

  if (double) {
    const num = readNum();
    if (num === 'bad') return false;
    if (num === 'need') return true;
    skipWs();
    if (i >= text.length) return true;
    if (text[i] !== ']') return false;
    i += 1;
    if (i >= text.length) return true;
    if (text[i] !== ']') return false;
    i += 1;
    if (i >= text.length) return true;
    return partialUrlAt(text, i);
  }

  const first = readNum();
  if (first === 'bad') return false;
  if (first === 'need') return true;
  while (true) {
    const mark = i;
    skipWs();
    if (i >= text.length) return true;
    if (text[i] === ',') {
      i += 1;
      const num = readNum();
      if (num === 'bad') return false;
      if (num === 'need') return true;
      continue;
    }
    i = mark;
    break;
  }
  skipWs();
  if (i >= text.length) return true;
  if (text[i] !== ']') return false;
  i += 1;
  if (i >= text.length) return true;
  return partialUrlAt(text, i);
}

/** Length to delete, `0` when it is not a citation, `-1` when the tail must be held. */
function citationLength(text: string, endStable: boolean): number {
  if (!text.startsWith('[')) return 0;
  const doubleBase = bracketLen(RE_CITE_DOUBLE, text);
  const groupBase = bracketLen(RE_CITE_GROUP, text);
  const singleBase = bracketLen(RE_CITE_SINGLE, text);
  const urlLen = Math.max(withUrl(text, doubleBase), withUrl(text, groupBase), withUrl(text, singleBase));
  if (urlLen > 0) return urlLen;
  if (!endStable && incompleteCitation(text)) return -1;
  if (endStable) {
    const dangling = danglingUrlLength(text);
    if (dangling > 0) return dangling;
  }
  return Math.max(doubleBase, groupBase, singleBase);
}

function stripCitations(input: string, endStable: boolean): { emit: string; hold: string } {
  let emit = '';
  let i = 0;
  while (i < input.length) {
    const next = input.indexOf('[', i);
    if (next === -1) {
      emit += input.slice(i);
      break;
    }
    emit += input.slice(i, next);
    const rest = input.slice(next);
    const n = citationLength(rest, endStable);
    if (n < 0) return { emit, hold: rest };
    if (n === 0) {
      emit += '[';
      i = next + 1;
      continue;
    }
    i = next + n;
  }
  return { emit, hold: '' };
}

type LineSlice = { text: string; start: number; complete: boolean };

function lineSlices(buf: string): LineSlice[] {
  const lines: LineSlice[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === '\n') {
      lines.push({ text: buf.slice(start, i), start, complete: true });
      start = i + 1;
    }
  }
  lines.push({ text: buf.slice(start), start, complete: false });
  return lines;
}

function tailAfterWord(after: string, opener: string): boolean {
  let i = 0;
  let sawColon = false;
  const eatWs = (): void => {
    while (i < after.length && (after[i] === ' ' || after[i] === '\t')) i += 1;
  };
  if (after[i] === ':') {
    sawColon = true;
    i += 1;
  }
  eatWs();
  if (opener) {
    if (i >= after.length) return true;
    if (after.startsWith(opener, i)) i += opener.length;
    else if (opener.startsWith(after.slice(i))) return true;
    else return false;
  }
  if (i >= after.length) return true;
  if (!sawColon && after[i] === ':') {
    i += 1;
    eatWs();
  }
  return i >= after.length;
}

/** True when `line` can still grow into a Fonti/Sources heading. */
function couldBecomeSourcesHeading(line: string): boolean {
  if (line.length > 60) return false;
  let i = 0;
  let spaces = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    if (spaces >= 3) return false;
    spaces += 1;
    i += 1;
  }
  if (i >= line.length) return true;
  if (line[i] === '#') {
    let hashes = 0;
    while (i < line.length && line[i] === '#') {
      hashes += 1;
      i += 1;
      if (hashes > 6) return false;
    }
    if (i >= line.length) return true;
    if (line[i] !== ' ' && line[i] !== '\t') return false;
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i += 1;
    if (i >= line.length) return true;
  }

  let opener = '';
  if (line.startsWith('**', i) || line.startsWith('__', i)) {
    opener = line.slice(i, i + 2);
    i += 2;
  } else if (line[i] === '*' || line[i] === '_') {
    if (i === line.length - 1) return true;
    opener = line[i] ?? '';
    i += 1;
  }
  const rest = line.slice(i);
  if (rest.length === 0) return true;
  const lower = rest.toLowerCase();
  for (const word of ['fonti', 'sources']) {
    if (word.startsWith(lower)) return true;
    if (lower.startsWith(word) && tailAfterWord(rest.slice(word.length), opener)) return true;
  }
  return false;
}

function sourcesHeadingStatus(line: string, complete: boolean): 'yes' | 'maybe' | 'no' {
  if (SOURCES_HEADING.test(line)) return complete ? 'yes' : 'maybe';
  if (complete || line.length > 60) return 'no';
  return couldBecomeSourcesHeading(line) ? 'maybe' : 'no';
}

function containsLink(text: string): boolean {
  return /https?:\/\/\S+/i.test(text) || /\[[^\]]+\]\([^)\s]+\)/.test(text);
}

function isSchemePrefix(text: string): boolean {
  return 'https://'.startsWith(text.toLowerCase());
}

function onlyLinkStatus(text: string, complete: boolean): 'yes' | 'maybe' | 'no' {
  if (/^https?:\/\/\S+$/i.test(text)) return 'yes';
  if (/^\[[^\]]+\]\([^)\s]+\)$/.test(text)) return 'yes';
  if (/^<https?:\/\/[^>\s]+>$/i.test(text)) return 'yes';
  if (complete || text.length >= CITE_HOLD_LIMIT) return 'no';
  if (isSchemePrefix(text) || /^https?:\/\/\S*$/i.test(text)) return 'maybe';
  if (/^\[[^\]]*$/.test(text) || /^\[[^\]]+\]\(?[^)\s]*$/.test(text)) return 'maybe';
  if (/^<https?:?\/?\/?[^>\s]*$/i.test(text)) return 'maybe';
  return 'no';
}

function linkBodyStatus(body: string, complete: boolean): 'yes' | 'maybe' | 'no' {
  if (body.length === 0) return complete ? 'no' : 'maybe';
  if (containsLink(body)) return 'yes';
  if (complete) return 'no';
  return onlyLinkStatus(body, false) === 'maybe' ? 'maybe' : 'no';
}

/** A fonti block may continue with blank lines or list items that are only links. */
function linkLineStatus(line: string, complete: boolean): 'yes' | 'maybe' | 'no' {
  if (line.trim().length === 0) return complete ? 'yes' : 'maybe';
  const trimmed = line.trim();
  const bullet = /^(?:[-*•–]|\d{1,3}[.)])\s+(.*)$/.exec(trimmed);
  if (bullet) return linkBodyStatus(bullet[1] ?? '', complete);
  if (!complete && /^(?:[-*•–]|\d{1,3}[.)]?)$/.test(trimmed)) return 'maybe';
  if (!complete && /^\d{1,3}[.)]\s*$/.test(trimmed)) return 'maybe';
  return onlyLinkStatus(trimmed, complete);
}

type FontiDecision = { kind: 'none' } | { kind: 'hold'; index: number } | { kind: 'drop'; index: number };

function analyzeFonti(buf: string, final: boolean): FontiDecision {
  let holdAt: number | null = null;
  for (const line of lineSlices(buf)) {
    const lineComplete = line.complete || final;
    if (holdAt === null) {
      const status = sourcesHeadingStatus(line.text, lineComplete);
      if (status === 'yes') holdAt = line.start;
      else if (status === 'maybe') return { kind: 'hold', index: line.start };
      continue;
    }
    let status = linkLineStatus(line.text, lineComplete);
    if (final && status === 'maybe') status = 'yes';
    if (status === 'maybe') return { kind: 'hold', index: holdAt };
    if (status === 'yes') continue;
    holdAt = null;
    const heading = sourcesHeadingStatus(line.text, lineComplete);
    if (heading === 'yes') holdAt = line.start;
    else if (heading === 'maybe') return { kind: 'hold', index: line.start };
  }
  if (holdAt === null) return { kind: 'none' };
  return final ? { kind: 'drop', index: holdAt } : { kind: 'hold', index: holdAt };
}

/**
 * Drops inline numeric citation markers and a trailing Fonti/Sources link list.
 * Holds at most ~200 characters when the tail could still be a marker, so the
 * rest of the text is not delayed. `[2024]` and `[Reuters](url)` stay.
 */
export function createCitationStripper(): CitationStripper {
  let pending = '';

  const drain = (final: boolean): string => {
    const decision = analyzeFonti(pending, final);
    const main = decision.kind === 'none' ? pending : pending.slice(0, decision.index);
    const suffix = decision.kind === 'hold' ? pending.slice(decision.index) : '';
    const stripped = stripCitations(main, final || decision.kind !== 'none');
    pending = stripped.hold + suffix;
    return stripped.emit;
  };

  return {
    push(text: string) {
      if (text.length === 0) return '';
      pending += text;
      return drain(false);
    },
    flush() {
      return drain(true);
    },
  };
}

/** Re-emit upstream Responses SSE as status / delta / error / done.
 *  Does not buffer the body. Cancelling this stream cancels `upstream`.
 *  The opening status chunk is enqueued in `start`, before any upstream read.
 *  The upstream body is read only from `pull`, after that chunk has been taken
 *  and after a short yield, so the status is not stuck behind the first model event.
 */
export function toClientSse(
  upstream: ReadableStream<Uint8Array>,
  options: ClientSseOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  const stripper = createCitationStripper();
  let failed: { code: string; message: string } | null = null;
  let clientGone = false;
  let finished = false;
  let lastPhase: StatusPhase | null = null;
  let sentDelta = false;
  let pumping = false;
  const reader = upstream.getReader();

  const enqueue = (controller: ReadableStreamDefaultController<Uint8Array>, bytes: Uint8Array): void => {
    if (clientGone) return;
    try {
      controller.enqueue(bytes);
    } catch {
      clientGone = true;
    }
  };

  const emitPhase = (controller: ReadableStreamDefaultController<Uint8Array>, phase: StatusPhase | null): void => {
    if (sentDelta || clientGone || phase === null || phase === lastPhase) return;
    lastPhase = phase;
    enqueue(controller, encodeSse(encoder, 'status', { phase }));
  };

  const emitDelta = (controller: ReadableStreamDefaultController<Uint8Array>, text: string): void => {
    if (text.length === 0 || clientGone) return;
    enqueue(controller, encodeSse(encoder, 'delta', { text }));
    sentDelta = true;
  };

  const consume = (controller: ReadableStreamDefaultController<Uint8Array>, raw: string): void => {
    const block = parseSseBlock(raw);
    if (!block || clientGone) return;
    const type = isRecord(block.data) && typeof block.data.type === 'string' ? block.data.type : '';
    const name = block.event || type;
    if (options.debugEvents) logDebugEvent(name, block.data);
    emitPhase(controller, statusPhaseFor(name, block.data));
    if (!failed && (name === 'response.output_text.delta' || type === 'response.output_text.delta')) {
      const delta = isRecord(block.data) ? block.data.delta : undefined;
      if (typeof delta === 'string' && delta.length > 0) emitDelta(controller, stripper.push(delta));
    }
    if (name === 'response.failed' || name === 'error' || type === 'response.failed' || type === 'error') {
      failed = { code: safeErrorCode(block.data), message: UPSTREAM_MESSAGE };
    }
  };

  const pushChunk = (controller: ReadableStreamDefaultController<Uint8Array>, value: Uint8Array): void => {
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const raw = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      consume(controller, raw);
      if (clientGone) return;
      sep = buffer.indexOf('\n\n');
    }
  };

  const finish = (controller: ReadableStreamDefaultController<Uint8Array>): void => {
    if (finished) return;
    finished = true;
    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, '\n');
    if (buffer.trim()) consume(controller, buffer);
    if (clientGone) return;
    emitDelta(controller, stripper.flush());
    if (failed) enqueue(controller, encodeSse(encoder, 'error', failed));
    if (clientGone) return;
    enqueue(controller, encodeSse(encoder, 'done', {}));
    if (clientGone) return;
    try {
      controller.close();
    } catch {
      /* already closed */
    }
  };

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        lastPhase = 'thinking';
        controller.enqueue(encodeSse(encoder, 'status', { phase: 'thinking' }));
      },
      async pull(controller) {
        if (clientGone || finished || pumping) return;
        pumping = true;
        await yieldForFlush();
        if (clientGone || finished) return;
        try {
          while (!clientGone) {
            const { done, value } = await reader.read();
            if (clientGone) return;
            if (done) {
              finish(controller);
              return;
            }
            if (value) pushChunk(controller, value);
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
    },
    new CountQueuingStrategy({ highWaterMark: 1 }),
  );
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
  const denied = requireAppToken(env, tokenHeader);
  if (denied) return denied;

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
    return new Response(toClientSse(upstream.body, { debugEvents: env.XAI_DEBUG_EVENTS === '1' }), {
      status: 200,
      headers: SSE_HEADERS,
    });
  } catch {
    return jsonBody(502, 'upstream', UPSTREAM_MESSAGE);
  }
}

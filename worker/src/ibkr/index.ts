import type { Env } from '../env';
import type { FetchImpl } from '../wallets/types';

import { parseFlexEnvelope, parseFlexStatement, type IbkrCash, type IbkrPosition } from './parse';

export type { IbkrCash, IbkrPosition } from './parse';

const SEND_URL = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest';
const USER_AGENT = 'folio-worker/0.1';
const KV_KEY = 'ibkr:positions:v1';
const KV_FAIL_KEY = 'ibkr:positions:fail';
/** Flex statements change once a day; refetch at most every 8h. */
export const IBKR_FRESH_MS = 8 * 3_600_000;
/** Keep the last good statement for a week so errors can serve stale data. */
const KV_KEEP_SEC = 7 * 86_400;
/** After an upstream failure, serve stale without retrying for 10 minutes. */
const FAIL_BACKOFF_SEC = 600;
/** Codes that mean "not ready yet / try again shortly". */
const RETRYABLE = new Set(['1001', '1004', '1009', '1018', '1019']);
const DEFAULT_DELAYS_MS = [1_500, 3_000, 5_000, 8_000, 12_000];

export type PositionsResponse = {
  source: 'ibkr';
  /** Statement date (`YYYY-MM-DD`): values are end-of-day marks for that day. */
  asOf: string | null;
  /** When IBKR generated the statement (IBKR server time, no zone). */
  generatedAt: string | null;
  /** When the Worker fetched it (ISO, UTC). */
  fetchedAt: string;
  /** True when served from cache after a failed refresh. */
  stale: boolean;
  /** Assumed account base currency (Flex reports amounts × `fxRateToBase`). */
  baseCurrency: 'EUR';
  positions: IbkrPosition[];
  cash: IbkrCash[];
  totalValueBase: number;
};

export class FlexError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'FlexError';
  }
}

export type FlexDeps = {
  fetch: FetchImpl;
  now: () => number;
  sleep?: (ms: number) => Promise<void>;
  delaysMs?: number[];
};

async function getText(fetchImpl: FetchImpl, url: string): Promise<string> {
  const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml' } });
  if (!res.ok) throw new FlexError(`Flex HTTP ${res.status}`, null, res.status >= 500 || res.status === 429);
  return res.text();
}

/** Two-step Flex Web Service fetch. Returns the raw statement XML (never logged). */
export async function fetchFlexStatement(token: string, queryId: string, deps: FlexDeps): Promise<string> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const delays = deps.delaysMs ?? DEFAULT_DELAYS_MS;
  const t = encodeURIComponent(token);

  const sent = parseFlexEnvelope(await getText(deps.fetch, `${SEND_URL}?t=${t}&q=${encodeURIComponent(queryId)}&v=3`));
  if (sent.status !== 'Success' || !sent.reference) {
    throw new FlexError(`Flex SendRequest failed${sent.code ? ` (${sent.code})` : ''}`, sent.code, RETRYABLE.has(sent.code ?? ''));
  }
  const base = sent.url && /^https:\/\/[a-z0-9.-]+\.interactivebrokers\.com\//i.test(sent.url) ? sent.url : SEND_URL.replace('SendRequest', 'GetStatement');
  const getUrl = `${base}?t=${t}&q=${encodeURIComponent(sent.reference)}&v=3`;

  let lastCode: string | null = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) await sleep(delays[attempt - 1]!);
    const body = await getText(deps.fetch, getUrl);
    if (/<FlexQueryResponse[\s>]/.test(body)) return body;
    const env = parseFlexEnvelope(body);
    lastCode = env.code;
    if (!RETRYABLE.has(env.code ?? '')) {
      throw new FlexError(`Flex GetStatement failed${env.code ? ` (${env.code})` : ''}`, env.code);
    }
  }
  throw new FlexError(`Flex statement not ready${lastCode ? ` (${lastCode})` : ''}`, lastCode, true);
}

export function buildPositionsResponse(xml: string, fetchedAtMs: number): PositionsResponse {
  const parsed = parseFlexStatement(xml);
  const total = parsed.positions.reduce((s, p) => s + p.valueBase, 0);
  return {
    source: 'ibkr',
    asOf: parsed.asOf,
    generatedAt: parsed.generatedAt,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    stale: false,
    baseCurrency: 'EUR',
    positions: parsed.positions,
    cash: parsed.cash,
    totalValueBase: Math.round(total * 100) / 100,
  };
}

type Cached = { fetchedAtMs: number; data: PositionsResponse };

async function readCache(kv: KVNamespace | undefined): Promise<Cached | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(KV_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

let inflight: Promise<PositionsResponse> | null = null;

/**
 * Cached positions: fresh KV copy (<8h) → served as is; otherwise refetch from Flex.
 * On a failed refresh the last good copy is returned with `stale: true`.
 */
export async function getPositions(env: Env, deps: FlexDeps): Promise<PositionsResponse> {
  const token = env.IBKR_FLEX_TOKEN;
  const queryId = env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) throw new FlexError('ibkr_not_configured', 'not_configured');
  const kv = env.XAI_AUTH as KVNamespace | undefined;
  const now = deps.now();

  const cached = await readCache(kv);
  if (cached && now - cached.fetchedAtMs < IBKR_FRESH_MS) return { ...cached.data, stale: false };
  if (cached && kv && (await kv.get(KV_FAIL_KEY).catch(() => null))) return { ...cached.data, stale: true };

  if (!inflight) {
    inflight = (async () => {
      const xml = await fetchFlexStatement(token, queryId, deps);
      const data = buildPositionsResponse(xml, deps.now());
      await kv?.put(KV_KEY, JSON.stringify({ fetchedAtMs: deps.now(), data } satisfies Cached), { expirationTtl: KV_KEEP_SEC });
      return data;
    })().finally(() => {
      inflight = null;
    });
  }
  try {
    return await inflight;
  } catch (e) {
    if (!cached) throw e;
    await kv?.put(KV_FAIL_KEY, '1', { expirationTtl: FAIL_BACKOFF_SEC }).catch(() => undefined);
    return { ...cached.data, stale: true };
  }
}

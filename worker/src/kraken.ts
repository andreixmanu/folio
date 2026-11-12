import type { RangeSpec, TimeRange } from './ranges';
import { RANGE_SPECS } from './ranges';
import { KRAKEN_EUR_PAIRS, pickResult, type SupportedSymbol } from './symbols';

export const KRAKEN_BASE = 'https://api.kraken.com/0/public';

/** Raw Kraken ticker entry (strings, as returned by the API). */
export type KrakenTicker = {
  a: [string, string, string];
  b: [string, string, string];
  c: [string, string];
  v: [string, string];
  p: [string, string];
  t: [number, number];
  l: [string, string];
  h: [string, string];
  /** Today's opening price (since 00:00 UTC). */
  o: string;
};

/** [time, open, high, low, close, vwap, volume, count] */
export type KrakenCandle = [number, string, string, string, string, string, string, number];

export type KrakenResponse<T> = { error: string[]; result?: T };

export type Quote = {
  symbol: SupportedSymbol;
  pair: string;
  price: number;
  /** Change vs today's open (00:00 UTC), in percent. */
  changePct: number;
  open: number;
  high24h: number;
  low24h: number;
  volume24h: number;
};

export type HistoryPoint = { t: number; close: number };
export type Series = { symbol: SupportedSymbol; points: HistoryPoint[] };

export class KrakenError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'KrakenError';
  }
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function unwrap<T>(body: KrakenResponse<T>): T {
  if (body.error && body.error.length > 0) throw new KrakenError(`Kraken: ${body.error.join(', ')}`);
  if (!body.result) throw new KrakenError('Kraken: empty result');
  return body.result;
}

/** Normalizes a Ticker `result` into quotes, in the order of `symbols`. Missing pairs go to `missing`. */
export function normalizeTicker(
  result: Record<string, KrakenTicker>,
  symbols: SupportedSymbol[],
): { quotes: Quote[]; missing: SupportedSymbol[] } {
  const quotes: Quote[] = [];
  const missing: SupportedSymbol[] = [];
  for (const symbol of symbols) {
    const t = pickResult(result, symbol);
    const price = num(t?.c?.[0]);
    if (!t || !Number.isFinite(price)) {
      missing.push(symbol);
      continue;
    }
    const open = num(t.o);
    quotes.push({
      symbol,
      pair: KRAKEN_EUR_PAIRS[symbol].pair,
      price,
      open,
      changePct: Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : 0,
      high24h: num(t.h[1]),
      low24h: num(t.l[1]),
      volume24h: num(t.v[1]),
    });
  }
  return { quotes, missing };
}

/** Normalizes an OHLC `result` (single pair) into close points within the range window. */
export function normalizeOhlc(
  result: Record<string, KrakenCandle[] | number>,
  symbol: SupportedSymbol,
  spec: RangeSpec,
  nowSec: number,
): HistoryPoint[] {
  const candles = pickResult(result, symbol);
  if (!Array.isArray(candles)) return [];
  const from = spec.windowSec === null ? -Infinity : nowSec - spec.windowSec;
  return candles
    .filter((c) => c[0] >= from)
    .map((c) => ({ t: c[0], close: num(c[4]) }))
    .filter((p) => Number.isFinite(p.close));
}

export type Fetcher = (url: string) => Promise<unknown>;

export function tickerUrl(symbols: SupportedSymbol[]): string {
  return `${KRAKEN_BASE}/Ticker?pair=${symbols.map((s) => KRAKEN_EUR_PAIRS[s].pair).join(',')}`;
}

export function ohlcUrl(symbol: SupportedSymbol, range: TimeRange, nowSec: number): string {
  const spec = RANGE_SPECS[range];
  const since = spec.windowSec === null ? '' : `&since=${nowSec - spec.windowSec - spec.interval * 60}`;
  return `${KRAKEN_BASE}/OHLC?pair=${KRAKEN_EUR_PAIRS[symbol].pair}&interval=${spec.interval}${since}`;
}

export async function fetchQuotes(fetchJson: Fetcher, symbols: SupportedSymbol[]) {
  if (symbols.length === 0) return { quotes: [], missing: [] as SupportedSymbol[] };
  const body = (await fetchJson(tickerUrl(symbols))) as KrakenResponse<Record<string, KrakenTicker>>;
  return normalizeTicker(unwrap(body), symbols);
}

export async function fetchSeries(
  fetchJson: Fetcher,
  symbol: SupportedSymbol,
  range: TimeRange,
  nowSec: number,
): Promise<Series> {
  const body = (await fetchJson(ohlcUrl(symbol, range, nowSec))) as KrakenResponse<
    Record<string, KrakenCandle[] | number>
  >;
  return { symbol, points: normalizeOhlc(unwrap(body), symbol, RANGE_SPECS[range], nowSec) };
}

import { getAppToken } from '../auth/token';
import { ApiError, getJson } from '../api/client';
import { resolveApiBaseUrl } from '../api/config';
import type { Position, PriceQuote, PriceSeries, Source } from '../types';

/** One row of `GET /positions` (IBKR Flex Open Positions, read-only). */
export type IbkrPosition = {
  symbol: string;
  description: string;
  isin: string | null;
  conid: string | null;
  currency: string;
  assetCategory: string;
  subCategory: string | null;
  listingExchange: string | null;
  quantity: number;
  markPrice: number;
  positionValue: number;
  costBasisPrice: number | null;
  costBasisMoney: number | null;
  fxRateToBase: number;
  unrealizedPnl: number | null;
  valueBase: number;
  markPriceBase: number;
  reportDate: string | null;
};

export type IbkrPositionsResponse = {
  source: 'ibkr';
  /** Statement date `YYYY-MM-DD`: end-of-day marks. */
  asOf: string | null;
  generatedAt: string | null;
  fetchedAt: string;
  stale: boolean;
  baseCurrency: 'EUR';
  positions: IbkrPosition[];
  cash: { currency: string; amount: number; amountBase: number | null }[];
  totalValueBase: number;
};

export const IBKR_SOURCE: Source = {
  id: 'ibkr',
  name: 'Interactive Brokers',
  kind: 'broker',
  detail: 'Flex Query · sola lettura',
};

export async function fetchIbkrPositions(signal?: AbortSignal): Promise<IbkrPositionsResponse> {
  const base = resolveApiBaseUrl();
  if (!base) throw new ApiError('API non configurata (EXPO_PUBLIC_API_URL)');
  return getJson<IbkrPositionsResponse>(`${base}/positions`, {
    signal,
    // Flex can need a few retries server-side while IBKR generates the statement.
    timeoutMs: 45_000,
    headers: { 'X-Folio-Token': await getAppToken() },
  });
}

/** Stocks/ETFs only (Flex `STK`); options, futures etc. are not modelled yet. */
function tradable(p: IbkrPosition): boolean {
  return p.assetCategory === 'STK' && p.quantity !== 0;
}

/** Stable row id: conid, or symbol-currency when Interactive Brokers omitted the conid. */
function keyOf(p: IbkrPosition): string {
  return p.conid ?? `${p.symbol}-${p.currency}`;
}

/** Price key: conid, else ISIN, else exchange + currency + symbol. */
export function instrumentKey(
  p: Pick<IbkrPosition, 'conid' | 'isin' | 'symbol' | 'listingExchange' | 'currency'>,
): string {
  if (p.conid) return `c:${p.conid}`;
  if (p.isin) return `i:${p.isin}`;
  return `x:${p.listingExchange ?? ''}:${p.currency}:${p.symbol}`;
}

export function mapIbkrToPositions(res: IbkrPositionsResponse): Position[] {
  return res.positions.filter(tradable).map((p) => ({
    id: `ibkr-${keyOf(p).toLowerCase()}`,
    sourceId: 'ibkr',
    symbol: p.symbol,
    name: prettyName(p.description, p.symbol),
    assetClass: 'stocks' as const,
    instrument: (p.subCategory ?? '').toUpperCase() === 'ETF' ? ('etf' as const) : ('stock' as const),
    instrumentId: instrumentKey(p),
    quantity: p.quantity,
  }));
}

/**
 * EUR quotes from the statement marks (`markPrice × fxRateToBase`). Flex has no intraday
 * change, so `changePct` is 0 until a stock price feed exists.
 */
export function ibkrQuotes(res: IbkrPositionsResponse): PriceQuote[] {
  const quotes: PriceQuote[] = [];
  for (const p of res.positions.filter(tradable)) {
    const price = p.markPriceBase || (p.quantity ? p.valueBase / p.quantity : 0);
    quotes.push({ symbol: p.symbol, instrumentId: instrumentKey(p), price, changePct: 0 });
  }
  return quotes;
}

/**
 * No historical stock prices yet: each IBKR symbol is a flat series at its last mark from
 * `startMs` to `endMs` (pass 0 as start to span whatever window the crypto series define).
 */
export function ibkrFlatSeries(res: IbkrPositionsResponse, startMs: number, endMs: number): PriceSeries[] {
  return ibkrQuotes(res).map((q) => ({
    symbol: q.symbol,
    ...(q.instrumentId ? { instrumentId: q.instrumentId } : {}),
    points: endMs > startMs ? [{ t: startMs, close: q.price }, { t: endMs, close: q.price }] : [{ t: startMs, close: q.price }],
  }));
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** `2026-11-16` → `16 nov` (adds the year when it differs from `now`). */
export function formatAsOf(asOf: string | null, now: Date = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf ?? '');
  if (!m) return null;
  const [, y, mo, d] = m;
  const label = `${Number(d)} ${MONTHS[Number(mo) - 1]}`;
  return Number(y) === now.getFullYear() ? label : `${label} ${y}`;
}

/** Source row for the holdings card: "Flex Query · aggiornato al 16 nov". */
export function ibkrSource(res: IbkrPositionsResponse | undefined, now?: Date): Source {
  const when = formatAsOf(res?.asOf ?? null, now);
  return when ? { ...IBKR_SOURCE, detail: `Flex Query · aggiornato al ${when}` } : IBKR_SOURCE;
}

export function ibkrStatusNote(res: IbkrPositionsResponse | undefined, isError: boolean): string | null {
  if (isError) return 'IBKR non raggiungibile · riprova';
  if (res?.stale) return 'IBKR: dati dell’ultimo estratto disponibile';
  return null;
}

/** "X NASDAQ 100 1C" stays as is; all-caps long names become Title Case. */
export function prettyName(description: string, symbol: string): string {
  const d = description.trim();
  if (!d) return symbol;
  if (d !== d.toUpperCase() || d.length <= 4) return d;
  return d
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (/^(etf|ucits|usd|eur|acc|dist|plc|ag|sa|spa|nv|inc|\d+\w*)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

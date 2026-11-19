import { RANGE_SPECS } from './ranges';
import type {
  Holding,
  PortfolioSnapshot,
  Position,
  PriceQuote,
  PriceSeries,
  Source,
  TimeRange,
  ValueHistory,
  ValuePoint,
} from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Quote lookup key. An instrument id beats the ticker when two lines share a symbol. */
function priceKey(row: { symbol: string; instrumentId?: string }): string {
  return row.instrumentId ?? row.symbol;
}

/**
 * Today's euro move for one holding: `value − value / (1 + changePct/100)`.
 * That is `quantity × (last − previous)` when `changePct` is `(last − previous) / previous`.
 * A change of −100% or worse has no finite previous price.
 * Portfolio percent is the summed euro move divided by `(total − move)`, the previous value.
 * Crypto `changePct` is versus today's 00:00 UTC open. Stocks are 0 until a price feed exists.
 * This is not the 1D chart, which is the last 24 hours of candles.
 */
function dayDelta(value: number, changePct: number): number {
  const factor = 1 + changePct / 100;
  if (!(factor > 0) || !Number.isFinite(value)) return 0;
  return value - value / factor;
}

/** Values positions with the given quotes. Unpriced positions are excluded and listed. */
export function buildSnapshot(
  sources: Source[],
  positions: Position[],
  quotes: PriceQuote[],
  updatedAt: string,
): PortfolioSnapshot {
  const byKey = new Map(quotes.map((q) => [priceKey(q), q]));
  const holdings: Holding[] = [];
  const unpriced: string[] = [];
  for (const p of positions) {
    const q = byKey.get(priceKey(p));
    if (!q) {
      if (!unpriced.includes(p.symbol)) unpriced.push(p.symbol);
      continue;
    }
    holdings.push({ ...p, price: q.price, changePct: q.changePct, value: round2(p.quantity * q.price) });
  }
  const totalValue = round2(holdings.reduce((s, h) => s + h.value, 0));
  const dayChange = round2(holdings.reduce((s, h) => s + dayDelta(h.value, h.changePct), 0));
  const base = totalValue - dayChange;
  return {
    baseCurrency: 'EUR',
    totalValue,
    dayChange,
    dayChangePct: base > 0 ? (dayChange / base) * 100 : 0,
    sources,
    holdings,
    unpriced,
    updatedAt,
  };
}

/** Last close at or before `t` (forward fill). Assumes ascending points. */
function closeAt(series: PriceSeries, t: number): number | undefined {
  const pts = series.points;
  let lo = 0;
  let hi = pts.length - 1;
  let found: number | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.t <= t) {
      found = pts[mid]!.close;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Euro and percent move from the first point through `endIndex`.
 * `change = end − start`, `percent = change / start`. A zero or negative start has no percent.
 * The chart scrub uses the touched index; the hero chip uses the last index.
 */
export function valueChange(
  points: readonly ValuePoint[],
  endIndex = points.length - 1,
): { start: number; end: number; change: number; changePct: number } {
  if (points.length === 0) return { start: 0, end: 0, change: 0, changePct: 0 };
  const endAt = Math.min(points.length - 1, Math.max(0, endIndex));
  const start = points[0]!.value;
  const end = points[endAt]!.value;
  const change = round2(end - start);
  const changePct = start > 0 ? (change / start) * 100 : 0;
  return { start, end, change, changePct };
}

/** Time span the stock flat-line and any missing-history marks share with crypto. */
export function historyWindow(
  cryptoSeries: readonly PriceSeries[],
  liveT: number,
  range: TimeRange,
): { start: number; end: number } {
  const cryptoEnd = Math.max(0, ...cryptoSeries.map((s) => s.points.at(-1)?.t ?? 0));
  const end = Math.max(cryptoEnd, liveT);
  const spec = RANGE_SPECS[range];
  const start = cryptoEnd > 0 ? 0 : end > 0 ? end - (spec.points - 1) * spec.intervalMin * 60_000 : 0;
  return { start, end };
}

/**
 * Holdings with a live quote but no candles (a failed history, a new listing with no
 * candles yet) stay in the total as a flat mark. Same rule as IBKR: no past price means
 * no assumed move, and the euro amount is not a fake deposit of the whole position.
 */
export function flatMarkSeries(
  positions: readonly Position[],
  quotes: readonly PriceQuote[],
  existing: readonly PriceSeries[],
  startMs: number,
  endMs: number,
): PriceSeries[] {
  if (!(endMs > startMs)) return [];
  const have = new Set(existing.filter((s) => s.points.length > 0).map((s) => priceKey(s)));
  const byKey = new Map(quotes.map((q) => [priceKey(q), q]));
  const out: PriceSeries[] = [];
  const seen = new Set<string>();
  for (const p of positions) {
    const key = priceKey(p);
    if (p.quantity === 0 || have.has(key) || seen.has(key)) continue;
    const q = byKey.get(key);
    if (!q || !(q.price > 0)) continue;
    seen.add(key);
    out.push({
      symbol: p.symbol,
      ...(p.instrumentId ? { instrumentId: p.instrumentId } : {}),
      points: [
        { t: startMs, close: q.price },
        { t: endMs, close: q.price },
      ],
    });
  }
  return out;
}

/**
 * Pin the chart to the live total only when that total and the series are the same holdings.
 * Otherwise the last point would jump by the whole value of anything present on only one side.
 */
export function selectHistoryLive(
  positions: readonly Position[],
  series: readonly PriceSeries[],
  quotes: readonly PriceQuote[],
  live: { t: number; value: number } | undefined,
): { t: number; value: number } | undefined {
  if (!live || !(live.t > 0) || !(live.value > 0)) return undefined;
  const seriesKeys = new Set(series.filter((s) => s.points.length > 0).map((s) => priceKey(s)));
  const quoteKeys = new Set(quotes.filter((q) => q.price > 0).map((q) => priceKey(q)));
  if (seriesKeys.size === 0) return undefined;
  for (const p of positions) {
    if (p.quantity === 0) continue;
    const key = priceKey(p);
    if (quoteKeys.has(key) && !seriesKeys.has(key)) return undefined;
  }
  for (const key of seriesKeys) {
    const held = positions.some((p) => p.quantity !== 0 && priceKey(p) === key);
    if (held && !quoteKeys.has(key)) return undefined;
  }
  return live;
}

/**
 * One path for the hero chart. Values are EUR: Kraken EUR closes for crypto, IBKR
 * `markPriceBase` (statement `fxRateToBase`) for stocks. Quantities are today's.
 * There is no cash-flow ledger, so a deposit is not added and a withdrawal is not
 * subtracted — the euro change is the price move of the current bag. The window
 * starts when every series has a price, so a later listing does not look like a buy at 0.
 */
export function assembleValueHistory(args: {
  positions: readonly Position[];
  cryptoSeries: readonly PriceSeries[];
  stockSeries: readonly PriceSeries[];
  quotes: readonly PriceQuote[];
  range: TimeRange;
  live?: { t: number; value: number };
}): ValueHistory {
  const { start, end } = historyWindow(args.cryptoSeries, args.live?.t ?? 0, args.range);
  const base = [...args.cryptoSeries, ...args.stockSeries];
  const series = [...base, ...flatMarkSeries(args.positions, args.quotes, base, start, end)];
  return buildValueHistory(
    args.positions,
    series,
    args.range,
    selectHistoryLive(args.positions, series, args.quotes, args.live),
  );
}

/**
 * Portfolio value over time = current quantities × historical prices (no trade history).
 * Uses the densest series as the time axis, limited to the window where every held
 * symbol has data (so e.g. SOL's later listing doesn't distort `ALL`). If `live` is given,
 * it is appended as the latest point so the chart ends at the live total.
 */
export function buildValueHistory(
  positions: readonly Position[],
  series: readonly PriceSeries[],
  range: TimeRange,
  live?: { t: number; value: number },
): ValueHistory {
  const qty = new Map<string, number>();
  for (const p of positions) {
    const key = priceKey(p);
    qty.set(key, (qty.get(key) ?? 0) + p.quantity);
  }
  const usable = series.filter((s) => qty.has(priceKey(s)) && s.points.length > 0);

  let points: ValuePoint[] = [];
  if (usable.length > 0) {
    const start = Math.max(...usable.map((s) => s.points[0]!.t));
    const axis = usable
      .reduce((a, b) => (b.points.length > a.points.length ? b : a))
      .points.map((p) => p.t)
      .filter((t) => t >= start);
    points = axis.map((t) => ({
      timestamp: t,
      value: round2(
        usable.reduce((sum, s) => sum + (closeAt(s, t) ?? 0) * (qty.get(priceKey(s)) ?? 0), 0),
      ),
    }));
  }
  if (live && live.value > 0) {
    const last = points[points.length - 1];
    if (!last || live.t > last.timestamp) points.push({ timestamp: live.t, value: round2(live.value) });
    else last.value = round2(live.value);
  }
  const { change, changePct } = valueChange(points);
  return { range, points, change, changePct };
}

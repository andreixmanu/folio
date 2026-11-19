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

/** Today's move for one holding. A change of −100% or worse has no finite previous price. */
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
 * Portfolio value over time = current quantities × historical prices (no trade history).
 * Uses the densest series as the time axis, limited to the window where every held
 * symbol has data (so e.g. SOL's later listing doesn't distort `ALL`). If `live` is given,
 * it is appended as the latest point so the chart ends at the live total.
 */
export function buildValueHistory(
  positions: Position[],
  series: PriceSeries[],
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
  const first = points[0]?.value ?? 0;
  const lastValue = points[points.length - 1]?.value ?? 0;
  return {
    range,
    points,
    change: round2(lastValue - first),
    changePct: first > 0 ? ((lastValue - first) / first) * 100 : 0,
  };
}

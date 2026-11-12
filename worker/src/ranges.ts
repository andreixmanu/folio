export type TimeRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';
export const TIME_RANGES: readonly TimeRange[] = ['1D', '1W', '1M', '1Y', 'ALL'];

export type RangeSpec = {
  /** Kraken OHLC interval in minutes. */
  interval: 15 | 60 | 240 | 1440 | 10080;
  /** Window length in seconds (`null` = all available history). */
  windowSec: number | null;
  /** How long to cache OHLC for this range (seconds). */
  ttlSec: number;
};

const DAY = 86_400;

/**
 * Kraken returns at most 720 candles per request, so every range must fit:
 * 1D 15m (96) · 1W 1h (168) · 1M 4h (~180) · 1Y 1d (365) · ALL 1w (≤720 ≈ 13.8 years).
 */
export const RANGE_SPECS: Record<TimeRange, RangeSpec> = {
  '1D': { interval: 15, windowSec: DAY, ttlSec: 60 },
  '1W': { interval: 60, windowSec: 7 * DAY, ttlSec: 300 },
  '1M': { interval: 240, windowSec: 30 * DAY, ttlSec: 900 },
  '1Y': { interval: 1440, windowSec: 365 * DAY, ttlSec: 3600 },
  ALL: { interval: 10080, windowSec: null, ttlSec: 6 * 3600 },
};

export function parseRange(raw: string | undefined | null): TimeRange | null {
  const r = (raw ?? '').toUpperCase();
  if (r === 'TUTTO' || r === 'MAX') return 'ALL';
  return (TIME_RANGES as readonly string[]).includes(r) ? (r as TimeRange) : null;
}

export function candleCount(range: TimeRange): number | null {
  const spec = RANGE_SPECS[range];
  return spec.windowSec === null ? null : Math.ceil(spec.windowSec / (spec.interval * 60));
}

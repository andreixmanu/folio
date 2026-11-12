import type { TimeRange } from './types';

/** Mirrors the Worker's range specs (Kraken OHLC intervals that fit in 720 candles). */
export const RANGE_SPECS: Record<TimeRange, { intervalMin: number; points: number; staleMs: number }> = {
  '1D': { intervalMin: 15, points: 96, staleMs: 60_000 },
  '1W': { intervalMin: 60, points: 168, staleMs: 5 * 60_000 },
  '1M': { intervalMin: 240, points: 180, staleMs: 15 * 60_000 },
  '1Y': { intervalMin: 1440, points: 365, staleMs: 60 * 60_000 },
  ALL: { intervalMin: 10080, points: 260, staleMs: 6 * 60 * 60_000 },
};

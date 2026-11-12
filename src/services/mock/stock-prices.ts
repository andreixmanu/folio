import { createRandom } from '@/lib/random';

import { RANGE_SPECS } from '../ranges';
import type { PriceSeries, PriceSource, TimeRange } from '../types';

/** MOCK stock/ETF quotes in EUR (IBKR is not connected yet). */
const STOCK_QUOTES: Record<string, { price: number; changePct: number; seed: number }> = {
  VWCE: { price: 132.86, changePct: 0.42, seed: 3 },
  CSPX: { price: 612.4, changePct: 0.61, seed: 5 },
  NVDA: { price: 171.22, changePct: 2.34, seed: 7 },
  AAPL: { price: 218.05, changePct: -0.87, seed: 11 },
  MSFT: { price: 431.9, changePct: 0.18, seed: 13 },
};

/** Total relative growth over each window, to keep mock stock curves plausible. */
const DRIFT: Record<TimeRange, number> = { '1D': 0.004, '1W': 0.012, '1M': 0.03, '1Y': 0.16, ALL: 0.7 };
const VOL: Record<TimeRange, number> = { '1D': 0.0015, '1W': 0.003, '1M': 0.006, '1Y': 0.012, ALL: 0.02 };

/** Deterministic random walk ending exactly at `end`, on Kraken-aligned timestamps. */
export function mockSeries(symbol: string, end: number, range: TimeRange, nowMs: number): PriceSeries {
  const spec = RANGE_SPECS[range];
  const step = spec.intervalMin * 60_000;
  const lastT = Math.floor(nowMs / step) * step;
  const rand = createRandom((STOCK_QUOTES[symbol]?.seed ?? 1) * 97 + spec.points);
  const start = end / (1 + DRIFT[range]);
  let noise = 0;
  const points = Array.from({ length: spec.points }, (_, i) => {
    const k = i / (spec.points - 1);
    noise = (noise + (rand() - 0.5) * VOL[range] * 2) * 0.94;
    const close = i === spec.points - 1 ? end : start + (end - start) * k + start * noise;
    return { t: lastT - (spec.points - 1 - i) * step, close };
  });
  return { symbol, points };
}

export const mockStockPriceSource: PriceSource = {
  id: 'mock-stocks',
  async getQuotes(symbols) {
    const quotes = symbols.flatMap((s) => {
      const q = STOCK_QUOTES[s];
      return q ? [{ symbol: s, price: q.price, changePct: q.changePct }] : [];
    });
    return {
      source: 'mock-stocks',
      quotes,
      unsupported: symbols.filter((s) => !STOCK_QUOTES[s]),
      updatedAt: new Date().toISOString(),
    };
  },
  async getHistory(symbols, range) {
    const now = Date.now();
    return {
      source: 'mock-stocks',
      range,
      series: symbols.filter((s) => STOCK_QUOTES[s]).map((s) => mockSeries(s, STOCK_QUOTES[s]!.price, range, now)),
      unsupported: symbols.filter((s) => !STOCK_QUOTES[s]),
    };
  },
};

import { allocationByAsset, allocationByClass, allocationBySource } from '@/services/allocation';
import { buildSnapshot, buildValueHistory } from '@/services/portfolio';
import { withFallback } from '@/services/prices/fallback';
import { TANGEM_SOURCE } from '@/services/sources';
import type { Position, PriceQuote, PriceSeries, PriceSource } from '@/services/types';
import { darkColors } from '@/theme/colors';

import { FIXTURE_IBKR_POSITIONS, FIXTURE_STOCK_QUOTES, IBKR_SOURCE } from '../test/fixtures/ibkr';

const CRYPTO_POSITIONS: Position[] = [
  { id: 'tangem-btc', sourceId: 'tangem', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', instrument: 'coin', quantity: 0.4215 },
  { id: 'tangem-eth', sourceId: 'tangem', symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', instrument: 'coin', quantity: 3.82 },
];

const SOURCES = [IBKR_SOURCE, TANGEM_SOURCE];
const POSITIONS = [...FIXTURE_IBKR_POSITIONS, ...CRYPTO_POSITIONS];

const CRYPTO: PriceQuote[] = [
  { symbol: 'BTC', price: 64_815.1, changePct: -2.6 },
  { symbol: 'ETH', price: 1_812.26, changePct: -2.1 },
];

async function snapshot() {
  return buildSnapshot(SOURCES, POSITIONS, [...CRYPTO, ...FIXTURE_STOCK_QUOTES], '2026-11-12T16:00:00Z');
}

describe('buildSnapshot', () => {
  test('values positions with quotes and sums the total', async () => {
    const s = await snapshot();
    const btc = s.holdings.filter((h) => h.symbol === 'BTC');
    expect(btc).toHaveLength(1);
    expect(btc[0]!.value).toBeCloseTo(0.4215 * 64_815.1, 1);
    expect(s.totalValue).toBeCloseTo(s.holdings.reduce((a, h) => a + h.value, 0), 1);
    expect(s.unpriced).toEqual([]);
  });

  test('excludes and reports positions without a price', () => {
    const s = buildSnapshot(SOURCES, POSITIONS, CRYPTO.slice(0, 1), 'x');
    expect(s.holdings.every((h) => h.symbol === 'BTC')).toBe(true);
    expect(s.unpriced).toEqual(expect.arrayContaining(['ETH', 'VWCE']));
  });

  test('contains no cash positions', async () => {
    const s = await snapshot();
    expect([...new Set(s.holdings.map((h) => h.assetClass))].sort()).toEqual(['crypto', 'stocks']);
  });
});

describe('buildValueHistory', () => {
  const positions = CRYPTO_POSITIONS;
  const series: PriceSeries[] = [
    { symbol: 'BTC', points: [1, 2, 3, 4].map((t) => ({ t, close: 100 * t })) },
    { symbol: 'ETH', points: [{ t: 2, close: 10 }, { t: 4, close: 20 }] },
  ];

  test('quantities × historical closes over the common window', () => {
    const h = buildValueHistory(positions, series, '1M');
    expect(h.points.map((p) => p.timestamp)).toEqual([2, 3, 4]);
    expect(h.points[0]!.value).toBeCloseTo(0.4215 * 200 + 3.82 * 10, 1);
    expect(h.points[1]!.value).toBeCloseTo(0.4215 * 300 + 3.82 * 10, 1);
    expect(h.change).toBeCloseTo(h.points[2]!.value - h.points[0]!.value, 1);
  });

  test('pins the last point to the live total', () => {
    const h = buildValueHistory(positions, series, '1M', { t: 5, value: 999 });
    expect(h.points.at(-1)).toEqual({ timestamp: 5, value: 999 });
  });
});

describe('allocation', () => {
  test('by class, asset and source', async () => {
    const s = await snapshot();
    const byClass = allocationByClass(s.holdings, darkColors);
    expect(byClass.map((x) => x.key).sort()).toEqual(['crypto', 'stocks']);
    expect(byClass.reduce((a, x) => a + x.percent, 0)).toBeCloseTo(100, 5);
    const btc = allocationByAsset(s.holdings, darkColors, 20).find((x) => x.key === 'BTC');
    expect(btc?.value).toBeCloseTo(s.holdings.filter((h) => h.symbol === 'BTC').reduce((a, h) => a + h.value, 0), 2);
    const bySource = allocationBySource(s.holdings, s.sources, () => '#000');
    expect(bySource.reduce((a, x) => a + x.value, 0)).toBeCloseTo(s.totalValue, 1);
  });
});

describe('withFallback', () => {
  const source = (id: string, prices: Record<string, number>): PriceSource => ({
    id,
    async getQuotes(symbols) {
      return {
        source: id,
        updatedAt: 'now',
        quotes: symbols.filter((s) => s in prices).map((s) => ({ symbol: s, price: prices[s]!, changePct: 0 })),
        unsupported: symbols.filter((s) => !(s in prices)),
      };
    },
    async getHistory(symbols, range) {
      return { source: id, range, series: [], unsupported: symbols.filter((s) => !(s in prices)) };
    },
  });

  test('asks the fallback only for symbols the primary cannot price', async () => {
    const fallback = source('openmarket', { HYPE: 30 });
    const spy = jest.spyOn(fallback, 'getQuotes');
    const combined = withFallback(source('kraken', { BTC: 1 }), fallback);
    const r = await combined.getQuotes(['BTC', 'HYPE', 'NOPE']);
    expect(r.quotes.map((q) => q.symbol)).toEqual(['BTC', 'HYPE']);
    expect(r.unsupported).toEqual(['NOPE']);
    expect(spy).toHaveBeenCalledWith(['HYPE', 'NOPE'], undefined);
  });
});

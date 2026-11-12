import { allocationByAsset, allocationByClass, allocationBySource } from '@/services/allocation';
import { buildMockHistory, buildMockSnapshot } from '@/services/mock/portfolio';
import { TIME_RANGES } from '@/services/types';
import { darkColors } from '@/theme/colors';

describe('mock portfolio data layer', () => {
  const snapshot = buildMockSnapshot(new Date('2026-01-01T00:00:00Z'));

  test('total equals the sum of holdings', () => {
    const sum = snapshot.holdings.reduce((s, h) => s + h.value, 0);
    expect(snapshot.totalValue).toBeCloseTo(sum, 1);
    expect(snapshot.sources.map((s) => s.id)).toEqual(['ibkr', 'ledger', 'metamask', 'binance']);
  });

  test.each(TIME_RANGES)('history for %s ends at the current total', (range) => {
    const history = buildMockHistory(range, snapshot.totalValue, 0);
    expect(history.points.length).toBeGreaterThan(20);
    expect(history.points.at(-1)?.value).toBeCloseTo(snapshot.totalValue, 1);
    expect(history.changePct).toBeGreaterThan(0);
  });

  test('allocation by class sums to 100% and covers stocks and crypto only', () => {
    const slices = allocationByClass(snapshot.holdings, darkColors);
    expect(slices.map((s) => s.key).sort()).toEqual(['crypto', 'stocks']);
    expect(slices.reduce((s, x) => s + x.percent, 0)).toBeCloseTo(100, 5);
  });

  test('allocation by asset merges the same symbol across sources', () => {
    const slices = allocationByAsset(snapshot.holdings, darkColors, 20);
    const btc = slices.find((s) => s.key === 'BTC');
    const btcHoldings = snapshot.holdings.filter((h) => h.symbol === 'BTC');
    expect(btcHoldings).toHaveLength(2);
    expect(btc?.value).toBeCloseTo(btcHoldings.reduce((s, h) => s + h.value, 0), 2);
  });

  test('mock data contains no cash or stablecoin positions', () => {
    const classes = new Set(snapshot.holdings.map((h) => h.assetClass));
    expect([...classes].sort()).toEqual(['crypto', 'stocks']);
    const symbols = snapshot.holdings.map((h) => h.symbol);
    expect(symbols).not.toContain('EUR');
    expect(symbols).not.toContain('USDC');
  });

  test('allocation by source gives one slice per source summing to the total', () => {
    const slices = allocationBySource(snapshot.holdings, snapshot.sources, () => '#000');
    expect(slices).toHaveLength(snapshot.sources.length);
    expect(slices.reduce((s, x) => s + x.value, 0)).toBeCloseTo(snapshot.totalValue, 1);
  });
});

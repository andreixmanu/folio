import { buildPortfolioContext } from '@/services/chat/context';
import type { PortfolioSnapshot } from '@/services/types';
import { useUiStore } from '@/store/ui-store';

const snapshot: PortfolioSnapshot = {
  baseCurrency: 'EUR',
  totalValue: 1000,
  dayChange: 10,
  dayChangePct: 1,
  unpriced: [],
  updatedAt: '2026-11-13T00:00:00Z',
  sources: [],
  holdings: [
    {
      id: '1',
      sourceId: 'ibkr',
      symbol: 'VWCE',
      name: 'Vanguard FTSE All-World',
      assetClass: 'stocks',
      instrument: 'etf',
      quantity: 2,
      price: 300,
      value: 600,
      changePct: 1.26,
    },
    {
      id: '2',
      sourceId: 'ledger',
      symbol: 'BTC',
      name: 'Bitcoin',
      assetClass: 'crypto',
      instrument: 'coin',
      quantity: 0.4215,
      price: 1000,
      value: 400,
      changePct: -2,
    },
  ],
};

describe('buildPortfolioContext', () => {
  afterEach(() => useUiStore.setState({ hideBalances: false }));

  test('weights sum to about 100 and values are rounded', () => {
    const context = buildPortfolioContext(snapshot, false);
    expect(context.currency).toBe('EUR');
    expect(context.totalValue).toBe(1000);
    expect(context.holdings.map((holding) => holding.weightPct)).toEqual([60, 40]);
    expect(context.holdings.reduce((sum, holding) => sum + holding.weightPct, 0)).toBeCloseTo(100, 5);
    expect(context.holdings[0]).toMatchObject({ symbol: 'VWCE', value: 600, quantity: 2, changePct: 1.26 });
    expect(context.holdings[1]?.quantity).toBeCloseTo(0.4215, 4);
    expect(context.allocation).toEqual([
      { label: 'Azioni & ETF', percent: 60 },
      { label: 'Crypto', percent: 40 },
    ]);
  });

  test('hideBalances strips absolute values and keeps weights', () => {
    const hidden = buildPortfolioContext(snapshot, true);
    expect(hidden.totalValue).toBeUndefined();
    expect(hidden).not.toHaveProperty('totalValue');
    for (const holding of hidden.holdings) {
      expect(holding).not.toHaveProperty('value');
      expect(holding).not.toHaveProperty('quantity');
      expect(typeof holding.weightPct).toBe('number');
    }
    expect(hidden.holdings.reduce((sum, holding) => sum + holding.weightPct, 0)).toBeCloseTo(100, 5);
    const json = JSON.stringify(hidden);
    expect(json).not.toContain('1000');
    expect(json).not.toContain('600');
    expect(json).not.toContain('0.4215');

    useUiStore.setState({ hideBalances: true });
    expect(buildPortfolioContext(snapshot).totalValue).toBeUndefined();
    expect(buildPortfolioContext(snapshot).holdings[0]).not.toHaveProperty('value');
  });
});

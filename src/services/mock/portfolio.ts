import { createRandom } from '@/lib/random';

import type {
  Holding,
  PortfolioDataSource,
  PortfolioSnapshot,
  Source,
  TimeRange,
  ValueHistory,
  ValuePoint,
} from '../types';

const SOURCES: Source[] = [
  { id: 'ibkr', name: 'Interactive Brokers', kind: 'broker', detail: 'Flex Query · U1234567' },
  { id: 'ledger', name: 'Ledger', kind: 'wallet', detail: 'Bitcoin · bc1q…7x2k' },
  { id: 'metamask', name: 'MetaMask', kind: 'wallet', detail: 'Ethereum · 0x3f…a91c' },
  { id: 'binance', name: 'Binance', kind: 'exchange', detail: 'API sola lettura' },
];

type RawHolding = Omit<Holding, 'value'>;

const RAW_HOLDINGS: RawHolding[] = [
  // IBKR
  { id: 'ibkr-vwce', sourceId: 'ibkr', symbol: 'VWCE', name: 'Vanguard FTSE All-World', assetClass: 'stocks', instrument: 'etf', quantity: 310, price: 132.86, changePct: 0.42 },
  { id: 'ibkr-cspx', sourceId: 'ibkr', symbol: 'CSPX', name: 'iShares Core S&P 500', assetClass: 'stocks', instrument: 'etf', quantity: 28, price: 612.4, changePct: 0.61 },
  { id: 'ibkr-nvda', sourceId: 'ibkr', symbol: 'NVDA', name: 'NVIDIA', assetClass: 'stocks', instrument: 'stock', quantity: 64, price: 171.22, changePct: 2.34 },
  { id: 'ibkr-aapl', sourceId: 'ibkr', symbol: 'AAPL', name: 'Apple', assetClass: 'stocks', instrument: 'stock', quantity: 40, price: 218.05, changePct: -0.87 },
  { id: 'ibkr-msft', sourceId: 'ibkr', symbol: 'MSFT', name: 'Microsoft', assetClass: 'stocks', instrument: 'stock', quantity: 22, price: 431.9, changePct: 0.18 },
  // Ledger
  { id: 'ledger-btc', sourceId: 'ledger', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', instrument: 'coin', quantity: 0.4215, price: 88_350, changePct: 1.92 },
  // MetaMask
  { id: 'metamask-eth', sourceId: 'metamask', symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto', instrument: 'coin', quantity: 3.82, price: 3_120.4, changePct: -1.24 },
  // Binance
  { id: 'binance-sol', sourceId: 'binance', symbol: 'SOL', name: 'Solana', assetClass: 'crypto', instrument: 'coin', quantity: 46.5, price: 148.7, changePct: 4.11 },
  { id: 'binance-btc', sourceId: 'binance', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', instrument: 'coin', quantity: 0.085, price: 88_350, changePct: 1.92 },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildMockSnapshot(now: Date = new Date()): PortfolioSnapshot {
  const holdings: Holding[] = RAW_HOLDINGS.map((h) => ({ ...h, value: round2(h.quantity * h.price) }));
  const totalValue = round2(holdings.reduce((sum, h) => sum + h.value, 0));
  const dayChange = round2(
    holdings.reduce((sum, h) => sum + h.value - h.value / (1 + h.changePct / 100), 0),
  );
  const dayChangePct = (dayChange / (totalValue - dayChange)) * 100;
  return {
    baseCurrency: 'EUR',
    totalValue,
    dayChange,
    dayChangePct,
    sources: SOURCES,
    holdings,
    updatedAt: now.toISOString(),
  };
}

const RANGE_CONFIG: Record<TimeRange, { points: number; stepMs: number; drift: number; vol: number; seed: number }> = {
  '1D': { points: 48, stepMs: 30 * 60_000, drift: 0.012, vol: 0.0035, seed: 11 },
  '1W': { points: 56, stepMs: 3 * 3_600_000, drift: 0.021, vol: 0.006, seed: 23 },
  '1M': { points: 60, stepMs: 12 * 3_600_000, drift: 0.046, vol: 0.009, seed: 37 },
  '1Y': { points: 52, stepMs: 7 * 86_400_000, drift: 0.24, vol: 0.022, seed: 51 },
  ALL: { points: 60, stepMs: 30 * 86_400_000, drift: 0.95, vol: 0.035, seed: 73 },
};

/**
 * Deterministic random walk that ends exactly at `endValue`.
 * `drift` is the total relative growth over the window.
 */
export function buildMockHistory(range: TimeRange, endValue: number, now: number = Date.now()): ValueHistory {
  const cfg = RANGE_CONFIG[range];
  const rand = createRandom(cfg.seed);
  const startValue = endValue / (1 + cfg.drift);
  const raw: number[] = [];
  let noise = 0;
  for (let i = 0; i < cfg.points; i++) {
    const t = i / (cfg.points - 1);
    noise += (rand() - 0.5) * cfg.vol * 2;
    noise *= 0.92; // mean reversion keeps the walk near the trend
    raw.push(startValue + (endValue - startValue) * t + startValue * noise);
  }
  // Pin both ends so the chart change matches the reported numbers.
  raw[0] = startValue;
  raw[raw.length - 1] = endValue;

  const points: ValuePoint[] = raw.map((value, i) => ({
    timestamp: now - (cfg.points - 1 - i) * cfg.stepMs,
    value: round2(value),
  }));
  const first = points[0]!.value;
  const last = points[points.length - 1]!.value;
  return { range, points, change: round2(last - first), changePct: ((last - first) / first) * 100 };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockPortfolioSource: PortfolioDataSource = {
  async getSnapshot() {
    await delay(350);
    return buildMockSnapshot();
  },
  async getValueHistory(range) {
    await delay(150);
    return buildMockHistory(range, buildMockSnapshot().totalValue);
  },
};

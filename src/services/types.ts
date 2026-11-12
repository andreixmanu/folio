/**
 * Domain types shared by the UI and every data source.
 * Phase 1 uses mock implementations; later phases plug in the Cloudflare Worker
 * (IBKR Flex Query, on-chain wallets, exchange read-only APIs, RSS proxy).
 */

export type TimeRange = '1D' | '1W' | '1M' | '1Y' | 'ALL';
export const TIME_RANGES: readonly TimeRange[] = ['1D', '1W', '1M', '1Y', 'ALL'];

/**
 * Asset classes tracked by the app. Cash is intentionally excluded (it lives on Revolut).
 * To add it later: extend this union (e.g. `| 'cash'`), add a label in `allocation.ts`
 * and a color in `theme/colors.ts` (`assetClass`); TypeScript will flag every place to update.
 */
export type AssetClass = 'stocks' | 'crypto';

/** `bank` is reserved for a future bank/Revolut source (balances, income/expenses). */
export type SourceKind = 'broker' | 'wallet' | 'exchange' | 'bank';

export type Source = {
  id: string;
  name: string;
  kind: SourceKind;
  /** e.g. "Flex Query", "Ethereum · 0x12…ab", "API sola lettura" */
  detail: string;
};

export type Holding = {
  id: string;
  sourceId: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** Finer instrument type, for display only. */
  instrument: 'stock' | 'etf' | 'coin';
  quantity: number;
  /** Last price in the portfolio base currency. */
  price: number;
  /** Market value in the portfolio base currency. */
  value: number;
  /** 24h / daily change in percent. */
  changePct: number;
};

export type PortfolioSnapshot = {
  baseCurrency: 'EUR';
  totalValue: number;
  /** Daily change in base currency and percent. */
  dayChange: number;
  dayChangePct: number;
  sources: Source[];
  holdings: Holding[];
  updatedAt: string;
};

export type ValuePoint = {
  timestamp: number;
  value: number;
};

export type ValueHistory = {
  range: TimeRange;
  points: ValuePoint[];
  change: number;
  changePct: number;
};

export type AllocationSlice = {
  key: string;
  label: string;
  value: number;
  /** 0..100 */
  percent: number;
  color: string;
};

export type NewsCategory = 'markets' | 'crypto';

export type NewsArticle = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  category: NewsCategory;
  publishedAt: string;
};

/** Contract every portfolio data source must implement (mock now, Worker later). */
export interface PortfolioDataSource {
  getSnapshot(): Promise<PortfolioSnapshot>;
  getValueHistory(range: TimeRange): Promise<ValueHistory>;
}

export interface NewsDataSource {
  getArticles(category?: NewsCategory): Promise<NewsArticle[]>;
}

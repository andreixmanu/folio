/**
 * Domain types shared by the UI and every data source.
 * Crypto quantities come from the Tangem wallet (`/wallets`); stocks/ETFs come from IBKR Flex (`/positions`).
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
  /** e.g. "Flex Query", "Bitcoin · Ethereum · sola lettura" */
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
  /** Disambiguates two listings of the same ticker (conid, ISIN, or venue). */
  instrumentId?: string;
  /** Last price in the portfolio base currency. */
  price: number;
  /** Market value in the portfolio base currency. */
  value: number;
  /** 24h / daily change in percent. */
  changePct: number;
};

export type PortfolioSnapshot = {
  baseCurrency: 'EUR';
  /** Positions that could not be priced by any source (excluded from totals). */
  unpriced: string[];
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
  /** Set for per-asset slices: the asset symbol & class (used to show its logo). */
  asset?: { symbol: string; assetClass: AssetClass };
};

export type NewsCategory = 'mercati' | 'crypto' | 'italia';

export type NewsArticle = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  imageUrl?: string;
  category: NewsCategory;
  publishedAt: string;
};

/** A position without market data: what you hold and where (quantities only). */
export type Position = Omit<Holding, 'price' | 'value' | 'changePct'>;

/** Where positions come from (IBKR Flex + Tangem wallet today). */
export interface PositionsSource {
  getSources(): Promise<Source[]>;
  getPositions(): Promise<Position[]>;
}

export type PriceQuote = {
  symbol: string;
  /** When set, this quote prices only the position with the same id. */
  instrumentId?: string;
  /** Last price in EUR. */
  price: number;
  /** Daily change in percent (crypto: vs today's 00:00 UTC open on Kraken). */
  changePct: number;
};

export type QuotesResult = {
  source: string;
  quotes: PriceQuote[];
  /** Symbols this source could not price (candidates for a fallback source). */
  unsupported: string[];
  updatedAt: string;
};

export type PriceSeries = {
  symbol: string;
  /** Same key as `PriceQuote.instrumentId` when one symbol has two listings. */
  instrumentId?: string;
  /** Close prices; `t` in milliseconds since epoch, ascending. */
  points: { t: number; close: number }[];
};

export type HistoryResult = {
  source: string;
  range: TimeRange;
  series: PriceSeries[];
  unsupported: string[];
};

/**
 * Contract for any price provider (Kraken via the Worker today; OpenMarket or others as
 * fallbacks later, see `withFallback`).
 */
export interface PriceSource {
  readonly id: string;
  getQuotes(symbols: string[], signal?: AbortSignal): Promise<QuotesResult>;
  getHistory(symbols: string[], range: TimeRange, signal?: AbortSignal): Promise<HistoryResult>;
}

export interface NewsDataSource {
  getArticles(category?: NewsCategory, signal?: AbortSignal): Promise<NewsArticle[]>;
}

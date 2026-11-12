import { resolveApiBaseUrl } from './api/config';
import { mockNewsSource } from './mock/news';
import { mockPositionsSource } from './mock/positions';
import { mockStockPriceSource } from './mock/stock-prices';
import { createWorkerPriceSource } from './prices/worker-source';
import type { AssetClass, NewsDataSource, PositionsSource, PriceSource } from './types';

/**
 * Single switch point for data sources.
 * - Positions: MOCK (IBKR Flex Query and wallets later).
 * - Crypto prices: REAL, Kraken via the Folio Worker. To add a fallback for coins Kraken
 *   doesn't list: `withFallback(createWorkerPriceSource(url), openMarketSource)`.
 * - Stock prices: MOCK until IBKR is connected.
 */
export const apiBaseUrl = resolveApiBaseUrl();
export const positionsSource: PositionsSource = mockPositionsSource;
export const priceSources: Record<AssetClass, PriceSource> = {
  crypto: createWorkerPriceSource(apiBaseUrl),
  stocks: mockStockPriceSource,
};
export const newsSource: NewsDataSource = mockNewsSource;

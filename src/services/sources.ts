import { resolveApiBaseUrl } from './api/config';
import { MOCK_POSITIONS, MOCK_SOURCES } from './mock/positions';
import { mockStockPriceSource } from './mock/stock-prices';
import { workerNewsSource } from './news/worker-source';
import { createWorkerPriceSource } from './prices/worker-source';
import type { AssetClass, NewsDataSource, PositionsSource, PriceSource, Source } from './types';
import { fetchWallets, mapWalletsToPositions, type WalletsResponse } from './wallets';

/**
 * Single switch point for data sources.
 * - Positions: MOCK IBKR stocks + read-only Tangem crypto (`/wallets`).
 * - Crypto prices: REAL, Kraken via the Folio Worker. To add a fallback for coins Kraken
 *   doesn't list: `withFallback(createWorkerPriceSource(url), openMarketSource)`.
 * - Stock prices: MOCK until IBKR is connected.
 * - News: REAL RSS/Atom headlines via the Worker (`GET /news`).
 */
export const apiBaseUrl = resolveApiBaseUrl();

export const TANGEM_SOURCE: Source = {
  id: 'tangem',
  name: 'Tangem',
  kind: 'wallet',
  detail: 'Bitcoin · Ethereum · sola lettura',
};

export function createCompositePositionsSource(loadWallets: () => Promise<WalletsResponse>): PositionsSource {
  return {
    async getSources() {
      return [...MOCK_SOURCES, TANGEM_SOURCE];
    },
    async getPositions() {
      try {
        const wallets = await loadWallets();
        return [...MOCK_POSITIONS, ...mapWalletsToPositions(wallets)];
      } catch {
        return [...MOCK_POSITIONS];
      }
    },
  };
}

export const positionsSource: PositionsSource = createCompositePositionsSource(fetchWallets);
export const priceSources: Record<AssetClass, PriceSource> = {
  crypto: createWorkerPriceSource(apiBaseUrl),
  stocks: mockStockPriceSource,
};
export const newsSource: NewsDataSource = workerNewsSource;

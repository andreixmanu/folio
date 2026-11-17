import { resolveApiBaseUrl } from './api/config';
import { IBKR_SOURCE } from './ibkr';
import { workerNewsSource } from './news/worker-source';
import { createWorkerPriceSource } from './prices/worker-source';
import type { NewsDataSource, PriceSource, Source } from './types';

/**
 * Single switch point for data sources.
 * - Positions: IBKR stocks/ETFs from the Flex Web Service (`GET /positions`, end-of-day,
 *   read-only) + read-only Tangem crypto (`/wallets`).
 * - Crypto prices: REAL, Kraken via the Folio Worker. To add a fallback for coins Kraken
 *   doesn't list: `withFallback(createWorkerPriceSource(url), openMarketSource)`.
 * - Stock prices: IBKR statement marks (EUR via `fxRateToBase`), no intraday feed yet.
 * - News: REAL RSS/Atom headlines via the Worker (`GET /news`).
 */
export const apiBaseUrl = resolveApiBaseUrl();

export const TANGEM_SOURCE: Source = {
  id: 'tangem',
  name: 'Tangem',
  kind: 'wallet',
  detail: 'Bitcoin · Ethereum · sola lettura',
};

export const SOURCES: Source[] = [IBKR_SOURCE, TANGEM_SOURCE];

export const priceSources: { crypto: PriceSource } = {
  crypto: createWorkerPriceSource(apiBaseUrl),
};
export const newsSource: NewsDataSource = workerNewsSource;

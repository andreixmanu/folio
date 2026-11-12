import { mockNewsSource } from './mock/news';
import { mockPortfolioSource } from './mock/portfolio';
import type { NewsDataSource, PortfolioDataSource } from './types';

/**
 * Single switch point for data sources.
 * Phase 4/5 will replace these with clients for the Cloudflare Worker API
 * (e.g. `createWorkerPortfolioSource(baseUrl)`), keeping the hooks unchanged.
 */
export const portfolioSource: PortfolioDataSource = mockPortfolioSource;
export const newsSource: NewsDataSource = mockNewsSource;

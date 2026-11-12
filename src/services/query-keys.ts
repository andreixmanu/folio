import type { AssetClass, NewsCategory, TimeRange } from './types';

export const queryKeys = {
  sources: ['positions', 'sources'] as const,
  positions: ['positions', 'list'] as const,
  quotes: (assetClass: AssetClass, symbols: string[]) => ['quotes', assetClass, symbols.join(',')] as const,
  history: (range: TimeRange, symbols: string[]) => ['history', range, symbols.join(',')] as const,
  news: (category: NewsCategory | 'all') => ['news', category] as const,
};

import type { NewsCategory, TimeRange } from './types';

export const queryKeys = {
  portfolio: ['portfolio', 'snapshot'] as const,
  history: (range: TimeRange) => ['portfolio', 'history', range] as const,
  news: (category: NewsCategory | 'all') => ['news', category] as const,
};

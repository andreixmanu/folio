import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from './query-keys';
import { newsSource, portfolioSource } from './sources';
import type { NewsCategory, TimeRange } from './types';

export function usePortfolio() {
  return useQuery({
    queryKey: queryKeys.portfolio,
    queryFn: () => portfolioSource.getSnapshot(),
    staleTime: 60_000,
  });
}

export function useValueHistory(range: TimeRange) {
  return useQuery({
    queryKey: queryKeys.history(range),
    queryFn: () => portfolioSource.getValueHistory(range),
    staleTime: 60_000,
    // Keep the previous chart on screen while a new range loads, so switching is seamless.
    placeholderData: keepPreviousData,
  });
}

export function useNews(category: NewsCategory | 'all') {
  return useQuery({
    queryKey: queryKeys.news(category),
    queryFn: () => newsSource.getArticles(category === 'all' ? undefined : category),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

import { ApiError, getJson } from '../api/client';
import { resolveApiBaseUrl } from '../api/config';
import type { NewsArticle, NewsCategory, NewsDataSource } from '../types';

type WorkerNewsItem = {
  id: string;
  title: string;
  link: string;
  source: string;
  category: NewsCategory;
  publishedAt: string;
  summary?: string;
  imageUrl?: string;
};

type WorkerNewsResponse = {
  updatedAt: string;
  items: WorkerNewsItem[];
};

/** Headlines from the Folio Worker (`GET /news`), which aggregates RSS/Atom feeds. */
export function createWorkerNewsSource(baseUrl: string | null): NewsDataSource {
  return {
    async getArticles(category, signal) {
      if (!baseUrl) throw new ApiError('API non configurata (EXPO_PUBLIC_API_URL)');
      const query = category ? `?category=${encodeURIComponent(category)}` : '';
      const body = await getJson<WorkerNewsResponse>(`${baseUrl}/news${query}`, { signal, timeoutMs: 12_000 });
      return (body.items ?? []).flatMap((item) => {
        if (!item.title || !item.link) return [];
        return [
          {
            id: item.id,
            title: item.title,
            summary: item.summary ?? '',
            source: item.source,
            url: item.link,
            category: item.category,
            publishedAt: item.publishedAt,
            ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
          } satisfies NewsArticle,
        ];
      });
    },
  };
}

/** Resolves the API base URL on each call so dev/test env changes are picked up. */
export const workerNewsSource: NewsDataSource = {
  getArticles(category, signal) {
    return createWorkerNewsSource(resolveApiBaseUrl()).getArticles(category, signal);
  },
};

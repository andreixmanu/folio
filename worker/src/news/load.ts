import type { FetchImpl } from '../wallets/types';
import { TtlCache } from '../cache';
import { FEEDS, type NewsCategory, type NewsFeed } from './feeds';
import { normalizeItems, type NewsItem } from './normalize';
import { decodeFeedBytes, looksLikeFeed, parseFeedXml, type RawFeedItem } from './parse';

export const NEWS_TTL_MS = 10 * 60 * 1000;
export const NEWS_CACHE_CONTROL = 'public, max-age=600';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 2_000_000;

export const NEWS_USER_AGENT = 'Mozilla/5.0 (compatible; FolioNews/0.1; +https://github.com/andreixmanu/folio)';
export const NEWS_ACCEPT = 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8';

export type FeedStatus = {
  id: string;
  source: string;
  category: NewsCategory;
  ok: boolean;
  count: number;
  error?: string;
};

export type NewsAggregate = {
  updatedAt: string;
  items: NewsItem[];
  feeds: FeedStatus[];
};

type FeedCacheValue = {
  ok: boolean;
  error?: string;
  items: RawFeedItem[];
};

export type LoadNewsOptions = {
  fetchImpl: FetchImpl;
  now: number;
  timeoutMs?: number;
  maxBytes?: number;
  feeds?: readonly NewsFeed[];
};

/**
 * One cached aggregate for every category. Per-feed entries are cached too, so a
 * slow outlet does not have to be fetched again when the aggregate refreshes.
 * Concurrent callers share the in-flight load (see `TtlCache`).
 */
export function loadNews(cache: TtlCache, opts: LoadNewsOptions): Promise<NewsAggregate> {
  const feeds = opts.feeds ?? FEEDS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  return cache.get('news:aggregate', NEWS_TTL_MS, async () => {
    const settled = await Promise.allSettled(
      feeds.map((feed) =>
        cache.get(`news:feed:${feed.id}`, NEWS_TTL_MS, () => fetchFeed(feed, opts.fetchImpl, timeoutMs, maxBytes)),
      ),
    );
    const groups: { feed: NewsFeed; items: RawFeedItem[] }[] = [];
    const statuses: FeedStatus[] = [];
    for (let i = 0; i < feeds.length; i++) {
      const feed = feeds[i];
      const result = settled[i];
      if (!feed || !result) continue;
      if (result.status === 'rejected') {
        statuses.push({ id: feed.id, source: feed.source, category: feed.category, ok: false, count: 0, error: 'fetch_error' });
        groups.push({ feed, items: [] });
        continue;
      }
      const value = result.value;
      statuses.push({
        id: feed.id,
        source: feed.source,
        category: feed.category,
        ok: value.ok,
        count: value.items.length,
        ...(value.ok ? {} : { error: value.error ?? 'fetch_error' }),
      });
      groups.push({ feed, items: value.ok ? value.items : [] });
    }
    return {
      updatedAt: new Date(opts.now).toISOString(),
      items: normalizeItems(groups, opts.now),
      feeds: statuses,
    };
  });
}

async function fetchFeed(feed: NewsFeed, fetchImpl: FetchImpl, timeoutMs: number, maxBytes: number): Promise<FeedCacheValue> {
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const res = await new Promise<Response>((resolve, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        const err = new Error('timeout');
        err.name = 'AbortError';
        reject(err);
      }, timeoutMs);
      fetchImpl(feed.url, {
        signal: ctrl.signal,
        headers: { Accept: NEWS_ACCEPT, 'User-Agent': NEWS_USER_AGENT },
      }).then(
        (value) => {
          if (timer) clearTimeout(timer);
          resolve(value);
        },
        (err: unknown) => {
          if (timer) clearTimeout(timer);
          reject(err);
        },
      );
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}`, items: [] };
    const declared = Number(res.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, error: 'fetch_error', items: [] };
    const bytes = await readCapped(res, maxBytes);
    const xml = decodeFeedBytes(bytes, res.headers.get('content-type'));
    let items: RawFeedItem[];
    try {
      items = parseFeedXml(xml);
    } catch {
      return { ok: false, error: 'parse', items: [] };
    }
    if (items.length === 0 && !looksLikeFeed(xml)) return { ok: false, error: 'parse', items: [] };
    return { ok: true, items };
  } catch (err) {
    if (ctrl.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { ok: false, error: 'timeout', items: [] };
    }
    return { ok: false, error: 'fetch_error', items: [] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error('too_large');
    return buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('too_large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

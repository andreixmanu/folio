import { describe, expect, test, vi } from 'vitest';

import { createApp } from '../src/app';
import { TtlCache } from '../src/cache';
import { FEEDS } from '../src/news/feeds';
import { NEWS_ACCEPT, NEWS_USER_AGENT } from '../src/news/load';
import type { FetchImpl } from '../src/wallets/types';

const NOW = Date.parse('2026-11-16T12:00:00.000Z');
const PUB = 'Mon, 16 Nov 2026 09:00:00 GMT';

function rss(title: string, link: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><item><title>${title}</title><link>${link}</link><pubDate>${PUB}</pubDate><description>Desk note for ${title}</description></item></channel></rss>`;
}

function xmlResponse(body: string, status = 200, headers?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', ...headers },
  });
}

type NewsBody = {
  updatedAt: string;
  items: { id: string; title: string; link: string; source: string; category: string; summary: string }[];
  feeds: { id: string; source: string; category: string; ok: boolean; count: number; error?: string }[];
};

describe('GET /news', () => {
  test('aggregates feeds, sets cache headers, filters category, and ignores extra params', async () => {
    const fetchImpl = vi.fn<FetchImpl>(async (input) => {
      const url = String(input);
      const feed = FEEDS.find((item) => item.url === url);
      if (!feed) return xmlResponse('<html>nope</html>', 404);
      return xmlResponse(rss(`${feed.id} headline`, `https://example.com/${feed.id}`));
    });
    const app = createApp({ fetch: fetchImpl, now: () => NOW, cache: new TtlCache(() => NOW) });

    const res = await app.request('/news');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=600');
    const body = (await res.json()) as NewsBody;
    expect(body.updatedAt).toBe('2026-11-16T12:00:00.000Z');
    expect(body.items).toHaveLength(FEEDS.length);
    expect(body.feeds).toHaveLength(FEEDS.length);
    expect(body.feeds.every((feed) => feed.ok && feed.count === 1 && feed.error === undefined)).toBe(true);
    expect(new Set(body.items.map((item) => item.category))).toEqual(new Set(['mercati', 'crypto', 'italia']));

    const calls = fetchImpl.mock.calls.length;
    expect(calls).toBe(FEEDS.length);
    const firstCall = fetchImpl.mock.calls[0]?.[1];
    expect(firstCall?.headers).toMatchObject({ Accept: NEWS_ACCEPT, 'User-Agent': NEWS_USER_AGENT });
    expect(fetchImpl.mock.calls.map((call) => String(call[0])).sort()).toEqual(FEEDS.map((feed) => feed.url).sort());

    const again = await app.request('/news?bust=1&cb=99');
    expect(again.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(calls);

    const crypto = await app.request('/news?category=crypto');
    const cryptoBody = (await crypto.json()) as NewsBody;
    expect(crypto.headers.get('cache-control')).toBe('public, max-age=600');
    expect(cryptoBody.items.length).toBeGreaterThan(0);
    expect(cryptoBody.items.every((item) => item.category === 'crypto')).toBe(true);
    expect(cryptoBody.items.some((item) => item.source === 'CoinDesk')).toBe(true);
    expect(cryptoBody.items.some((item) => item.category === 'italia')).toBe(false);
    expect(cryptoBody.updatedAt).toBe(body.updatedAt);
    expect(fetchImpl).toHaveBeenCalledTimes(calls);

    expect((await app.request('/news?category=markets')).status).toBe(400);
    expect((await app.request('/news?category=nope')).status).toBe(400);
    expect((await app.request('/news?category=')).status).toBe(400);
    expect(fetchImpl).toHaveBeenCalledTimes(calls);
  });

  test('concurrent requests fetch each feed once', async () => {
    let started = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      started += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      const feed = FEEDS.find((item) => item.url === String(input));
      return xmlResponse(rss(`${feed?.id ?? 'x'} headline`, `https://example.com/${feed?.id ?? 'x'}`));
    });
    const app = createApp({ fetch: fetchImpl, now: () => NOW, cache: new TtlCache(() => NOW) });
    const [a, b] = await Promise.all([app.request('/news'), app.request('/news?category=italia')]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(started).toBe(FEEDS.length);
    expect(fetchImpl).toHaveBeenCalledTimes(FEEDS.length);
    const italia = (await b.json()) as NewsBody;
    expect(italia.items.every((item) => item.category === 'italia')).toBe(true);
  });

  test('partial failure is still 200 with a short error code per feed', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const feed = FEEDS.find((item) => item.url === url);
      if (!feed) return xmlResponse('missing', 404);
      if (feed.id === 'ft-markets') return xmlResponse('forbidden', 403);
      if (feed.id === 'marketwatch') return xmlResponse('<html><title>nope</title></html>', 200);
      if (feed.id === 'coindesk') {
        return new Promise<Response>((_resolve, reject) => {
          const timer = setTimeout(() => _resolve(xmlResponse(rss('late', 'https://example.com/late'))), 400);
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return xmlResponse(rss(`${feed.id} headline`, `https://example.com/${feed.id}`));
    });
    const app = createApp({
      fetch: fetchImpl,
      now: () => NOW,
      cache: new TtlCache(() => NOW),
      newsTimeoutMs: 40,
    });
    const res = await app.request('/news');
    expect(res.status).toBe(200);
    const body = (await res.json()) as NewsBody;
    const byId = Object.fromEntries(body.feeds.map((feed) => [feed.id, feed]));
    expect(byId['ft-markets']).toMatchObject({ ok: false, count: 0, error: 'http_403' });
    expect(byId['marketwatch']).toMatchObject({ ok: false, count: 0, error: 'parse' });
    expect(byId['coindesk']).toMatchObject({ ok: false, count: 0, error: 'timeout' });
    expect(byId['cnbc-markets']?.ok).toBe(true);
    expect(body.items.some((item) => item.link.includes('ft-markets'))).toBe(false);
    expect(body.items.some((item) => item.source === 'CNBC')).toBe(true);
  });

  test('aborts a feed that exceeds the size cap', async () => {
    const fetchImpl = vi.fn(async () => xmlResponse(rss('Big', 'https://example.com/big'), 200, { 'content-length': '50' }));
    const only = FEEDS[0];
    if (!only) throw new Error('missing feed');
    const app = createApp({
      fetch: fetchImpl,
      now: () => NOW,
      cache: new TtlCache(() => NOW),
      newsFeeds: [only],
      newsMaxBytes: 20,
    });
    const body = (await (await app.request('/news')).json()) as NewsBody;
    expect(body.feeds[0]).toMatchObject({ id: only.id, ok: false, error: 'fetch_error', count: 0 });
    expect(body.items).toEqual([]);
  });
});

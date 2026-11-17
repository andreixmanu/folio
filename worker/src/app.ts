import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { requireAppToken } from './auth';
import { registerBankRoutes, type BankDeps } from './banking/routes';
import { TtlCache } from './cache';
import { handleChat } from './chat';
import type { Env } from './env';
import { fetchQuotes, fetchSeries, KrakenError, type Fetcher } from './kraken';
import { defaultFetchLogo, logoUrl, normalizeLogoSymbol, type BinaryFetcher } from './logos';
import { isNewsCategory, type NewsFeed } from './news/feeds';
import { loadNews, NEWS_CACHE_CONTROL } from './news/load';
import { parseRange, RANGE_SPECS } from './ranges';
import { parseSymbols } from './symbols';
import { getWalletsResponse } from './wallets';
import type { FetchImpl } from './wallets/types';
import type { XaiFetcher } from './xai-auth';

const TICKER_TTL_SEC = 30;
const LOGO_TTL_SEC = 7 * 86_400;
const LOGO_MISS_TTL_SEC = 86_400;

export type AppDeps = {
  fetchJson?: Fetcher;
  now?: () => number;
  cache?: TtlCache;
  fetchLogo?: BinaryFetcher;
  /** xAI token refresh and `POST /v1/responses`. Tests inject this so nothing hits the network. */
  fetchUpstream?: XaiFetcher;
  sleep?: (ms: number) => Promise<void>;
  /** Injected in tests so wallet/Kraken/news calls never hit the network. */
  fetch?: FetchImpl;
  chainTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** Per-feed RSS timeout. Default 5s. */
  newsTimeoutMs?: number;
  /** Max bytes read from one feed. Default 2 MB. */
  newsMaxBytes?: number;
  /** Override the built-in feed list (tests). */
  newsFeeds?: readonly NewsFeed[];
  /** Open-banking provider/store overrides (tests). */
  bank?: BankDeps;
};

async function defaultFetchJson(url: string, fetchImpl: FetchImpl): Promise<unknown> {
  const res = await fetchImpl(url, { headers: { 'User-Agent': 'folio-worker/0.1' } });
  if (!res.ok) throw new KrakenError(`Kraken HTTP ${res.status}`, res.status >= 500 ? 502 : 500);
  return res.json();
}

export function createApp(deps: AppDeps = {}) {
  const now = deps.now ?? (() => Date.now());
  const cache = deps.cache ?? new TtlCache(now);
  const fetchImpl: FetchImpl = deps.fetch ?? fetch;
  const rawFetch = deps.fetchJson ?? ((url: string) => defaultFetchJson(url, fetchImpl));
  const fetchLogo = deps.fetchLogo ?? defaultFetchLogo;
  const fetchUpstream = deps.fetchUpstream;
  const sleep = deps.sleep;

  const app = new Hono<{ Bindings: Env }>();

  app.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-Folio-Token'],
      maxAge: 86_400,
    }),
  );

  app.onError((err, c) => {
    const status = err instanceof KrakenError ? err.status : 500;
    return c.json({ error: err.message || 'Internal error' }, status as 500);
  });

  app.get('/', (c) =>
    c.json({
      name: 'folio-api',
      endpoints: ['/health', '/prices', '/history', '/logo/:symbol', '/news', '/chat', '/wallets', '/bank/*'],
    }),
  );
  app.get('/health', (c) => c.json({ ok: true, time: new Date(now()).toISOString() }));

  /** GET /prices?symbols=BTC,ETH */
  app.get('/prices', async (c) => {
    const { supported, unsupported } = parseSymbols(c.req.query('symbols'));
    if (supported.length === 0 && unsupported.length === 0) {
      return c.json({ error: 'Missing ?symbols=' }, 400);
    }
    const key = `ticker:${[...supported].sort().join(',')}`;
    const { quotes, missing } = await cache.get(key, TICKER_TTL_SEC * 1000, () =>
      fetchQuotes(rawFetch, supported),
    );
    c.header('Cache-Control', `public, max-age=${TICKER_TTL_SEC}`);
    return c.json({
      currency: 'EUR',
      source: 'kraken',
      updatedAt: new Date(now()).toISOString(),
      quotes,
      unsupported: [...unsupported, ...missing],
    });
  });

  /** GET /history?symbols=BTC,ETH&range=1M */
  app.get('/history', async (c) => {
    const range = parseRange(c.req.query('range') ?? '1M');
    if (!range) return c.json({ error: 'Invalid range (1D, 1W, 1M, 1Y, ALL)' }, 400);
    const { supported, unsupported } = parseSymbols(c.req.query('symbols'));
    if (supported.length === 0 && unsupported.length === 0) {
      return c.json({ error: 'Missing ?symbols=' }, 400);
    }
    const spec = RANGE_SPECS[range];
    const nowSec = Math.floor(now() / 1000);
    const series = await Promise.all(
      supported.map((symbol) =>
        cache.get(`ohlc:${symbol}:${range}`, spec.ttlSec * 1000, () =>
          fetchSeries(rawFetch, symbol, range, nowSec),
        ),
      ),
    );
    c.header('Cache-Control', `public, max-age=${Math.min(spec.ttlSec, 300)}`);
    return c.json({
      currency: 'EUR',
      source: 'kraken',
      range,
      intervalMinutes: spec.interval,
      updatedAt: new Date(now()).toISOString(),
      series,
      unsupported,
    });
  });

  /**
   * GET /news?category=mercati|crypto|italia
   * Public. Category is optional; any other query param is ignored.
   * One cached aggregate is filtered per category. Cache-Control lets the edge
   * cache in `index.ts` store the full URL, query string included.
   */
  app.get('/news', async (c) => {
    const category = c.req.query('category');
    if (category !== undefined && !isNewsCategory(category)) {
      return c.json({ error: 'Invalid category (mercati, crypto, italia)' }, 400);
    }
    const aggregate = await loadNews(cache, {
      fetchImpl,
      now: now(),
      timeoutMs: deps.newsTimeoutMs,
      maxBytes: deps.newsMaxBytes,
      feeds: deps.newsFeeds,
    });
    const items = category ? aggregate.items.filter((item) => item.category === category) : aggregate.items;
    c.header('Cache-Control', NEWS_CACHE_CONTROL);
    return c.json({ updatedAt: aggregate.updatedAt, items, feeds: aggregate.feeds });
  });

  /** GET /logo/AAPL — stock/ETF logo (PNG), cached for a week. */
  app.get('/logo/:symbol', async (c) => {
    const symbol = normalizeLogoSymbol(c.req.param('symbol'));
    if (!symbol) return c.json({ error: 'Invalid symbol' }, 400);
    const logo = await cache.get(`logo:${symbol}`, LOGO_TTL_SEC * 1000, () => fetchLogo(logoUrl(symbol)));
    if (!logo) {
      c.header('Cache-Control', `public, max-age=${LOGO_MISS_TTL_SEC}`);
      return c.json({ error: `No logo for ${symbol}` }, 404);
    }
    return c.body(logo.body, 200, {
      'Content-Type': logo.contentType,
      'Cache-Control': `public, max-age=${LOGO_TTL_SEC}, immutable`,
    });
  });

  /** POST /chat — markets assistant. Auth and upstream calls are injectable via `deps`. */
  app.post('/chat', async (c) => {
    const raw = await c.req.text();
    return handleChat(c.env, c.req.header('X-Folio-Token') ?? '', raw, {
      now,
      fetch: fetchUpstream,
      sleep,
    });
  });

  /** GET /wallets — read-only Tangem balances. Auth matches `/chat`; never returns addresses. */
  app.get('/wallets', async (c) => {
    const denied = requireAppToken(c.env, c.req.header('X-Folio-Token') ?? '');
    if (denied) return denied;
    const body = await getWalletsResponse({
      env: c.env,
      cache,
      fetchJson: rawFetch,
      fetch: fetchImpl,
      now,
      chainTimeoutMs: deps.chainTimeoutMs,
      requestTimeoutMs: deps.requestTimeoutMs,
      debug: c.req.query('debug') === '1',
    });
    c.header('Cache-Control', 'private, max-age=60');
    return c.json(body);
  });

  registerBankRoutes(app, { now, fetch: fetchImpl, ...deps.bank });

  return app;
}

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { TtlCache } from './cache';
import { handleChat } from './chat';
import type { Env } from './env';
import { fetchQuotes, fetchSeries, KrakenError, type Fetcher } from './kraken';
import { defaultFetchLogo, logoUrl, normalizeLogoSymbol, type BinaryFetcher } from './logos';
import { parseRange, RANGE_SPECS } from './ranges';
import { parseSymbols } from './symbols';
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
};

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'User-Agent': 'folio-worker/0.1' } });
  if (!res.ok) throw new KrakenError(`Kraken HTTP ${res.status}`, res.status >= 500 ? 502 : 500);
  return res.json();
}

export function createApp(deps: AppDeps = {}) {
  const now = deps.now ?? (() => Date.now());
  const cache = deps.cache ?? new TtlCache(now);
  const rawFetch = deps.fetchJson ?? defaultFetchJson;
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
    c.json({ name: 'folio-api', endpoints: ['/health', '/prices', '/history', '/logo/:symbol', '/chat'] }),
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

  return app;
}

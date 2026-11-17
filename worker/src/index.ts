import { createApp } from './app';
import type { Env } from './env';

const app = createApp();

/**
 * Edge cache in front of the app (Cache API). In-isolate TTL caching in `createApp`
 * also coalesces upstream Kraken calls. Non-GET (including POST /chat) is never cached.
 * `/wallets`, `/bank/*` and any request carrying `X-Folio-Token` skip the public Cache API so
 * authenticated balances cannot leak to a later unauthenticated GET of the same URL.
 * `GET /news` is public: the cache key is the full request URL, so `?category=` is part of it.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET' || typeof caches === 'undefined') return app.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (url.pathname === '/wallets' || url.pathname.startsWith('/bank/') || request.headers.has('X-Folio-Token')) {
      return app.fetch(request, env, ctx);
    }
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await app.fetch(request, env, ctx);
    if (res.ok && res.headers.has('Cache-Control')) ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  },
} satisfies ExportedHandler<Env>;

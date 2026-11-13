import { createApp } from './app';
import type { Env } from './env';

const app = createApp();

/**
 * Edge cache in front of the app (Cache API). In-isolate TTL caching in `createApp`
 * also coalesces upstream Kraken calls. Non-GET (including POST /chat) is never cached.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'GET' || typeof caches === 'undefined') return app.fetch(request, env, ctx);
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await app.fetch(request, env, ctx);
    if (res.ok && res.headers.has('Cache-Control')) ctx.waitUntil(cache.put(request, res.clone()));
    return res;
  },
} satisfies ExportedHandler<Env>;

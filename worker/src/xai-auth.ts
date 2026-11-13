import type { Env } from './env';
import { XAI_CLIENT_ID, XAI_TOKEN_URL } from './xai-config';

const KEY_REFRESH = 'refresh_token';
const KEY_ACCESS = 'access_token';
const KEY_LOCK = 'refresh_lock';

/** Refresh when the cached access token has this long or less left. */
const REFRESH_SKEW_MS = 60 * 60 * 1000;
const DEFAULT_EXPIRES_SEC = 6 * 60 * 60;
/** KV TTL sits a little past the logical expiry so a late read can still fall back. */
const ACCESS_TTL_SLACK_SEC = 5 * 60;
const LOCK_TTL_SEC = 60;
const LOCK_WAIT_MS = 1000;

export type CachedAccessToken = { token: string; expiresAt: number };

export type XaiFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type XaiAuthDeps = {
  now?: () => number;
  fetch?: XaiFetcher;
  sleep?: (ms: number) => Promise<void>;
};

export class XaiAuthError extends Error {
  constructor(
    readonly code: 'login_required',
    message = 'xAI login required',
  ) {
    super(message);
    this.name = 'XaiAuthError';
  }
}

/**
 * Only https URLs on x.ai (or a subdomain) may be called for auth and the API.
 * Throws on anything else so a bad constant cannot leak the bearer token.
 */
export function assertXaiUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Blocked non-xAI URL');
  }
  const host = parsed.hostname;
  if (parsed.protocol !== 'https:' || (host !== 'x.ai' && !host.endsWith('.x.ai'))) {
    throw new Error('Blocked non-xAI URL');
  }
  return parsed;
}

let inFlight: Promise<string> | null = null;

/** Test hook. Concurrent refreshes in one isolate share `inFlight`. */
export function resetXaiAuthForTests(): void {
  inFlight = null;
}

type ResolvedDeps = {
  now: () => number;
  fetch: XaiFetcher;
  sleep: (ms: number) => Promise<void>;
};

function resolveDeps(deps: XaiAuthDeps): ResolvedDeps {
  return {
    now: deps.now ?? (() => Date.now()),
    fetch: deps.fetch ?? ((url, init) => fetch(url, init)),
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
}

async function readCached(env: Env): Promise<CachedAccessToken | null> {
  const raw = await env.XAI_AUTH.get(KEY_ACCESS);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const rec = parsed as { token?: unknown; expiresAt?: unknown };
    if (typeof rec.token !== 'string' || rec.token.length === 0) return null;
    if (typeof rec.expiresAt !== 'number' || !Number.isFinite(rec.expiresAt)) return null;
    return { token: rec.token, expiresAt: rec.expiresAt };
  } catch {
    return null;
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stillValid(cached: CachedAccessToken | null, nowMs: number): cached is CachedAccessToken {
  return !!cached && cached.expiresAt > nowMs;
}

/**
 * xAI rotates the refresh token on every successful refresh. Persist the new
 * refresh token before the access token so a crash cannot keep the old one.
 */
async function performRefresh(
  env: Env,
  deps: ResolvedDeps,
  cached: CachedAccessToken | null,
): Promise<string> {
  const refreshToken = await env.XAI_AUTH.get(KEY_REFRESH);
  if (!refreshToken) throw new XaiAuthError('login_required');

  assertXaiUrl(XAI_TOKEN_URL);
  let res: Response;
  try {
    res = await deps.fetch(XAI_TOKEN_URL, {
      method: 'POST',
      // workerd rejects redirect:'error'. Refuse 3xx below so we never follow off *.x.ai.
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: XAI_CLIENT_ID,
      }),
    });
  } catch (err) {
    if (stillValid(cached, deps.now())) return cached.token;
    throw err instanceof Error ? err : new Error('xAI token refresh failed');
  }

  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel()?.catch(() => undefined);
    throw new Error('xAI token refresh failed');
  }

  const json = await readJson(res);
  // Dead session: do not keep serving a token we can no longer renew.
  if (json.error === 'invalid_grant') throw new XaiAuthError('login_required');

  const access = json.access_token;
  if (!res.ok || typeof access !== 'string' || access.length === 0) {
    if (stillValid(cached, deps.now())) return cached.token;
    throw new Error('xAI token refresh failed');
  }

  const expiresInSec =
    typeof json.expires_in === 'number' && Number.isFinite(json.expires_in) && json.expires_in > 0
      ? json.expires_in
      : DEFAULT_EXPIRES_SEC;
  const expiresAt = deps.now() + expiresInSec * 1000;

  if (typeof json.refresh_token === 'string' && json.refresh_token.length > 0) {
    await env.XAI_AUTH.put(KEY_REFRESH, json.refresh_token);
  }
  await env.XAI_AUTH.put(KEY_ACCESS, JSON.stringify({ token: access, expiresAt }), {
    expirationTtl: Math.max(60, Math.ceil(expiresInSec) + ACCESS_TTL_SLACK_SEC),
  });
  return access;
}

async function refreshWithLock(
  env: Env,
  deps: ResolvedDeps,
  cached: CachedAccessToken | null,
): Promise<string> {
  const existingLock = await env.XAI_AUTH.get(KEY_LOCK);
  if (existingLock) {
    // Another isolate is refreshing and may already have rotated the refresh token.
    await deps.sleep(LOCK_WAIT_MS);
    const after = await readCached(env);
    if (stillValid(after, deps.now())) return after.token;
  }

  await env.XAI_AUTH.put(KEY_LOCK, '1', { expirationTtl: LOCK_TTL_SEC });
  try {
    return await performRefresh(env, deps, cached);
  } finally {
    try {
      await env.XAI_AUTH.delete(KEY_LOCK);
    } catch {
      // Lock expires on its own (TTL 60s).
    }
  }
}

export async function getAccessToken(env: Env, deps: XaiAuthDeps = {}): Promise<string> {
  if (!env.XAI_AUTH) throw new Error('XAI_AUTH binding missing');
  const resolved = resolveDeps(deps);
  const cached = await readCached(env);
  if (cached && cached.expiresAt - resolved.now() > REFRESH_SKEW_MS) return cached.token;

  if (!inFlight) {
    let run!: Promise<string>;
    run = refreshWithLock(env, resolved, cached).finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
  }
  return inFlight;
}

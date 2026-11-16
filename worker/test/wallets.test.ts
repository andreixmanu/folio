import { describe, expect, test, vi } from 'vitest';

import { createApp } from '../src/app';
import type { Env } from '../src/env';
import { ETH_RPC_ENDPOINTS } from '../src/wallets/ethereum';
import type { FetchImpl, WalletsResponse } from '../src/wallets/types';
import { formatUnits } from '../src/wallets/units';

import { ticker } from './fixtures';

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const APP_TOKEN = 'local-dev-token';
const BTC_ADDRESS = 'bc1qtestaddress000000000000000000000000000';
const ETH_ADDRESS = '0x000000000000000000000000000000000000dEaD';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

function envOf(extra: Partial<Env> = {}): Env {
  return {
    XAI_AUTH: {} as KVNamespace,
    APP_CHAT_TOKEN: APP_TOKEN,
    BTC_ADDRESS,
    ETH_ADDRESS,
    ...extra,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function btcInfo(chainFunded: number, chainSpent: number, memFunded = 0, memSpent = 0) {
  return {
    chain_stats: { funded_txo_sum: chainFunded, spent_txo_sum: chainSpent },
    mempool_stats: { funded_txo_sum: memFunded, spent_txo_sum: memSpent },
  };
}

function krakenTicker(pairs: Record<string, ReturnType<typeof ticker>>) {
  return { error: [], result: pairs };
}

function hang(signal?: AbortSignal | null): Promise<Response> {
  return new Promise((_, reject) => {
    const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (signal?.aborted) fail();
    else signal?.addEventListener('abort', fail, { once: true });
  });
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function ethRpcPayload(
  payload: unknown,
  balances: { eth: string; usdc: string; usdt: string },
): unknown {
  const item = (call: { method?: string; params?: unknown[]; id?: unknown }) => {
    const method = call.method;
    const params = call.params ?? [];
    if (method === 'eth_getBalance') return { jsonrpc: '2.0', id: call.id ?? 1, result: balances.eth };
    if (method === 'eth_call') {
      const to = String((params[0] as { to?: string } | undefined)?.to ?? '');
      const result = to.toLowerCase() === USDC.toLowerCase() ? balances.usdc : balances.usdt;
      return { jsonrpc: '2.0', id: call.id ?? 2, result };
    }
    return { jsonrpc: '2.0', id: call.id ?? 0, error: { code: -32601, message: 'unknown' } };
  };
  if (Array.isArray(payload)) return payload.map((call, i) => item({ ...(call as object), id: i + 1 }));
  return item(payload as { method?: string; params?: unknown[]; id?: unknown });
}

type MockOpts = {
  btc?: { mempool?: unknown | 'hang' | number; blockstream?: unknown | 'hang' | number };
  eth?: {
    balances?: { eth: string; usdc: string; usdt: string };
    rejectBatch?: boolean;
    failEndpoints?: number;
    /** HTTP status for the first `failEndpoints` providers. Default 500. */
    failStatus?: number;
    hangAll?: boolean;
    /** Treat these URLs as ETH RPC endpoints instead of `ETH_RPC_ENDPOINTS`. */
    urls?: string[];
    /** First N endpoints return a JSON-RPC error (HTTP 200). */
    rpcErrorEndpoints?: number;
    /** `element` puts the error on the USDC batch row. `response` returns one error object. */
    rpcErrorOn?: 'element' | 'response';
    rpcErrorCode?: number;
  };
  kraken?: Record<string, ReturnType<typeof ticker>>;
  krakenMissing?: string[];
};

function mockFetch(opts: MockOpts = {}): FetchImpl {
  const balances = opts.eth?.balances ?? { eth: '0x1bc16d674ec80000', usdc: '0x0f4240', usdt: '0x0' };
  const kraken = opts.kraken ?? {
    XXBTZEUR: ticker('60000', '59000'),
    XETHZEUR: ticker('2000', '2100'),
    USDCEUR: ticker('0.92', '0.91'),
    USDTEUR: ticker('0.92', '0.91'),
  };
  const ethUrls = opts.eth?.urls ?? [...ETH_RPC_ENDPOINTS];
  return async (input, init) => {
    const url = urlOf(input);
    if (url.includes('mempool.space')) {
      const m = opts.btc?.mempool;
      if (m === 'hang') return hang(init?.signal);
      if (typeof m === 'number') return jsonResponse({ error: 'no' }, m);
      return jsonResponse(m ?? btcInfo(150_000_000, 50_000_000, 15_000_000, 5_000_000));
    }
    if (url.includes('blockstream.info')) {
      const b = opts.btc?.blockstream;
      if (b === 'hang') return hang(init?.signal);
      if (typeof b === 'number') return jsonResponse({ error: 'no' }, b);
      return jsonResponse(b ?? btcInfo(100_000_000, 0));
    }
    const ethIndex = ethUrls.findIndex((endpoint) => url.startsWith(endpoint));
    if (ethIndex >= 0) {
      if (opts.eth?.hangAll) return hang(init?.signal);
      if (ethIndex < (opts.eth?.failEndpoints ?? 0)) {
        const status = opts.eth?.failStatus ?? 500;
        if (status === 525) return new Response(`upstream ${ETH_ADDRESS}`, { status, headers: { 'Content-Type': 'text/html' } });
        return jsonResponse({ error: 'down' }, status);
      }
      let payload: unknown = undefined;
      if (typeof init?.body === 'string') payload = JSON.parse(init.body);
      if (ethIndex < (opts.eth?.rpcErrorEndpoints ?? 0)) {
        const code = opts.eth?.rpcErrorCode ?? (opts.eth?.rpcErrorOn === 'response' ? -32046 : -32603);
        const error = { code, message: `bad ${ETH_ADDRESS}` };
        if (opts.eth?.rpcErrorOn === 'response' || !Array.isArray(payload)) {
          return jsonResponse({ jsonrpc: '2.0', id: null, error });
        }
        const rows = ethRpcPayload(payload, balances) as Array<Record<string, unknown>>;
        rows[1] = { jsonrpc: '2.0', id: 2, error };
        return jsonResponse(rows);
      }
      if (opts.eth?.rejectBatch && Array.isArray(payload)) {
        return jsonResponse({ error: 'batch disabled' }, 400);
      }
      return jsonResponse(ethRpcPayload(payload, balances));
    }
    if (url.includes('api.kraken.com') && url.includes('/Ticker')) {
      const pairParam = new URL(url).searchParams.get('pair') ?? '';
      if (pairParam === 'EURUSD') {
        if (opts.krakenMissing?.includes('EURUSD')) return jsonResponse({ error: ['EQuery:Unknown asset pair'] });
        const eurusd = opts.kraken?.ZEURZUSD ?? opts.kraken?.EURUSD ?? ticker('1.08', '1.10');
        return jsonResponse(krakenTicker({ ZEURZUSD: eurusd, EURUSD: eurusd }));
      }
      const result: Record<string, ReturnType<typeof ticker>> = {};
      for (const [key, value] of Object.entries(kraken)) {
        if (opts.krakenMissing?.some((m) => key.includes(m))) continue;
        result[key] = value;
      }
      return jsonResponse(krakenTicker(result));
    }
    throw new Error('unexpected url');
  };
}

async function getWallets(
  fetchImpl: FetchImpl,
  env: Env = envOf(),
  extra: { chainTimeoutMs?: number; requestTimeoutMs?: number; path?: string } = {},
) {
  const app = createApp({
    fetch: fetchImpl,
    now: () => NOW,
    chainTimeoutMs: extra.chainTimeoutMs,
    requestTimeoutMs: extra.requestTimeoutMs,
  });
  return app.request(extra.path ?? '/wallets', { headers: { 'X-Folio-Token': APP_TOKEN } }, env);
}

function assertNoAddress(body: unknown) {
  const raw = JSON.stringify(body);
  expect(raw).not.toContain(BTC_ADDRESS);
  expect(raw).not.toContain(ETH_ADDRESS);
  expect(raw).not.toContain(ETH_ADDRESS.toLowerCase());
  expect(raw.toLowerCase()).not.toContain('bc1qtestaddress');
}

describe('formatUnits', () => {
  test('converts wei and USDC atoms without precision bugs', () => {
    expect(formatUnits(BigInt('0x1bc16d674ec80000'), 18)).toBe(2);
    expect(formatUnits(0x0f4240n, 6)).toBe(1);
    expect(formatUnits(100_000_000n, 8)).toBe(1);
    expect(formatUnits(0n, 18)).toBe(0);
  });
});

describe('GET /wallets', () => {
  test('lists /wallets on /', async () => {
    const app = createApp({ now: () => NOW });
    const root = (await (await app.request('/')).json()) as { endpoints: string[] };
    expect(root.endpoints).toContain('/wallets');
  });

  test('503 when the app token is unset, 401 when the header does not match', async () => {
    const fetchImpl = vi.fn(mockFetch());
    const app = createApp({ fetch: fetchImpl, now: () => NOW });
    const disabled = await app.request('/wallets', { headers: { 'X-Folio-Token': APP_TOKEN } }, {
      XAI_AUTH: {} as KVNamespace,
    });
    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toEqual({ error: 'chat_disabled' });

    const wrong = await app.request('/wallets', { headers: { 'X-Folio-Token': 'nope' } }, envOf());
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'unauthorized' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('BTC sats math includes mempool and hides zero; body never contains the address', async () => {
    const fetchImpl = vi.fn(mockFetch());
    const res = await getWallets(fetchImpl);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=60');
    const body = (await res.json()) as WalletsResponse;
    expect(body.source).toBe('tangem');
    expect(body.updatedAt).toBe(new Date(NOW).toISOString());
    const btc = body.wallets.find((w) => w.chain === 'bitcoin');
    expect(btc).toMatchObject({ ok: true });
    expect(btc?.assets).toEqual([
      expect.objectContaining({
        symbol: 'BTC',
        name: 'Bitcoin',
        chain: 'bitcoin',
        quantity: 1.1,
        pending: 0.1,
        priceEur: 60000,
      }),
    ]);
    expect(btc?.assets[0]?.valueEur).toBeCloseTo(1.1 * 60000);
    assertNoAddress(body);
  });

  test('falls back to blockstream on mempool 5xx and timeout', async () => {
    const five = vi.fn(mockFetch({ btc: { mempool: 503, blockstream: btcInfo(200_000_000, 100_000_000) } }));
    const res5 = await getWallets(five);
    const btc5 = ((await res5.json()) as WalletsResponse).wallets.find((w) => w.chain === 'bitcoin');
    expect(btc5?.ok).toBe(true);
    expect(btc5?.assets[0]?.quantity).toBe(1);

    const timed = vi.fn(
      mockFetch({ btc: { mempool: 'hang', blockstream: btcInfo(80_000_000, 0) } }),
    );
    const resT = await getWallets(timed, envOf(), { chainTimeoutMs: 80, requestTimeoutMs: 25 });
    const btcT = ((await resT.json()) as WalletsResponse).wallets.find((w) => w.chain === 'bitcoin');
    expect(btcT?.ok).toBe(true);
    expect(btcT?.assets[0]?.quantity).toBe(0.8);
  });

  test('ETH wei / USDC / USDT conversions; zero-balance tokens hidden', async () => {
    const res = await getWallets(mockFetch());
    const eth = ((await res.json()) as WalletsResponse).wallets.find((w) => w.chain === 'ethereum');
    expect(eth?.ok).toBe(true);
    expect(eth?.assets.map((a) => [a.symbol, a.quantity])).toEqual([
      ['ETH', 2],
      ['USDC', 1],
    ]);
  });

  test('batch rejected falls back to sequential on the same endpoint', async () => {
    const fetchImpl = vi.fn(mockFetch({ eth: { rejectBatch: true } }));
    const res = await getWallets(fetchImpl);
    const eth = ((await res.json()) as WalletsResponse).wallets.find((w) => w.chain === 'ethereum');
    expect(eth?.ok).toBe(true);
    expect(eth?.assets.map((a) => a.symbol)).toEqual(['ETH', 'USDC']);
    const rpcCalls = fetchImpl.mock.calls.filter(([input]) =>
      ETH_RPC_ENDPOINTS.some((e) => urlOf(input).startsWith(e)),
    );
    expect(rpcCalls.length).toBeGreaterThan(1);
    expect(rpcCalls.every(([input]) => urlOf(input).startsWith(ETH_RPC_ENDPOINTS[0]))).toBe(true);
    expect(rpcCalls.some(([, init]) => Array.isArray(JSON.parse(String(init?.body))))).toBe(true);
    expect(rpcCalls.some(([, init]) => !Array.isArray(JSON.parse(String(init?.body))))).toBe(true);
  });

  test('JSON-RPC error element fails over without replaying the batch one call at a time', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fetchImpl = vi.fn(mockFetch({ eth: { rpcErrorEndpoints: 1, rpcErrorOn: 'element', rpcErrorCode: -32603 } }));
      const res = await getWallets(fetchImpl);
      const body = (await res.json()) as WalletsResponse;
      const eth = body.wallets.find((w) => w.chain === 'ethereum');
      expect(eth?.ok).toBe(true);
      expect(eth?.assets.map((a) => a.symbol)).toEqual(['ETH', 'USDC']);
      expect(eth).not.toHaveProperty('detail');
      const first = fetchImpl.mock.calls.filter(([input]) => urlOf(input).startsWith(ETH_RPC_ENDPOINTS[0]));
      expect(first).toHaveLength(1);
      expect(Array.isArray(JSON.parse(String(first[0]?.[1]?.body)))).toBe(true);
      const second = fetchImpl.mock.calls.filter(([input]) => urlOf(input).startsWith(ETH_RPC_ENDPOINTS[1]));
      expect(second.length).toBeGreaterThan(0);
      assertNoAddress(body);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(ETH_ADDRESS);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test('JSON-RPC error object is an endpoint failure, not a batch rejection', async () => {
    const fetchImpl = vi.fn(mockFetch({ eth: { rpcErrorEndpoints: 1, rpcErrorOn: 'response', rpcErrorCode: -32046 } }));
    const res = await getWallets(fetchImpl);
    const eth = ((await res.json()) as WalletsResponse).wallets.find((w) => w.chain === 'ethereum');
    expect(eth?.ok).toBe(true);
    expect(eth?.assets.map((a) => a.symbol)).toEqual(['ETH', 'USDC']);
    const first = fetchImpl.mock.calls.filter(([input]) => urlOf(input).startsWith(ETH_RPC_ENDPOINTS[0]));
    expect(first).toHaveLength(1);
    expect(fetchImpl.mock.calls.some(([input]) => urlOf(input).startsWith(ETH_RPC_ENDPOINTS[1]))).toBe(true);
  });

  test('HTTP 525 fails the endpoint and the next one is called with JSON headers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const fetchImpl = vi.fn(mockFetch({ eth: { failEndpoints: 1, failStatus: 525 } }));
      const res = await getWallets(fetchImpl);
      const body = (await res.json()) as WalletsResponse;
      const eth = body.wallets.find((w) => w.chain === 'ethereum');
      expect(eth?.ok).toBe(true);
      expect(eth?.assets.map((a) => a.symbol)).toEqual(['ETH', 'USDC']);
      const first = fetchImpl.mock.calls.filter(([input]) => urlOf(input).startsWith(ETH_RPC_ENDPOINTS[0]));
      expect(first).toHaveLength(1);
      const second = fetchImpl.mock.calls.find(([input]) => urlOf(input).startsWith(ETH_RPC_ENDPOINTS[1]));
      expect(second).toBeTruthy();
      const init = second?.[1];
      const headers = init?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Accept).toBe('application/json');
      expect(headers['User-Agent']).toBe('folio-worker/0.1 (+https://github.com/andreixmanu/folio)');
      expect(init?.redirect).toBe('follow');
      assertNoAddress(body);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  test('ETH_RPC_URLS overrides defaults and drops non-https entries', async () => {
    const primary = 'https://rpc-ok.example/eth';
    const backup = 'https://rpc-backup.example/eth';
    const fetchImpl = vi.fn(mockFetch({ eth: { urls: [primary, backup], failEndpoints: 1 } }));
    const res = await getWallets(
      fetchImpl,
      envOf({ ETH_RPC_URLS: ` http://nope.example/eth, ${primary}, not-a-url, ${backup} ` }),
    );
    const eth = ((await res.json()) as WalletsResponse).wallets.find((w) => w.chain === 'ethereum');
    expect(eth?.ok).toBe(true);
    const rpcUrls = fetchImpl.mock.calls.map(([input]) => urlOf(input)).filter((u) => u.startsWith('https://rpc-'));
    expect(rpcUrls[0]).toBe(primary);
    expect(rpcUrls.some((u) => u.startsWith(backup))).toBe(true);
    expect(fetchImpl.mock.calls.some(([input]) => urlOf(input).includes('nope.example'))).toBe(false);
    expect(fetchImpl.mock.calls.some(([input]) => urlOf(input).includes('publicnode.com'))).toBe(false);
    expect(fetchImpl.mock.calls.some(([input]) => urlOf(input).includes('llamarpc.com'))).toBe(false);
    expect(fetchImpl.mock.calls.some(([input]) => urlOf(input).includes('cloudflare-eth.com'))).toBe(false);
  });

  test('debug detail is only present for ?debug=1 and never contains the address or URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const endpointA = 'https://rpc-a.example/eth?apikey=supersecret';
    const endpointB = 'https://rpc-b.example/v1';
    const fetchImpl = vi.fn(
      mockFetch({
        eth: {
          urls: [endpointA, endpointB],
          failEndpoints: 1,
          failStatus: 525,
          rpcErrorEndpoints: 2,
          rpcErrorOn: 'element',
          rpcErrorCode: -32603,
        },
      }),
    );
    const env = envOf({ ETH_RPC_URLS: `${endpointA}, ${endpointB}` });
    try {
      const hidden = await getWallets(fetchImpl, env);
      const hiddenBody = (await hidden.json()) as WalletsResponse;
      const hiddenEth = hiddenBody.wallets.find((w) => w.chain === 'ethereum');
      expect(hiddenEth?.ok).toBe(false);
      expect(hiddenEth?.error).toBe('upstream');
      expect(hiddenEth).not.toHaveProperty('detail');
      assertNoAddress(hiddenBody);

      const shown = await getWallets(fetchImpl, env, { path: '/wallets?debug=1' });
      const shownBody = (await shown.json()) as WalletsResponse;
      const shownEth = shownBody.wallets.find((w) => w.chain === 'ethereum');
      expect(shownEth?.ok).toBe(false);
      expect(shownEth?.detail).toEqual([
        { host: 'rpc-a.example', reason: 'http_525' },
        { host: 'rpc-b.example', reason: 'rpc_-32603' },
      ]);
      expect(shownEth?.detail?.every((item) => Object.keys(item).sort().join() === 'host,reason')).toBe(true);
      const raw = JSON.stringify(shownBody);
      expect(raw).not.toContain(ETH_ADDRESS);
      expect(raw).not.toContain(ETH_ADDRESS.toLowerCase());
      expect(raw).not.toContain('supersecret');
      expect(raw).not.toContain('apikey');
      expect(raw).not.toContain('/v1');
      expect(raw).not.toContain('/eth');
      expect(raw).not.toMatch(/https?:\/\//);
      assertNoAddress(shownBody);

      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).not.toContain(ETH_ADDRESS);
      expect(logged).not.toContain(ETH_ADDRESS.toLowerCase());
      expect(logged).not.toContain(BTC_ADDRESS);
      expect(logged).not.toContain('supersecret');
      expect(logged).not.toContain('apikey');
      expect(logged).not.toContain('/v1');
      expect(logged).not.toMatch(/https?:\/\//);
      expect(warn.mock.calls).toEqual([
        ['[wallets] eth endpoint failed', 'rpc-a.example', 'http_525'],
        ['[wallets] eth endpoint failed', 'rpc-b.example', 'rpc_-32603'],
        ['[wallets] eth endpoint failed', 'rpc-a.example', 'http_525'],
        ['[wallets] eth endpoint failed', 'rpc-b.example', 'rpc_-32603'],
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  test('RPC endpoint fallback after the first provider fails', async () => {
    const fetchImpl = vi.fn(mockFetch({ eth: { failEndpoints: 1 } }));
    const res = await getWallets(fetchImpl);
    const eth = ((await res.json()) as WalletsResponse).wallets.find((w) => w.chain === 'ethereum');
    expect(eth?.ok).toBe(true);
    const rpcUrls = fetchImpl.mock.calls.map(([input]) => urlOf(input)).filter((u) =>
      ETH_RPC_ENDPOINTS.some((e) => u.startsWith(e)),
    );
    expect(rpcUrls[0]).toBe(ETH_RPC_ENDPOINTS[0]);
    expect(rpcUrls.some((u) => u.startsWith(ETH_RPC_ENDPOINTS[1]))).toBe(true);
  });

  test('partial failure: BTC ok, ETH all RPCs fail → 200 with eth ok:false', async () => {
    const fetchImpl = vi.fn(mockFetch({ eth: { hangAll: true } }));
    const res = await getWallets(fetchImpl, envOf(), { chainTimeoutMs: 60, requestTimeoutMs: 20 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as WalletsResponse;
    const btc = body.wallets.find((w) => w.chain === 'bitcoin');
    const eth = body.wallets.find((w) => w.chain === 'ethereum');
    expect(btc?.ok).toBe(true);
    expect(eth?.ok).toBe(false);
    expect(eth?.error).toBe('timeout');
    expect(eth?.assets).toEqual([]);
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/https?:\/\//);
    assertNoAddress(body);
  });

  test('missing addresses are not_configured and do not fetch upstream', async () => {
    const fetchImpl = vi.fn(mockFetch());
    const res = await getWallets(fetchImpl, envOf({ BTC_ADDRESS: '', ETH_ADDRESS: undefined }));
    const body = (await res.json()) as WalletsResponse;
    expect(body.wallets).toEqual([
      { chain: 'bitcoin', ok: false, error: 'not_configured', assets: [] },
      { chain: 'ethereum', ok: false, error: 'not_configured', assets: [] },
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('hides a zero BTC balance', async () => {
    const res = await getWallets(mockFetch({ btc: { mempool: btcInfo(1, 1) } }));
    const btc = ((await res.json()) as WalletsResponse).wallets.find((w) => w.chain === 'bitcoin');
    expect(btc?.ok).toBe(true);
    expect(btc?.assets).toEqual([]);
  });

  test('prices via Kraken and stablecoin USD fallback when the EUR pair is missing', async () => {
    const fetchImpl = vi.fn(
      mockFetch({
        kraken: {
          XXBTZEUR: ticker('60000', '59000'),
          XETHZEUR: ticker('2000', '2100'),
          ZEURZUSD: ticker('1.08', '1.10'),
        },
        krakenMissing: ['USDCEUR', 'USDC'],
      }),
    );
    const res = await getWallets(fetchImpl);
    const body = (await res.json()) as WalletsResponse;
    const usdc = body.wallets.flatMap((w) => w.assets).find((a) => a.symbol === 'USDC');
    expect(usdc?.priceEur).toBeCloseTo(1 / 1.08);
    expect(usdc?.valueEur).toBeCloseTo(1 / 1.08);
    const krakenUrls = fetchImpl.mock.calls.map(([input]) => urlOf(input)).filter((u) => u.includes('kraken.com'));
    expect(krakenUrls.some((u) => u.includes('EURUSD'))).toBe(true);
  });

  test('pricing failure leaves priceEur null', async () => {
    const fetchImpl: FetchImpl = async (input, init) => {
      const url = urlOf(input);
      if (url.includes('kraken.com')) throw new Error('kraken down');
      return mockFetch()(input, init);
    };
    const res = await getWallets(fetchImpl);
    const btc = ((await res.json()) as WalletsResponse).wallets
      .find((w) => w.chain === 'bitcoin')
      ?.assets.find((a) => a.symbol === 'BTC');
    expect(btc?.quantity).toBe(1.1);
    expect(btc?.priceEur).toBeNull();
    expect(btc?.valueEur).toBeNull();
    expect(btc?.changePct).toBeNull();
  });

  test('in-isolate cache is keyed by chain (~60s)', async () => {
    const fetchImpl = vi.fn(mockFetch());
    const app = createApp({ fetch: fetchImpl, now: () => NOW });
    const headers = { 'X-Folio-Token': APP_TOKEN };
    await app.request('/wallets', { headers }, envOf());
    await app.request('/wallets', { headers }, envOf());
    const mempoolCalls = fetchImpl.mock.calls.filter(([input]) => urlOf(input).includes('mempool.space'));
    expect(mempoolCalls).toHaveLength(1);
  });

  test('upstream errors never include URLs', async () => {
    const fetchImpl = mockFetch({ btc: { mempool: 500, blockstream: 500 }, eth: { hangAll: true } });
    const res = await getWallets(fetchImpl, envOf(), { chainTimeoutMs: 50, requestTimeoutMs: 15 });
    const body = (await res.json()) as WalletsResponse;
    const raw = JSON.stringify(body);
    expect(raw).not.toMatch(/https?:\/\//);
    expect(raw).not.toContain(BTC_ADDRESS);
    expect(body.wallets.every((w) => w.error === 'upstream' || w.error === 'timeout')).toBe(true);
  });
});

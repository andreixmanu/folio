import { describe, expect, test, vi } from 'vitest';

import { createApp } from '../src/app';

import { candle, ticker } from './fixtures';

const NOW = Date.UTC(2026, 10, 12, 12, 0, 0);

function setup() {
  const fetchJson = vi.fn(async (url: string) => {
    if (url.includes('/Ticker')) {
      return { error: [], result: { XXBTZEUR: ticker('60000', '59000'), XETHZEUR: ticker('2000', '2100') } };
    }
    if (url.includes('/OHLC')) {
      const t = NOW / 1000;
      const key = url.includes('XBTEUR') ? 'XXBTZEUR' : 'XETHZEUR';
      return { error: [], result: { [key]: [candle(t - 7200, '1'), candle(t - 3600, '2')], last: t } };
    }
    throw new Error(`unexpected ${url}`);
  });
  return { app: createApp({ fetchJson, now: () => NOW }), fetchJson };
}

describe('worker app', () => {
  test('GET /prices normalizes quotes, reports unsupported, sets CORS and caches', async () => {
    const { app, fetchJson } = setup();
    const res = await app.request('/prices?symbols=BTC,ETH,FOO', { headers: { Origin: 'http://localhost:8081' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const body = (await res.json()) as { quotes: { symbol: string; price: number }[]; unsupported: string[] };
    expect(body.quotes.map((q) => [q.symbol, q.price])).toEqual([
      ['BTC', 60000],
      ['ETH', 2000],
    ]);
    expect(body.unsupported).toEqual(['FOO']);

    await app.request('/prices?symbols=ETH,BTC');
    expect(fetchJson).toHaveBeenCalledTimes(1); // served from the 30s ticker cache
  });

  test('GET /history returns one series per symbol', async () => {
    const { app } = setup();
    const res = await app.request('/history?symbols=BTC,ETH&range=1D');
    const body = (await res.json()) as { range: string; intervalMinutes: number; series: { symbol: string; points: unknown[] }[] };
    expect(body.range).toBe('1D');
    expect(body.intervalMinutes).toBe(15);
    expect(body.series.map((s) => [s.symbol, s.points.length])).toEqual([
      ['BTC', 2],
      ['ETH', 2],
    ]);
  });

  test('validates input and maps upstream errors to 502', async () => {
    const { app } = setup();
    expect((await app.request('/prices')).status).toBe(400);
    expect((await app.request('/history?symbols=BTC&range=5Y')).status).toBe(400);

    const failing = createApp({ fetchJson: async () => ({ error: ['EService:Unavailable'] }) });
    const res = await failing.request('/prices?symbols=BTC');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Kraken: EService:Unavailable' });
  });
});

describe('GET /history KV fallback', () => {
  function memKv() {
    const m = new Map<string, string>();
    return {
      get: async (k: string) => m.get(k) ?? null,
      put: async (k: string, v: string) => void m.set(k, v),
    } as unknown as KVNamespace;
  }

  test('serves the last good KV copy when Kraken rate-limits', async () => {
    let t = NOW;
    let limited = false;
    const fetchJson = vi.fn(async () => {
      if (limited) return { error: ['EGeneral:Too many requests'] };
      const s = NOW / 1000;
      return { error: [], result: { XXBTZEUR: [candle(s - 7200, '1'), candle(s - 3600, '2')], last: s } };
    });
    const env = { XAI_AUTH: memKv() };
    const ok = await createApp({ fetchJson, now: () => t, sleep: async () => {} }).request('/history?symbols=BTC&range=1D', {}, env);
    expect(ok.status).toBe(200);

    limited = true;
    t = NOW + 10 * 60_000; // past the 1D TTL, fresh isolate
    const res = await createApp({ fetchJson, now: () => t, sleep: async () => {} }).request('/history?symbols=BTC&range=1D', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { series: { points: unknown[] }[] };
    expect(body.series[0]?.points.length).toBeGreaterThan(0);
    expect(fetchJson).toHaveBeenCalledTimes(4); // 1 ok + 3 rate-limited attempts
  });

  test('still 502 when Kraken fails and nothing is stored', async () => {
    const fetchJson = vi.fn(async () => ({ error: ['EGeneral:Too many requests'] }));
    const res = await createApp({ fetchJson, now: () => NOW, sleep: async () => {} }).request(
      '/history?symbols=BTC&range=1D',
      {},
      { XAI_AUTH: memKv() },
    );
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});

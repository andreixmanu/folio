import { readFileSync } from 'node:fs';

import { describe, expect, test, vi } from 'vitest';

import { createApp } from '../src/app';
import type { Env } from '../src/env';
import { IBKR_FRESH_MS } from '../src/ibkr';
import { flexDate, flexTimestamp, parseFlexStatement } from '../src/ibkr/parse';

import { MemoryKv } from './memory-kv';

const XML = readFileSync(new URL('./fixtures/ibkr-flex.xml', import.meta.url), 'utf8');
const APP_TOKEN = 'local-dev-token';
const NOW = Date.UTC(2026, 10, 17, 9, 0, 0);

const SEND_OK = `<FlexStatementResponse timestamp="x"><Status>Success</Status><ReferenceCode>999</ReferenceCode><Url>https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement</Url></FlexStatementResponse>`;
const IN_PROGRESS = `<FlexStatementResponse><Status>Warn</Status><ErrorCode>1019</ErrorCode><ErrorMessage>Statement generation in progress.</ErrorMessage></FlexStatementResponse>`;
const BAD_TOKEN = `<FlexStatementResponse><Status>Fail</Status><ErrorCode>1015</ErrorCode><ErrorMessage>Token is invalid.</ErrorMessage></FlexStatementResponse>`;

function envOf(kv: MemoryKv, extra: Partial<Env> = {}): Env {
  return {
    XAI_AUTH: kv as unknown as KVNamespace,
    APP_CHAT_TOKEN: APP_TOKEN,
    IBKR_FLEX_TOKEN: 'tok',
    IBKR_FLEX_QUERY_ID: '123',
    ...extra,
  };
}

function setup(responses: (string | Error)[], now = { t: NOW }) {
  const queue = [...responses];
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
    const next = queue.shift();
    if (next === undefined) throw new Error(`unexpected ${url}`);
    if (next instanceof Error) throw next;
    return new Response(next, { status: 200 });
  });
  const app = createApp({ fetch: fetch as never, now: () => now.t, sleep: async () => undefined, flexDelaysMs: [0, 0, 0] });
  return { app, fetch, now };
}

const get = (app: ReturnType<typeof createApp>, env: Env, token = APP_TOKEN) =>
  app.request('/positions', { headers: { 'X-Folio-Token': token } }, env);

describe('flex parser', () => {
  test('keeps summary rows, converts to base, never returns account ids', () => {
    const p = parseFlexStatement(XML);
    expect(p.asOf).toBe('2026-11-16');
    expect(p.generatedAt).toBe('2026-11-17T08:46:23');
    expect(p.positions.map((x) => [x.symbol, x.quantity, x.valueBase, x.markPriceBase])).toEqual([
      ['XNAS', 10, 505, 50.5],
      ['ACME', 4, 360, 90],
    ]);
    expect(p.positions[1]!.description).toBe('ACME CORP & CO');
    expect(p.positions[0]!.isin).toBe('IE0000000001');
    expect(p.positions[0]!.unrealizedPnl).toBe(25);
    expect(p.cash).toEqual([{ currency: 'EUR', amount: 120, amountBase: 120 }]);
    expect(JSON.stringify(p)).not.toContain('U0000000');
  });

  test('dates', () => {
    expect(flexDate('20261116')).toBe('2026-11-16');
    expect(flexDate('2026-11-16')).toBe('2026-11-16');
    expect(flexDate('')).toBeNull();
    expect(flexTimestamp('20261117;084623')).toBe('2026-11-17T08:46:23');
  });

  test('rejects non-statements', () => {
    expect(() => parseFlexStatement('<html/>')).toThrow();
  });
});

describe('GET /positions', () => {
  test('auth and missing secrets', async () => {
    const { app } = setup([]);
    const kv = new MemoryKv();
    expect((await get(app, envOf(kv), 'nope')).status).toBe(401);
    const res = await get(app, envOf(kv, { IBKR_FLEX_TOKEN: undefined }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'ibkr_not_configured' });
  });

  test('two-step fetch with retry on 1019, then served from KV cache', async () => {
    const { app, fetch, now } = setup([SEND_OK, IN_PROGRESS, XML]);
    const kv = new MemoryKv();
    const res = await get(app, envOf(kv));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { asOf: string; stale: boolean; totalValueBase: number; positions: unknown[] };
    expect(body.asOf).toBe('2026-11-16');
    expect(body.stale).toBe(false);
    expect(body.totalValueBase).toBe(865);
    expect(body.positions).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(3);
    const [sendUrl, init] = fetch.mock.calls[0]!;
    expect(sendUrl).toContain('SendRequest?t=tok&q=123&v=3');
    expect((init?.headers as Record<string, string>)['User-Agent']).toMatch(/folio/);
    expect(fetch.mock.calls[1]![0]).toContain('GetStatement?t=tok&q=999&v=3');
    expect(kv.puts[0]!.value).not.toContain('U0000000');

    now.t += IBKR_FRESH_MS - 1;
    expect((await get(app, envOf(kv))).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('serves stale on upstream failure, 502 without cache', async () => {
    const kv = new MemoryKv();
    const first = setup([SEND_OK, XML]);
    await get(first.app, envOf(kv));

    const later = setup([BAD_TOKEN], { t: NOW + IBKR_FRESH_MS + 1 });
    const res = await get(later.app, envOf(kv));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { stale: boolean }).stale).toBe(true);
    // Backoff marker: no upstream call on the next request.
    await get(later.app, envOf(kv));
    expect(later.fetch).toHaveBeenCalledTimes(1);

    const empty = setup([BAD_TOKEN]);
    const fail = await get(empty.app, envOf(new MemoryKv()));
    expect(fail.status).toBe(502);
    expect(((await fail.json()) as { error: string }).error).toContain('1015');
  });

  test('gives up after the retry budget', async () => {
    const { app } = setup([SEND_OK, IN_PROGRESS, IN_PROGRESS, IN_PROGRESS, IN_PROGRESS]);
    const res = await get(app, envOf(new MemoryKv()));
    expect(res.status).toBe(502);
  });
});

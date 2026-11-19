import { afterEach, describe, expect, test, vi } from 'vitest';

import type { Env } from '../src/env';

const APP_TOKEN = 'local-dev-token';

function envOf(): Env {
  return { XAI_AUTH: {} as KVNamespace, APP_CHAT_TOKEN: APP_TOKEN };
}

describe('edge cache skip', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test('does not edge-cache /wallets or requests carrying X-Folio-Token', async () => {
    const match = vi.fn(async () => undefined);
    const put = vi.fn(async () => undefined);
    vi.stubGlobal('caches', { default: { match, put } });
    const { default: handler } = await import('../src/index');
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;

    match.mockClear();
    put.mockClear();
    await handler.fetch(new Request('https://example.com/wallets', { headers: { 'X-Folio-Token': APP_TOKEN } }), envOf(), ctx);
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();

    match.mockClear();
    await handler.fetch(new Request('https://example.com/wallets'), envOf(), ctx);
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();

    match.mockClear();
    await handler.fetch(new Request('https://example.com/health', { headers: { 'X-Folio-Token': APP_TOKEN } }), envOf(), ctx);
    expect(match).not.toHaveBeenCalled();

    match.mockClear();
    await handler.fetch(new Request('https://example.com/health'), envOf(), ctx);
    expect(match).toHaveBeenCalled();

    match.mockClear();
    put.mockClear();
    await handler.fetch(new Request('https://example.com/positions'), envOf(), ctx);
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();

    match.mockClear();
    put.mockClear();
    await handler.fetch(
      new Request('https://example.com/positions', { headers: { 'X-Folio-Token': APP_TOKEN } }),
      envOf(),
      ctx,
    );
    expect(match).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});

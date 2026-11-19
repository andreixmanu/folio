import { describe, expect, test, vi } from 'vitest';

import { createApp } from '../src/app';
import { defaultFetchLogo, logoUrl, normalizeLogoSymbol } from '../src/logos';

describe('logos', () => {
  test('normalizes symbols and maps ETFs to issuer listings', () => {
    expect(normalizeLogoSymbol('aapl')).toBe('AAPL');
    expect(normalizeLogoSymbol('AAPL.png')).toBe('AAPL');
    expect(normalizeLogoSymbol('../etc')).toBeNull();
    expect(logoUrl('VWCE')).toBe('https://financialmodelingprep.com/image-stock/VWRL.L.png');
    expect(logoUrl('MSFT')).toBe('https://financialmodelingprep.com/image-stock/MSFT.png');
  });

  test('GET /logo/:symbol proxies the image with long caching and coalesces upstream', async () => {
    const png = new Uint8Array([137, 80, 78, 71]).buffer;
    const fetchLogo = vi.fn(async (url: string) =>
      url.includes('NOPE') ? null : { body: png, contentType: 'image/png' },
    );
    const app = createApp({ fetchLogo, fetchJson: vi.fn() });

    const res = await app.request('/logo/msft');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('max-age=604800');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(png));
    await app.request('/logo/MSFT');
    expect(fetchLogo).toHaveBeenCalledTimes(1);

    expect((await app.request('/logo/NOPE')).status).toBe(404);
    expect((await app.request('/logo/A%24B')).status).toBe(400);
  });

  test('a logo miss expires after a day, a hit stays for a week', async () => {
    let now = 0;
    const fetchLogo = vi.fn(async (url: string) =>
      url.includes('NOPE') ? null : { body: new Uint8Array([1]).buffer, contentType: 'image/png' },
    );
    const app = createApp({ fetchLogo, now: () => now });

    expect((await app.request('/logo/NOPE')).status).toBe(404);
    now = 2 * 86_400_000;
    expect((await app.request('/logo/NOPE')).status).toBe(404);
    expect(fetchLogo).toHaveBeenCalledTimes(2);

    fetchLogo.mockClear();
    expect((await app.request('/logo/MSFT')).status).toBe(200);
    now += 2 * 86_400_000;
    expect((await app.request('/logo/MSFT')).status).toBe(200);
    expect(fetchLogo).toHaveBeenCalledTimes(1);
    now += 8 * 86_400_000;
    expect((await app.request('/logo/MSFT')).status).toBe(200);
    expect(fetchLogo).toHaveBeenCalledTimes(2);
  });

  test('defaultFetchLogo drops a body over 512 KB', async () => {
    const big = new Uint8Array(600 * 1024);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(big, { status: 200, headers: { 'content-type': 'image/png' } })),
    );
    try {
      expect(await defaultFetchLogo('https://example.com/a.png')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

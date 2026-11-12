import { describe, expect, test, vi } from 'vitest';

import { createApp } from '../src/app';
import { logoUrl, normalizeLogoSymbol } from '../src/logos';

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
});

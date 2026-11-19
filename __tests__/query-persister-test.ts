import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';

import { persistPortfolioCache, restorePortfolioCache } from '@/services/query-persister';

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('portfolio query cache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('restores wallets, quotes and history, and drops news', async () => {
    const saved = client();
    saved.setQueryData(['wallets'], { updatedAt: 't', source: 'tangem', wallets: [] });
    saved.setQueryData(['quotes', 'crypto', 'BTC'], {
      source: 'kraken',
      quotes: [{ symbol: 'BTC', price: 100, changePct: 1 }],
      unsupported: [],
      updatedAt: 't',
    });
    saved.setQueryData(['history', '1W', 'BTC'], {
      range: '1W',
      series: [{ symbol: 'BTC', points: [{ t: 1, close: 90 }, { t: 2, close: 100 }] }],
    });
    saved.setQueryData(['news', 'all'], [{ id: 'n' }]);
    await persistPortfolioCache(saved);

    const restored = client();
    await restorePortfolioCache(restored);
    expect(restored.getQueryData(['wallets'])).toEqual({ updatedAt: 't', source: 'tangem', wallets: [] });
    expect(restored.getQueryData(['quotes', 'crypto', 'BTC'])).toMatchObject({
      quotes: [{ symbol: 'BTC', price: 100, changePct: 1 }],
    });
    expect(restored.getQueryData(['history', '1W', 'BTC'])).toMatchObject({ range: '1W' });
    expect(restored.getQueryData(['news', 'all'])).toBeUndefined();
  });

  test('does not restore an error or an expired cache', async () => {
    const saved = client();
    await saved
      .fetchQuery({
        queryKey: ['ibkr', 'positions'],
        queryFn: () => Promise.reject(new Error('down')),
      })
      .catch(() => undefined);
    saved.setQueryData(['wallets'], { ok: true });
    await persistPortfolioCache(saved);

    const raw = await AsyncStorage.getItem('folio-query-cache-v1');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { savedAt: number; state: { queries: { queryKey: unknown[] }[] } };
    expect(parsed.state.queries.map((q) => q.queryKey[0])).toEqual(['wallets']);

    parsed.savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await AsyncStorage.setItem('folio-query-cache-v1', JSON.stringify(parsed));
    const restored = client();
    await restorePortfolioCache(restored);
    expect(restored.getQueryData(['wallets'])).toBeUndefined();
  });

  test('keeps the last data when a later fetch fails', async () => {
    const saved = client();
    saved.setQueryData(['quotes', 'crypto', 'BTC'], {
      source: 'kraken',
      quotes: [{ symbol: 'BTC', price: 100, changePct: 1 }],
      unsupported: [],
      updatedAt: 't',
    });
    await saved
      .fetchQuery({
        queryKey: ['quotes', 'crypto', 'BTC'],
        queryFn: () => Promise.reject(new Error('later')),
      })
      .catch(() => undefined);
    expect(saved.getQueryState(['quotes', 'crypto', 'BTC'])?.status).toBe('error');
    await persistPortfolioCache(saved);

    const restored = client();
    await restorePortfolioCache(restored);
    expect(restored.getQueryData(['quotes', 'crypto', 'BTC'])).toMatchObject({
      quotes: [{ symbol: 'BTC', price: 100, changePct: 1 }],
    });
  });

  test('ignores corrupt storage', async () => {
    await AsyncStorage.setItem('folio-query-cache-v1', '{');
    const restored = client();
    await expect(restorePortfolioCache(restored)).resolves.toBeUndefined();
    expect(restored.getQueryData(['wallets'])).toBeUndefined();
  });
});

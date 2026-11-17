import { createMockBudgetSource, selectBudgetSource } from '@/features/budget/data-source';
import { createRemoteBudgetSource, RemoteBudgetError } from '@/features/budget/remote-data-source';

type Call = { url: string; headers: Record<string, string> };

function fakeFetch(handler: (url: URL) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const impl = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const { status = 200, body } = handler(new URL(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

describe('RemoteBudgetDataSource', () => {
  test('lists accounts with the app token', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { accounts: [{ id: 'revolut-1' }] } }));
    const source = createRemoteBudgetSource({ baseUrl: 'https://api.example/', token: 'tok', fetch: impl });
    expect(await source.getAccounts()).toEqual([{ id: 'revolut-1' }]);
    expect(calls[0]).toEqual({ url: 'https://api.example/bank/accounts', headers: { 'X-Folio-Token': 'tok', Accept: 'application/json' } });
  });

  test('follows cursors, forwards filters and strips category fields', async () => {
    const { impl, calls } = fakeFetch((url) => {
      const cursor = url.searchParams.get('cursor');
      return cursor
        ? { body: { transactions: [{ id: 't2', categoryId: 'other' }], nextCursor: null } }
        : { body: { transactions: [{ id: 't1', merchantKey: 'x' }], nextCursor: 'c1' } };
    });
    const source = createRemoteBudgetSource({ baseUrl: 'https://api.example', token: 't', fetch: impl, pageSize: 1 });
    const rows = await source.getTransactions({ from: '2026-01-01', to: '2026-01-31', accountId: 'a' });
    expect(rows).toEqual([{ id: 't1' }, { id: 't2' }]);
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.example/bank/transactions?limit=1&from=2026-01-01&to=2026-01-31&accountId=a',
      'https://api.example/bank/transactions?limit=1&from=2026-01-01&to=2026-01-31&accountId=a&cursor=c1',
    ]);
  });

  test('turns 503 bank_not_configured into a readable error', async () => {
    const { impl } = fakeFetch(() => ({ status: 503, body: { error: 'bank_not_configured' } }));
    const source = createRemoteBudgetSource({ baseUrl: 'https://api.example', token: 't', fetch: impl });
    const err = await source.getAccounts().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RemoteBudgetError);
    expect(err).toMatchObject({ status: 503, code: 'bank_not_configured', message: 'Collegamento bancario non configurato' });
  });

  test('stops after maxPages', async () => {
    const { impl, calls } = fakeFetch(() => ({ body: { transactions: [], nextCursor: 'again' } }));
    const source = createRemoteBudgetSource({ baseUrl: 'https://api.example', token: 't', fetch: impl, maxPages: 3 });
    await source.getTransactions();
    expect(calls).toHaveLength(3);
  });
});

describe('selectBudgetSource', () => {
  test('mock is the default; remote only when asked and a URL exists', async () => {
    const remoteFetch = jest.spyOn(globalThis, 'fetch' as never);
    const mock = selectBudgetSource({});
    expect(Object.keys(mock)).toEqual(Object.keys(createMockBudgetSource()));
    expect(selectBudgetSource({ source: 'remote', apiUrl: () => null })).toBeDefined();
    expect(remoteFetch).not.toHaveBeenCalled();
    remoteFetch.mockRestore();
  });
});

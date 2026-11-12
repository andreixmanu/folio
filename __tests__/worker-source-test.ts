import { createWorkerPriceSource } from '@/services/prices/worker-source';

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, text: async () => JSON.stringify(body) });
}

describe('worker price source', () => {
  test('maps /prices and /history (seconds -> ms)', async () => {
    const src = createWorkerPriceSource('https://api.example');
    respond(200, { source: 'kraken', updatedAt: 'u', quotes: [{ symbol: 'BTC', price: 1, changePct: 2, pair: 'XBTEUR' }], unsupported: [] });
    const q = await src.getQuotes(['BTC']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example/prices?symbols=BTC');
    expect(q.quotes).toEqual([{ symbol: 'BTC', price: 1, changePct: 2 }]);

    respond(200, { source: 'kraken', range: '1D', series: [{ symbol: 'BTC', points: [{ t: 10, close: 5 }] }], unsupported: [] });
    const h = await src.getHistory(['BTC'], '1D');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.example/history?symbols=BTC&range=1D');
    expect(h.series[0]!.points).toEqual([{ t: 10_000, close: 5 }]);
  });

  test('surfaces server errors and missing configuration', async () => {
    respond(502, { error: 'Kraken: EService:Unavailable' });
    await expect(createWorkerPriceSource('https://api.example').getQuotes(['BTC'])).rejects.toThrow(
      'Kraken: EService:Unavailable',
    );
    await expect(createWorkerPriceSource(null).getQuotes(['BTC'])).rejects.toThrow(/API non configurata/);
  });
});

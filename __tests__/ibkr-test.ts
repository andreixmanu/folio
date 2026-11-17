import {
  fetchIbkrPositions,
  formatAsOf,
  ibkrFlatSeries,
  ibkrQuotes,
  ibkrSource,
  ibkrStatusNote,
  mapIbkrToPositions,
  prettyName,
  type IbkrPositionsResponse,
} from '@/services/ibkr';
import { buildSnapshot, buildValueHistory } from '@/services/portfolio';

import { IBKR_FIXTURE } from '../test/fixtures/ibkr';

const USD_ROW = {
  ...IBKR_FIXTURE.positions[0]!,
  symbol: 'ACME',
  description: 'ACME CORP',
  conid: '42',
  currency: 'USD',
  subCategory: 'COMMON',
  quantity: 4,
  markPrice: 100,
  positionValue: 400,
  fxRateToBase: 0.9,
  markPriceBase: 90,
  valueBase: 360,
};
const RES: IbkrPositionsResponse = {
  ...IBKR_FIXTURE,
  positions: [IBKR_FIXTURE.positions[0]!, USD_ROW, { ...USD_ROW, symbol: 'OPT1', assetCategory: 'OPT', conid: '9' }],
};

describe('ibkr mapping', () => {
  test('positions: stocks only, ETF vs stock, stable ids', () => {
    const p = mapIbkrToPositions(RES);
    expect(p.map((x) => [x.id, x.symbol, x.instrument, x.quantity])).toEqual([
      ['ibkr-vwce', 'VWCE', 'etf', 310],
      ['ibkr-42', 'ACME', 'stock', 4],
    ]);
    expect(p[1]!.name).toBe('Acme Corp');
  });

  test('quotes are EUR marks via fxRateToBase and value matches the statement', () => {
    const quotes = ibkrQuotes(RES);
    expect(quotes).toEqual([
      { symbol: 'VWCE', price: 132.86, changePct: 0 },
      { symbol: 'ACME', price: 90, changePct: 0 },
    ]);
    const s = buildSnapshot([ibkrSource(RES)], mapIbkrToPositions(RES), quotes, 't');
    expect(s.totalValue).toBeCloseTo(310 * 132.86 + 360, 2);
  });

  test('flat history keeps the crypto window and adds a constant stock value', () => {
    const positions = [
      ...mapIbkrToPositions(RES),
      { id: 'b', sourceId: 'tangem', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto' as const, instrument: 'coin' as const, quantity: 1 },
    ];
    const btc = { symbol: 'BTC', points: [1000, 2000, 3000].map((t) => ({ t, close: t })) };
    const h = buildValueHistory(positions, [btc, ...ibkrFlatSeries(RES, 0, 3000)], '1M');
    const stocks = 310 * 132.86 + 4 * 90;
    expect(h.points.map((p) => p.timestamp)).toEqual([1000, 2000, 3000]);
    expect(h.points[0]!.value).toBeCloseTo(1000 + stocks, 1);
    expect(h.change).toBeCloseTo(2000, 1);
  });

  test('labels', () => {
    expect(formatAsOf('2026-11-16', new Date(2026, 10, 17))).toBe('16 nov');
    expect(formatAsOf('2025-01-02', new Date(2026, 10, 17))).toBe('2 gen 2025');
    expect(formatAsOf(null)).toBeNull();
    expect(ibkrSource(RES, new Date(2026, 10, 17)).detail).toBe('Flex Query · aggiornato al 16 nov');
    expect(ibkrSource(undefined).detail).toBe('Flex Query · sola lettura');
    expect(ibkrStatusNote(undefined, true)).toBe('IBKR non raggiungibile · riprova');
    expect(ibkrStatusNote({ ...RES, stale: true }, false)).toMatch(/ultimo estratto/);
    expect(ibkrStatusNote(RES, false)).toBeNull();
    expect(prettyName('X NASDAQ 100 1C', 'XNAS')).toBe('X Nasdaq 100 1C');
    expect(prettyName('Apple', 'AAPL')).toBe('Apple');
  });
});

describe('fetchIbkrPositions', () => {
  const fetchMock = jest.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example';
    process.env.EXPO_PUBLIC_CHAT_TOKEN = 'tok';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_CHAT_TOKEN;
  });

  test('GET /positions with the app token', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify(IBKR_FIXTURE) });
    const body = await fetchIbkrPositions();
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.example/positions');
    expect(fetchMock.mock.calls[0]![1].headers['X-Folio-Token']).toBe('tok');
    expect(body.positions).toHaveLength(5);
  });

  test('503 surfaces as an error (no mock fallback)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => JSON.stringify({ error: 'ibkr_not_configured' }) });
    await expect(fetchIbkrPositions()).rejects.toThrow('ibkr_not_configured');
  });
});

import { MOCK_POSITIONS } from '@/services/mock/positions';
import { createCompositePositionsSource, TANGEM_SOURCE } from '@/services/sources';
import { fetchWallets, mapWalletsToPositions, walletStatusNote, type WalletsResponse } from '@/services/wallets';

const BTC_ADDRESS = 'bc1qtestaddress000000000000000000000000000';
const ETH_ADDRESS = '0x000000000000000000000000000000000000dEaD';

const walletsOk: WalletsResponse = {
  updatedAt: '2026-11-16T12:00:00.000Z',
  source: 'tangem',
  wallets: [
    {
      chain: 'bitcoin',
      ok: true,
      assets: [
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          chain: 'bitcoin',
          quantity: 0.5,
          priceEur: 60000,
          valueEur: 30000,
          changePct: 1.2,
          pending: 0.01,
        },
      ],
    },
    {
      chain: 'ethereum',
      ok: true,
      assets: [
        {
          symbol: 'ETH',
          name: 'Ethereum',
          chain: 'ethereum',
          quantity: 2,
          priceEur: 2000,
          valueEur: 4000,
          changePct: -1,
        },
        {
          symbol: 'USDC',
          name: 'USD Coin',
          chain: 'ethereum',
          quantity: 1,
          priceEur: 0.92,
          valueEur: 0.92,
          changePct: 0,
        },
        {
          symbol: 'USDT',
          name: 'Tether USD',
          chain: 'ethereum',
          quantity: 0,
          priceEur: 0.92,
          valueEur: 0,
          changePct: 0,
        },
      ],
    },
  ],
};

describe('mapWalletsToPositions', () => {
  test('maps worker assets to Tangem positions, hides zeros, never includes addresses', () => {
    const positions = mapWalletsToPositions(walletsOk);
    expect(positions.map((p) => p.id)).toEqual(['tangem-btc', 'tangem-eth', 'tangem-usdc']);
    expect(positions.every((p) => p.sourceId === 'tangem' && p.instrument === 'coin' && p.assetClass === 'crypto')).toBe(
      true,
    );
    expect(positions.find((p) => p.symbol === 'USDT')).toBeUndefined();
    const raw = JSON.stringify({ positions, source: TANGEM_SOURCE });
    expect(raw).not.toContain(BTC_ADDRESS);
    expect(raw).not.toContain(ETH_ADDRESS);
    expect(TANGEM_SOURCE.detail).toBe('Bitcoin · Ethereum · sola lettura');
    expect(TANGEM_SOURCE.detail).not.toMatch(/0x|bc1/i);
  });

  test('skips failed chains', () => {
    const positions = mapWalletsToPositions({
      ...walletsOk,
      wallets: [
        walletsOk.wallets[0]!,
        { chain: 'ethereum', ok: false, error: 'timeout', assets: [] },
      ],
    });
    expect(positions.map((p) => p.symbol)).toEqual(['BTC']);
  });
});

describe('createCompositePositionsSource', () => {
  test('keeps IBKR stocks when wallets fail and merges crypto when they succeed', async () => {
    const failing = createCompositePositionsSource(async () => {
      throw new Error('network');
    });
    const stocksOnly = await failing.getPositions();
    expect(stocksOnly).toEqual(MOCK_POSITIONS);
    expect(stocksOnly.every((p) => p.assetClass === 'stocks')).toBe(true);
    expect((await failing.getSources()).map((s) => s.id)).toEqual(['ibkr', 'tangem']);

    const ok = createCompositePositionsSource(async () => walletsOk);
    const merged = await ok.getPositions();
    expect(merged.filter((p) => p.assetClass === 'stocks')).toEqual(MOCK_POSITIONS);
    expect(merged.map((p) => p.id)).toEqual(expect.arrayContaining(['ibkr-vwce', 'tangem-btc', 'tangem-eth', 'tangem-usdc']));
    expect(JSON.stringify(merged)).not.toContain(BTC_ADDRESS);
  });
});

describe('walletStatusNote', () => {
  test('network vs per-chain copy', () => {
    expect(walletStatusNote(undefined, true)).toBe('Tangem non raggiungibile · riprova');
    expect(walletStatusNote(walletsOk, false)).toBeNull();
    expect(
      walletStatusNote(
        { ...walletsOk, wallets: [{ chain: 'ethereum', ok: false, error: 'upstream', assets: [] }] },
        false,
      ),
    ).toBe('Ethereum non disponibile');
  });
});

describe('fetchWallets', () => {
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

  test('GET /wallets with the app token and no address in the parsed body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(walletsOk),
    });
    const body = await fetchWallets();
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.example/wallets');
    expect(fetchMock.mock.calls[0]![1].headers['X-Folio-Token']).toBe('tok');
    expect(body.source).toBe('tangem');
    expect(JSON.stringify(body)).not.toContain(BTC_ADDRESS);
  });
});

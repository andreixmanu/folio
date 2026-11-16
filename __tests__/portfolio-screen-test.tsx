import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import PortfolioScreen from '@/app/(tabs)/index';
import { HoldingsBySource } from '@/features/portfolio/holdings-by-source';
import { MOCK_POSITIONS, MOCK_SOURCES } from '@/services/mock/positions';
import { mockStockPriceSource } from '@/services/mock/stock-prices';
import { buildSnapshot } from '@/services/portfolio';
import { priceSources, TANGEM_SOURCE } from '@/services/sources';
import { fetchWallets, type WalletsResponse } from '@/services/wallets';

import { renderWithProviders } from '../test/test-utils';

const safeArea = { top: 0, bottom: 0, left: 0, right: 0 };

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return { ...actual, useSafeAreaInsets: () => safeArea };
});

jest.mock('@/services/wallets', () => {
  const actual = jest.requireActual<typeof import('@/services/wallets')>('@/services/wallets');
  return { ...actual, fetchWallets: jest.fn() };
});

jest.mock('@/services/sources', () => {
  const actual = jest.requireActual<typeof import('@/services/sources')>('@/services/sources');
  return {
    ...actual,
    priceSources: {
      ...actual.priceSources,
      crypto: {
        id: 'kraken',
        getQuotes: jest.fn(async (symbols: string[]) => ({
          source: 'kraken',
          updatedAt: 't',
          quotes: symbols.map((symbol) => ({ symbol, price: 100, changePct: 1 })),
          unsupported: [],
        })),
        getHistory: jest.fn(async (_symbols: string[], range: string) => ({
          source: 'kraken',
          range,
          series: [],
          unsupported: [],
        })),
      },
    },
  };
});

const fetchWalletsMock = fetchWallets as jest.MockedFunction<typeof fetchWallets>;
const getQuotesMock = priceSources.crypto.getQuotes as jest.Mock;

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
          priceEur: null,
          valueEur: null,
          changePct: null,
        },
      ],
    },
    { chain: 'ethereum', ok: true, assets: [] },
  ],
};

function triggerRefresh() {
  const scroll = screen.getByTestId('screen-scroll');
  const refresh = (scroll.props as { refreshControl?: { props?: { onRefresh?: () => void } } }).refreshControl;
  if (refresh?.props?.onRefresh) {
    refresh.props.onRefresh();
    return;
  }
  fireEvent(scroll, 'refresh');
}

describe('PortfolioScreen wallets', () => {
  beforeEach(() => {
    fetchWalletsMock.mockReset();
    getQuotesMock.mockClear();
  });

  test('shows stocks and an inline note when /wallets fails', async () => {
    const stocks = await mockStockPriceSource.getQuotes(MOCK_POSITIONS.map((p) => p.symbol));
    const snapshot = buildSnapshot([...MOCK_SOURCES, TANGEM_SOURCE], MOCK_POSITIONS, stocks.quotes, 't');
    const onRetry = jest.fn();
    await renderWithProviders(
      <HoldingsBySource snapshot={snapshot} walletNote="Tangem non raggiungibile · riprova" onRetryWallets={onRetry} />,
    );
    expect(screen.getByTestId('holding-ibkr-vwce')).toBeTruthy();
    expect(screen.queryByTestId('holding-tangem-btc')).toBeNull();
    expect(screen.getByText('Tangem non raggiungibile · riprova')).toBeTruthy();
    fireEvent.press(screen.getByTestId('wallet-note'));
    expect(onRetry).toHaveBeenCalled();
  });

  test('pull-to-refresh reloads wallets and quotes', async () => {
    fetchWalletsMock.mockResolvedValue(walletsOk);

    const { unmount } = await renderWithProviders(<PortfolioScreen />);
    await waitFor(() => expect(screen.getByTestId('holding-tangem-btc')).toBeTruthy());

    const walletsBefore = fetchWalletsMock.mock.calls.length;
    const quotesBefore = getQuotesMock.mock.calls.length;

    await act(async () => {
      triggerRefresh();
    });

    await waitFor(() => {
      expect(fetchWalletsMock.mock.calls.length).toBeGreaterThan(walletsBefore);
      expect(getQuotesMock.mock.calls.length).toBeGreaterThan(quotesBefore);
    });
    unmount();
  });

  test('partial chain error keeps stocks and a per-chain note', async () => {
    fetchWalletsMock.mockResolvedValue({
      updatedAt: 't',
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
              quantity: 0.2,
              priceEur: null,
              valueEur: null,
              changePct: null,
            },
          ],
        },
        { chain: 'ethereum', ok: false, error: 'upstream', assets: [] },
      ],
    });

    const { unmount } = await renderWithProviders(<PortfolioScreen />);
    await waitFor(() => expect(screen.getByTestId('holding-tangem-btc')).toBeTruthy());
    expect(screen.getByTestId('holding-ibkr-vwce')).toBeTruthy();
    expect(screen.getByText('Ethereum non disponibile')).toBeTruthy();
    unmount();
  });
});

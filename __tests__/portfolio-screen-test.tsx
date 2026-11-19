import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import PortfolioScreen from '@/app/(invest)/portfolio';
import { HoldingsBySource } from '@/features/portfolio/holdings-by-source';
import { buildSnapshot } from '@/services/portfolio';
import { priceSources, TANGEM_SOURCE } from '@/services/sources';
import { fetchIbkrPositions } from '@/services/ibkr';
import { useUiStore } from '@/store/ui-store';
import { fetchWallets, type WalletsResponse } from '@/services/wallets';

import { FIXTURE_IBKR_POSITIONS, FIXTURE_STOCK_QUOTES, IBKR_FIXTURE, IBKR_SOURCE } from '../test/fixtures/ibkr';
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

jest.mock('@/services/ibkr', () => {
  const actual = jest.requireActual<typeof import('@/services/ibkr')>('@/services/ibkr');
  return { ...actual, fetchIbkrPositions: jest.fn() };
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
const fetchIbkrMock = fetchIbkrPositions as jest.MockedFunction<typeof fetchIbkrPositions>;
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
    fetchIbkrMock.mockReset();
    fetchIbkrMock.mockResolvedValue(IBKR_FIXTURE);
    getQuotesMock.mockReset();
    getQuotesMock.mockImplementation(async (symbols: string[]) => ({
      source: 'kraken',
      updatedAt: 't',
      quotes: symbols.map((symbol) => ({ symbol, price: 100, changePct: 1 })),
      unsupported: [],
    }));
    useUiStore.setState({ timeRange: '1W', hideBalances: false });
  });

  test('renders the Tangem-style glow hero with the 1W range selected', async () => {
    fetchWalletsMock.mockResolvedValue(walletsOk);
    const { unmount } = await renderWithProviders(<PortfolioScreen />);
    await waitFor(() => expect(screen.getByTestId('value-chart')).toBeTruthy());
    expect(screen.getByTestId('total-value')).toBeTruthy();
    expect(screen.getByTestId('hero-glow')).toBeTruthy();
    expect(screen.getByTestId('portfolio-hero')).toBeTruthy();
    expect(screen.getByTestId('range-1W').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByText('Tutto')).toBeTruthy();
    unmount();
  });

  test('a zero total shows 0% instead of NaN', async () => {
    const position = {
      id: 'ibkr-zero',
      sourceId: 'ibkr',
      symbol: 'ZERO',
      name: 'Zero',
      assetClass: 'stocks' as const,
      instrument: 'stock' as const,
      quantity: 1,
    };
    const snapshot = buildSnapshot([IBKR_SOURCE], [position], [{ symbol: 'ZERO', price: 0, changePct: 0 }], 't');
    await renderWithProviders(<HoldingsBySource snapshot={snapshot} />);
    expect(snapshot.totalValue).toBe(0);
    expect(screen.getByText('0,00%')).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  test('shows stocks and an inline note when /wallets fails', async () => {
    const snapshot = buildSnapshot([IBKR_SOURCE, TANGEM_SOURCE], FIXTURE_IBKR_POSITIONS, FIXTURE_STOCK_QUOTES, 't');
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

  test('a Kraken failure on first load still shows stocks and a partial total', async () => {
    fetchWalletsMock.mockResolvedValue(walletsOk);
    getQuotesMock.mockRejectedValue(new Error('kraken down'));

    const { unmount } = await renderWithProviders(<PortfolioScreen />);
    await waitFor(() => expect(screen.getByTestId('partial-total')).toBeTruthy());
    expect(screen.getByTestId('holding-ibkr-vwce')).toBeTruthy();
    expect(screen.queryByTestId('holding-tangem-btc')).toBeNull();
    expect(screen.getByText('Totale parziale · prezzi crypto non disponibili')).toBeTruthy();
    expect(screen.queryByTestId('portfolio-error')).toBeNull();
    unmount();
  });

  test('an IBKR failure still shows crypto and a partial total', async () => {
    fetchWalletsMock.mockResolvedValue(walletsOk);
    fetchIbkrMock.mockRejectedValue(new Error('ibkr down'));

    const { unmount } = await renderWithProviders(<PortfolioScreen />);
    await waitFor(() => expect(screen.getByTestId('holding-tangem-btc')).toBeTruthy());
    expect(screen.getByText('Totale parziale')).toBeTruthy();
    expect(screen.queryByTestId('holding-ibkr-vwce')).toBeNull();
    expect(screen.queryByTestId('portfolio-error')).toBeNull();
    expect(fetchIbkrMock.mock.calls.length).toBeLessThan(6);
    unmount();
  });
});

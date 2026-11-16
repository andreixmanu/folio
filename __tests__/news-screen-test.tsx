import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import NewsScreen from '@/app/(invest)/news';
import { resetInAppBrowserGuard } from '@/lib/open-in-app-browser';
import { useUiStore } from '@/store/ui-store';

import { renderWithProviders } from '../test/test-utils';

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return { ...actual, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
  WebBrowserPresentationStyle: { FULL_SCREEN: 'fullScreen' },
}));

jest.mock('expo-image', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Image: (props: object) => <View {...props} /> };
});

const fetchMock = jest.fn();
const originalFetch = globalThis.fetch;

type Item = {
  id: string;
  title: string;
  link: string;
  source: string;
  category: 'mercati' | 'crypto' | 'italia';
  publishedAt: string;
  summary: string;
  imageUrl?: string;
};

function items(): Item[] {
  const now = Date.now();
  return [
    {
      id: 'cnbc-1',
      title: 'Chipmakers rise on data center demand',
      link: 'https://news.example/cnbc',
      source: 'CNBC',
      category: 'mercati',
      publishedAt: new Date(now - 5 * 60_000).toISOString(),
      summary: 'Semiconductor stocks led the session.',
      imageUrl: 'https://cdn.example/cnbc.jpg',
    },
    {
      id: 'desk-1',
      title: 'Bitcoin holds above key support',
      link: 'https://news.example/btc',
      source: 'CoinDesk',
      category: 'crypto',
      publishedAt: new Date(now - 2 * 3_600_000).toISOString(),
      summary: 'ETF inflows resumed for a third day.',
    },
    {
      id: 'ansa-1',
      title: 'Piazza Affari chiude in rialzo',
      link: 'https://news.example/ansa',
      source: 'ANSA',
      category: 'italia',
      publishedAt: new Date(now - 3 * 3_600_000).toISOString(),
      summary: 'Bene banche e utility.',
    },
  ];
}

function payload(url: string) {
  const category = new URL(url).searchParams.get('category');
  const all = items();
  return {
    updatedAt: new Date().toISOString(),
    items: category ? all.filter((item) => item.category === category) : all,
    feeds: [],
  };
}

function respondOk(url: string) {
  return { ok: true, status: 200, text: async () => JSON.stringify(payload(url)) };
}

function triggerRefresh() {
  const scroll = screen.getByTestId('screen-scroll');
  const refresh = (scroll.props as { refreshControl?: { props?: { onRefresh?: () => void } } }).refreshControl;
  if (refresh?.props?.onRefresh) {
    refresh.props.onRefresh();
    return;
  }
  fireEvent(scroll, 'refresh');
}

describe('News screen', () => {
  const previousApi = process.env.EXPO_PUBLIC_API_URL;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => respondOk(url));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_API_URL = 'https://folio.test';
    useUiStore.setState({ newsFilter: 'all' });
    resetInAppBrowserGuard();
    (WebBrowser.openBrowserAsync as jest.Mock).mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (previousApi === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previousApi;
  });

  test('renders worker headlines with source and relative time', async () => {
    await renderWithProviders(<NewsScreen />);
    expect(await screen.findByText('Chipmakers rise on data center demand')).toBeTruthy();
    expect(screen.getByText('CNBC · 5 min fa')).toBeTruthy();
    expect(screen.getByText('Semiconductor stocks led the session.')).toBeTruthy();
    expect(screen.getByText('Bitcoin holds above key support')).toBeTruthy();
    expect(screen.getByText('CoinDesk · 2 h fa')).toBeTruthy();
    expect(screen.getByTestId('article-image-cnbc-1').props.source).toEqual({ uri: 'https://cdn.example/cnbc.jpg' });
    expect(screen.getByTestId('article-image-cnbc-1').props.contentFit).toBe('cover');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://folio.test/news');
  });

  test('hides a thumbnail that fails to load', async () => {
    await renderWithProviders(<NewsScreen />);
    const image = await screen.findByTestId('article-image-cnbc-1');
    await act(async () => image.props.onError?.());
    expect(screen.queryByTestId('article-image-cnbc-1')).toBeNull();
    expect(screen.getByText('Chipmakers rise on data center demand')).toBeTruthy();
  });

  test('chips request the matching category', async () => {
    await renderWithProviders(<NewsScreen />);
    expect(await screen.findByText('Piazza Affari chiude in rialzo')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('news-filter-crypto'));
    await waitFor(() => expect(screen.queryByText('Chipmakers rise on data center demand')).toBeNull());
    expect(screen.getByText('Bitcoin holds above key support')).toBeTruthy();
    expect(screen.queryByText('Piazza Affari chiude in rialzo')).toBeNull();
    expect(screen.getByTestId('news-filter-crypto').props.accessibilityState).toEqual({ selected: true });
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === 'https://folio.test/news?category=crypto')).toBe(true);

    await fireEvent.press(screen.getByTestId('news-filter-italia'));
    await waitFor(() => expect(screen.getByText('Piazza Affari chiude in rialzo')).toBeTruthy());
    expect(screen.queryByText('Bitcoin holds above key support')).toBeNull();
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === 'https://folio.test/news?category=italia')).toBe(true);

    await fireEvent.press(screen.getByTestId('news-filter-mercati'));
    await waitFor(() => expect(screen.getByText('Chipmakers rise on data center demand')).toBeTruthy());
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === 'https://folio.test/news?category=mercati')).toBe(true);
  });

  test('opens the article in the in-app browser', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: 'android' });
    try {
      await renderWithProviders(<NewsScreen />);
      await fireEvent.press(await screen.findByTestId('article-cnbc-1'));
      expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://news.example/cnbc', {
        createTask: false,
        showTitle: true,
        enableBarCollapsing: true,
        toolbarColor: '#08080B',
        secondaryToolbarColor: '#141419',
        controlsColor: '#7C6CFF',
        enableDefaultShareMenuItem: true,
      });
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, writable: true, value: originalOS });
    }
  });

  test('shows an error state and retries', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await renderWithProviders(<NewsScreen />);
    expect(await screen.findByTestId('news-error')).toBeTruthy();
    expect(screen.getByText('Notizie non disponibili')).toBeTruthy();

    fetchMock.mockImplementation(async (url: string) => respondOk(url));
    await fireEvent.press(screen.getByText('Riprova'));
    expect(await screen.findByText('Chipmakers rise on data center demand')).toBeTruthy();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('pull-to-refresh refetches the feed', async () => {
    await renderWithProviders(<NewsScreen />);
    await screen.findByText('Chipmakers rise on data center demand');
    const before = fetchMock.mock.calls.length;

    await act(async () => {
      triggerRefresh();
    });
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });
});

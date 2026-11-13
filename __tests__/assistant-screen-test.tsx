import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

import AssistantScreen from '@/app/(tabs)/assistant';
import { buildPortfolioContext } from '@/services/chat/context';
import { useChatStore } from '@/services/chat/store';
import type { PortfolioSnapshot } from '@/services/types';
import { useUiStore } from '@/store/ui-store';
import { layout, spacing } from '@/theme/spacing';

import { renderWithProviders } from '../test/test-utils';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));

const safeArea = { top: 0, bottom: 0, left: 0, right: 0 };

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return { ...actual, useSafeAreaInsets: () => safeArea };
});

const mockPortfolio: PortfolioSnapshot = {
  baseCurrency: 'EUR',
  totalValue: 1000,
  dayChange: 10,
  dayChangePct: 1,
  unpriced: [],
  updatedAt: '2026-11-13T00:00:00Z',
  sources: [],
  holdings: [
    {
      id: '1',
      sourceId: 'ibkr',
      symbol: 'VWCE',
      name: 'Vanguard FTSE All-World',
      assetClass: 'stocks',
      instrument: 'etf',
      quantity: 2,
      price: 300,
      value: 600,
      changePct: 1.5,
    },
    {
      id: '2',
      sourceId: 'ledger',
      symbol: 'BTC',
      name: 'Bitcoin',
      assetClass: 'crypto',
      instrument: 'coin',
      quantity: 0.4,
      price: 1000,
      value: 400,
      changePct: -2,
    },
  ],
};

jest.mock('@/services/hooks', () => ({
  usePortfolio: () => ({
    data: mockPortfolio,
    status: 'live' as const,
    isRefetching: false,
    refetch: jest.fn(),
  }),
}));

const fetchMock = expoFetch as jest.MockedFunction<typeof expoFetch>;

const SUGGESTION = "Com'è esposto il mio portafoglio sulla tech?";

function sseBody(chunks: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function okStream(text: string) {
  const payload = [
    `event: delta\ndata: ${JSON.stringify({ text: text.slice(0, 4) })}\n\n`,
    `event: delta\ndata: ${JSON.stringify({ text: text.slice(4) })}\n\n`,
    'event: sources\ndata: {"sources":[{"title":"Kraken","url":"https://www.kraken.com/prices"}]}\n\n',
    'event: done\ndata: {}\n\n',
  ];
  return {
    ok: true,
    status: 200,
    body: sseBody(payload),
    text: async () => payload.join(''),
  };
}

describe('Assistant screen', () => {
  const previousApi = process.env.EXPO_PUBLIC_API_URL;
  const previousToken = process.env.EXPO_PUBLIC_CHAT_TOKEN;

  beforeEach(async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://folio.test/api';
    process.env.EXPO_PUBLIC_CHAT_TOKEN = 'test-token';
    safeArea.top = 0;
    safeArea.bottom = 0;
    safeArea.left = 0;
    safeArea.right = 0;
    useUiStore.setState({ hideBalances: false });
    fetchMock.mockReset();
    await AsyncStorage.clear();
    useChatStore.getState().newChat();
    await useChatStore.persist.clearStorage();
    useChatStore.setState({ messages: [], status: 'idle' });
  });

  afterAll(() => {
    process.env.EXPO_PUBLIC_API_URL = previousApi;
    process.env.EXPO_PUBLIC_CHAT_TOKEN = previousToken;
  });

  test('shows suggestion chips and the disclaimer', async () => {
    await renderWithProviders(<AssistantScreen />);
    expect(screen.getByText('Chiedimi di mercati, ETF, crypto, macro o del tuo portafoglio.')).toBeTruthy();
    expect(screen.getByText('Non è consulenza finanziaria.')).toBeTruthy();
    expect(screen.getByTestId('suggestion-0')).toBeTruthy();
    expect(screen.getByTestId('suggestion-1')).toBeTruthy();
    expect(screen.getByTestId('suggestion-2')).toBeTruthy();
    expect(screen.getByTestId('suggestion-3')).toBeTruthy();
    expect(screen.getByText('Cosa muove BTC oggi?')).toBeTruthy();
    expect(screen.getByText('Riassumi i rischi del mio portafoglio')).toBeTruthy();
    expect(screen.getByText('Come stanno andando gli ETF azionari globali?')).toBeTruthy();
    expect(screen.getByLabelText('Nuova chat').props.accessibilityState).toEqual({ disabled: true });
  });

  test('sends a suggestion with the portfolio context and renders the stream', async () => {
    fetchMock.mockResolvedValue(okStream('Ciao mondo') as never);
    await renderWithProviders(<AssistantScreen />);
    await fireEvent.press(screen.getByTestId('suggestion-0'));

    expect(await screen.findByText(/Ciao mondo/)).toBeTruthy();
    expect(screen.queryByText('kraken.com')).toBeNull();
    expect(useChatStore.getState().messages.some((message) => message.sources?.length)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://folio.test/api/chat');
    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers.Accept).toBe('text/event-stream');
    expect(headers['X-Folio-Token']).toBe('test-token');
    expect(JSON.parse(String(init?.body))).toEqual({
      messages: [{ role: 'user', content: SUGGESTION }],
      portfolio: buildPortfolioContext(mockPortfolio, false),
    });
  });

  test('shows a stop button while streaming and aborts on press', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => {
      signal = init?.signal ?? undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const abort = () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            try {
              controller.error(error);
            } catch {
              /* already closed */
            }
          };
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener('abort', abort, { once: true });
        },
      });
      return Promise.resolve({ ok: true, status: 200, body, text: async () => '' } as never);
    });

    await renderWithProviders(<AssistantScreen />);
    await fireEvent.press(screen.getByTestId('suggestion-1'));
    expect(await screen.findByTestId('chat-stop')).toBeTruthy();
    expect(screen.queryByTestId('chat-send')).toBeNull();

    await fireEvent.press(screen.getByTestId('chat-stop'));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('chat-stop')).toBeNull());
    expect(screen.getByTestId('chat-send')).toBeTruthy();
  });

  test('shows the login_required error with Riprova', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      body: null,
      text: async () =>
        JSON.stringify({
          error: 'login_required',
          message: 'Accesso xAI scaduto: rifai il login (npm run login:xai).',
        }),
    } as never);

    await renderWithProviders(<AssistantScreen />);
    await fireEvent.press(screen.getByTestId('suggestion-2'));
    expect(await screen.findByText(/npm run login:xai/)).toBeTruthy();
    expect(screen.getByText('Riprova')).toBeTruthy();
  });

  test('lifts the composer above the Android keyboard and restores tab clearance', async () => {
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true, writable: true });
    // Edge-to-edge: the window is shorter than the screen by the status + nav bars.
    // The covered height must still be 328 (keyboard 280 + nav inset 48), not the
    // undershooting window-based overlap.
    const screenH = 800;
    const windowH = screenH - 72;
    safeArea.bottom = 48;
    const dimensionsSpy = jest.spyOn(Dimensions, 'get').mockImplementation((dim) => {
      if (dim === 'screen') return { width: 400, height: screenH, scale: 2, fontScale: 1 };
      return { width: 400, height: windowH, scale: 2, fontScale: 1 };
    });
    const listeners = new Map<string, (event: KeyboardEvent) => void>();
    const spy = jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      listeners.set(eventName, listener as (event: KeyboardEvent) => void);
      return { remove: jest.fn() };
    });

    try {
      await renderWithProviders(<AssistantScreen />);
      const tabClearance = safeArea.bottom + layout.tabBarHeight + layout.tabBarBottomGap;
      const heightOf = () => {
        const style = screen.getByTestId('assistant-bottom-spacer').props.style as { height?: number };
        return style.height ?? 0;
      };
      expect(heightOf()).toBe(tabClearance);

      const show = listeners.get('keyboardDidShow');
      expect(show).toBeDefined();
      await act(() => {
        show?.({
          duration: 0,
          easing: 'keyboard',
          endCoordinates: {
            screenX: 0,
            screenY: screenH - 328,
            width: 400,
            height: 280,
          },
        });
      });
      expect(heightOf()).toBe(328 + spacing.sm);

      const hide = listeners.get('keyboardDidHide');
      expect(hide).toBeDefined();
      await act(() => {
        hide?.({
          duration: 0,
          easing: 'keyboard',
          endCoordinates: {
            screenX: 0,
            screenY: screenH,
            width: 400,
            height: 0,
          },
        });
      });
      expect(heightOf()).toBe(tabClearance);
    } finally {
      spy.mockRestore();
      dimensionsSpy.mockRestore();
      safeArea.bottom = 0;
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true, writable: true });
    }
  });

  test('shows a status line until the first delta', async () => {
    let push: (chunk: string) => void = () => {};
    let close: () => void = () => {};
    fetchMock.mockImplementation(() => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          push = (chunk: string) => controller.enqueue(encoder.encode(chunk));
          close = () => controller.close();
        },
      });
      return Promise.resolve({ ok: true, status: 200, body, text: async () => '' } as never);
    });

    await renderWithProviders(<AssistantScreen />);
    await fireEvent.press(screen.getByTestId('suggestion-1'));
    expect(await screen.findByText('Sto pensando…')).toBeTruthy();

    await act(() => {
      push('event: status\ndata: {"phase":"searching_web"}\n\n');
    });
    expect(await screen.findByText('Sto cercando sul web…')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Sto pensando…')).toBeNull());

    await act(() => {
      push('event: delta\ndata: {"text":"Bitcoin sale"}\n\n');
      push('event: done\ndata: {}\n\n');
      close();
    });
    expect(await screen.findByText(/Bitcoin sale/)).toBeTruthy();
    expect(screen.queryByText('Sto pensando…')).toBeNull();
    expect(screen.queryByText('Sto cercando sul web…')).toBeNull();
    expect(screen.queryByText('Sto cercando su X…')).toBeNull();
  });

  test('does not render sources saved on an old message', async () => {
    useChatStore.setState({
      messages: [
        {
          id: 'old-1',
          role: 'assistant',
          content: 'Vecchia risposta',
          createdAt: 1,
          sources: [{ title: 'Kraken', url: 'https://www.kraken.com/prices' }],
        },
      ],
      status: 'idle',
    });
    await renderWithProviders(<AssistantScreen />);
    expect(screen.getByText(/Vecchia risposta/)).toBeTruthy();
    expect(screen.queryByText('kraken.com')).toBeNull();
    expect(screen.queryByText('Kraken')).toBeNull();
  });

  test('Nuova chat clears the conversation', async () => {
    fetchMock.mockResolvedValue(okStream('Risposta breve') as never);
    await renderWithProviders(<AssistantScreen />);
    await fireEvent.press(screen.getByTestId('suggestion-3'));
    expect(await screen.findByText(/Risposta breve/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Nuova chat'));
    await waitFor(() => expect(screen.queryByText(/Risposta breve/)).toBeNull());
    expect(screen.getByTestId('suggestion-0')).toBeTruthy();
    expect(screen.getByText('Non è consulenza finanziaria.')).toBeTruthy();
  });
});

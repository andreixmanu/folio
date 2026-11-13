import { act, renderHook } from '@testing-library/react-native';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

import { keyboardCoveredHeight, useKeyboardInset, type KeyboardCoverMetrics } from '@/lib/use-keyboard-visible';

const safeArea = { top: 0, bottom: 0, left: 0, right: 0 };

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual<typeof import('react-native-safe-area-context')>(
    'react-native-safe-area-context',
  );
  return {
    ...actual,
    useSafeAreaInsets: () => safeArea,
  };
});

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
}

function frame(height: number, screenY: number): KeyboardEvent {
  return {
    duration: 0,
    easing: 'keyboard',
    endCoordinates: { screenX: 0, screenY, width: 400, height },
  };
}

describe('keyboardCoveredHeight', () => {
  const screenH = 800;

  test('android adds the nav inset and the screen-space overlap', () => {
    const metrics: KeyboardCoverMetrics = {
      platform: 'android',
      screenHeight: screenH,
      windowHeight: screenH,
      bottomInset: 48,
    };
    expect(keyboardCoveredHeight(frame(280, screenH - 328), metrics)).toBe(328);
  });

  test('android ignores a shorter window height (edge-to-edge)', () => {
    const windowHeight = screenH - 72;
    const screenY = screenH - 328;
    const undershoot = windowHeight - screenY;
    expect(undershoot).toBe(256);
    const metrics: KeyboardCoverMetrics = {
      platform: 'android',
      screenHeight: screenH,
      windowHeight,
      bottomInset: 48,
    };
    expect(keyboardCoveredHeight(frame(280, screenY), metrics)).toBe(328);
  });

  test('android prefers the screen-space overlap when it is larger than height plus inset', () => {
    const metrics: KeyboardCoverMetrics = {
      platform: 'android',
      screenHeight: screenH,
      windowHeight: screenH - 72,
      bottomInset: 48,
    };
    // height + inset = 248, screen delta = 360, window delta = 288.
    expect(keyboardCoveredHeight(frame(200, screenH - 360), metrics)).toBe(360);
  });

  test('android with screenY 0 uses height plus the nav inset', () => {
    const metrics: KeyboardCoverMetrics = {
      platform: 'android',
      screenHeight: screenH,
      windowHeight: screenH - 72,
      bottomInset: 48,
    };
    expect(keyboardCoveredHeight(frame(280, 0), metrics)).toBe(328);
  });

  test('android ignores a bogus screenY that covers most of the screen', () => {
    const metrics: KeyboardCoverMetrics = {
      platform: 'android',
      screenHeight: screenH,
      windowHeight: screenH,
      bottomInset: 48,
    };
    // screenH - 10 = 790 > 0.8 * screenH, so the term is dropped.
    expect(keyboardCoveredHeight(frame(280, 10), metrics)).toBe(328);
  });

  test('ios uses windowHeight minus screenY and does not add the inset', () => {
    const metrics: KeyboardCoverMetrics = {
      platform: 'ios',
      screenHeight: 900,
      windowHeight: 800,
      bottomInset: 34,
    };
    expect(keyboardCoveredHeight(frame(999, 500), metrics)).toBe(300);
    expect(keyboardCoveredHeight(frame(280, 0), metrics)).toBe(280);
  });

  test('web is always closed', () => {
    const metrics: KeyboardCoverMetrics = {
      platform: 'web',
      screenHeight: screenH,
      windowHeight: screenH,
      bottomInset: 48,
    };
    expect(keyboardCoveredHeight(frame(320, 400), metrics)).toBe(0);
  });
});

describe('useKeyboardInset', () => {
  const originalOS = Platform.OS;
  let listeners: Map<string, (event: KeyboardEvent) => void>;

  beforeEach(() => {
    safeArea.bottom = 0;
    listeners = new Map();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      listeners.set(eventName, listener as (event: KeyboardEvent) => void);
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    setPlatform(originalOS);
    safeArea.bottom = 0;
    jest.restoreAllMocks();
  });

  test('android show reports the covered height and hide closes it', async () => {
    setPlatform('android');
    const windowHeight = Dimensions.get('window').height;
    const { result } = await renderHook(() => useKeyboardInset());
    expect(result.current).toMatchObject({ visible: false, height: 0 });

    const show = listeners.get('keyboardDidShow');
    expect(show).toBeDefined();
    await act(() => {
      show?.(frame(300, windowHeight - 300));
    });
    expect(result.current).toMatchObject({ visible: true, height: 300 });

    const hide = listeners.get('keyboardDidHide');
    expect(hide).toBeDefined();
    await act(() => {
      hide?.(frame(0, windowHeight));
    });
    expect(result.current).toMatchObject({ visible: false, height: 0 });
  });

  test('android edge-to-edge uses the screen and the safe-area inset, not the short window', async () => {
    setPlatform('android');
    safeArea.bottom = 48;
    const screenH = 800;
    jest.spyOn(Dimensions, 'get').mockImplementation((dim) => {
      if (dim === 'screen') return { width: 400, height: screenH, scale: 2, fontScale: 1 };
      return { width: 400, height: screenH - 72, scale: 2, fontScale: 1 };
    });

    const { result } = await renderHook(() => useKeyboardInset());
    await act(() => {
      listeners.get('keyboardDidShow')?.(frame(280, screenH - 328));
    });
    expect(result.current).toMatchObject({ visible: true, height: 328 });
  });

  test('android keyboardDidShow updates when the height changes', async () => {
    setPlatform('android');
    safeArea.bottom = 48;
    const screenH = 800;
    jest.spyOn(Dimensions, 'get').mockImplementation((dim) => {
      if (dim === 'screen') return { width: 400, height: screenH, scale: 2, fontScale: 1 };
      return { width: 400, height: screenH, scale: 2, fontScale: 1 };
    });

    const { result } = await renderHook(() => useKeyboardInset());
    const show = listeners.get('keyboardDidShow');
    await act(() => {
      show?.(frame(280, 0));
    });
    expect(result.current.height).toBe(328);

    await act(() => {
      show?.(frame(360, 0));
    });
    expect(result.current).toMatchObject({ visible: true, height: 408 });
  });

  test('falls back to endCoordinates.height plus the inset when screenY is 0', async () => {
    setPlatform('android');
    safeArea.bottom = 48;
    const { result } = await renderHook(() => useKeyboardInset());
    const show = listeners.get('keyboardDidShow');
    await act(() => {
      show?.(frame(280, 0));
    });
    expect(result.current).toMatchObject({ visible: true, height: 328 });
  });

  test('web returns a closed inset and does not subscribe', async () => {
    setPlatform('web');
    const { result } = await renderHook(() => useKeyboardInset());
    expect(result.current).toEqual({ visible: false, height: 0, duration: 0 });
    expect(listeners.size).toBe(0);
  });
});

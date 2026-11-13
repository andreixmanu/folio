import { act, renderHook } from '@testing-library/react-native';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

import { useKeyboardInset } from '@/lib/use-keyboard-visible';

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
}

describe('useKeyboardInset', () => {
  const originalOS = Platform.OS;
  let listeners: Map<string, (event: KeyboardEvent) => void>;

  beforeEach(() => {
    listeners = new Map();
    jest.spyOn(Keyboard, 'addListener').mockImplementation((eventName, listener) => {
      listeners.set(eventName, listener as (event: KeyboardEvent) => void);
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    setPlatform(originalOS);
    jest.restoreAllMocks();
  });

  test('android show reports the window overlap and hide closes it', async () => {
    setPlatform('android');
    const windowHeight = Dimensions.get('window').height;
    const { result } = await renderHook(() => useKeyboardInset());
    expect(result.current).toMatchObject({ visible: false, height: 0 });

    const show = listeners.get('keyboardDidShow');
    expect(show).toBeDefined();
    await act(() => {
      show?.({
        duration: 0,
        easing: 'keyboard',
        endCoordinates: {
          screenX: 0,
          screenY: windowHeight - 300,
          width: 400,
          height: 300,
        },
      });
    });
    expect(result.current).toMatchObject({ visible: true, height: 300 });

    const hide = listeners.get('keyboardDidHide');
    expect(hide).toBeDefined();
    await act(() => {
      hide?.({
        duration: 0,
        easing: 'keyboard',
        endCoordinates: {
          screenX: 0,
          screenY: windowHeight,
          width: 400,
          height: 0,
        },
      });
    });
    expect(result.current).toMatchObject({ visible: false, height: 0 });
  });

  test('falls back to endCoordinates.height when screenY is 0', async () => {
    setPlatform('android');
    const { result } = await renderHook(() => useKeyboardInset());
    const show = listeners.get('keyboardDidShow');
    await act(() => {
      show?.({
        duration: 0,
        easing: 'keyboard',
        endCoordinates: { screenX: 0, screenY: 0, width: 400, height: 280 },
      });
    });
    expect(result.current).toMatchObject({ visible: true, height: 280 });
  });

  test('web returns a closed inset and does not subscribe', async () => {
    setPlatform('web');
    const { result } = await renderHook(() => useKeyboardInset());
    expect(result.current).toEqual({ visible: false, height: 0, duration: 0 });
    expect(listeners.size).toBe(0);
  });
});

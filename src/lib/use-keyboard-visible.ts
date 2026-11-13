import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

export type KeyboardInset = {
  /** Whether the software keyboard is open. */
  visible: boolean;
  /**
   * Overlap of the keyboard with the bottom of the window, in px.
   * Already includes the navigation bar / home indicator on edge-to-edge Android.
   */
  height: number;
  /** Native keyboard animation duration in ms. Android did-events report 0. */
  duration: number;
};

const CLOSED: KeyboardInset = { visible: false, height: 0, duration: 0 };

/**
 * Distance the keyboard covers from the bottom of the window.
 * `screenY` is the top of the keyboard in screen coordinates; when it is missing
 * or 0, fall back to the event's own height.
 */
function keyboardOverlap(event: KeyboardEvent): number {
  const end = event.endCoordinates;
  const screenY = end?.screenY;
  if (screenY == null || screenY === 0) {
    return Math.max(0, end?.height ?? 0);
  }
  const windowHeight = Dimensions.get('window').height;
  return Math.max(0, windowHeight - screenY);
}

function insetFromFrame(event: KeyboardEvent): KeyboardInset {
  const height = keyboardOverlap(event);
  return { visible: height > 0, height, duration: event.duration ?? 0 };
}

/**
 * Software-keyboard overlap with the bottom of the window.
 *
 * Expo SDK 58 / RN 0.88 is always edge-to-edge on Android (Expo Go included).
 * The window is not resized when the keyboard opens, and `app.json` does not set
 * `softwareKeyboardLayoutMode` — `adjustResize` would not move layout anyway.
 * Callers pad by `height` instead of relying on the window shrinking.
 *
 * iOS: `keyboardWillShow` / `keyboardWillHide` / `keyboardWillChangeFrame`
 * (will-events track the animation). Android: `keyboardDidShow` /
 * `keyboardDidHide` only. Web always returns a closed inset.
 */
export function useKeyboardInset(): KeyboardInset {
  const [inset, setInset] = useState<KeyboardInset>(CLOSED);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onFrame = (event: KeyboardEvent) => setInset(insetFromFrame(event));
    const onHide = (event: KeyboardEvent) =>
      setInset({ visible: false, height: 0, duration: event.duration ?? 0 });

    if (Platform.OS === 'ios') {
      const show = Keyboard.addListener('keyboardWillShow', onFrame);
      const change = Keyboard.addListener('keyboardWillChangeFrame', onFrame);
      const hide = Keyboard.addListener('keyboardWillHide', onHide);
      return () => {
        show.remove();
        change.remove();
        hide.remove();
      };
    }

    const show = Keyboard.addListener('keyboardDidShow', onFrame);
    const hide = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (Platform.OS === 'web') return CLOSED;
  return inset;
}

/** Whether the software keyboard is open. Thin wrapper over {@link useKeyboardInset}. */
export function useKeyboardVisible(): boolean {
  return useKeyboardInset().visible;
}

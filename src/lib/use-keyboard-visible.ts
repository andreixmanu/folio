import { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type KeyboardInset = {
  /** Whether the software keyboard is open. */
  visible: boolean;
  /**
   * Distance the keyboard covers from the bottom of our root view, in dp.
   * On edge-to-edge Android this includes the navigation bar (the root view
   * extends to the physical bottom of the screen).
   */
  height: number;
  /** Native keyboard animation duration in ms. Android did-events report 0. */
  duration: number;
};

/** Metrics for {@link keyboardCoveredHeight}. Pass the live values from the caller. */
export type KeyboardCoverMetrics = {
  platform: typeof Platform.OS;
  /** `Dimensions.get('screen').height` — full display, including system bars. */
  screenHeight: number;
  /** `Dimensions.get('window').height`. iOS keyboard coordinates are window-based. */
  windowHeight: number;
  /** Safe-area bottom inset: navigation bar on Android, home indicator on iOS. */
  bottomInset: number;
};

const CLOSED: KeyboardInset = { visible: false, height: 0, duration: 0 };

/**
 * How far the open keyboard covers the bottom of our root view, in dp.
 *
 * Android (`checkForKeyboardEvents`) reports `endCoordinates.height` as
 * `imeInsets.bottom - systemBars.bottom` — the keyboard excluding the
 * navigation bar — and `screenY` from `getWindowVisibleDisplayFrame().bottom`
 * in screen dp. Edge-to-edge `Dimensions` window height is a different space
 * (it can exclude the status and nav bars), so `windowHeight - screenY`
 * undershoots. The root view reaches the physical bottom, so the covered
 * distance is `imeInsets.bottom` = `height + bottomInset`, cross-checked
 * against `screenHeight - screenY`.
 *
 * A missing or zero `screenY`, or a delta larger than 80% of the screen, is
 * ignored (bogus). The result is clamped to `[0, screenHeight * 0.75]`.
 *
 * iOS coordinates are window-based and already correct (`windowHeight - screenY`,
 * falling back to `end.height`). Web has no software-keyboard inset.
 */
export function keyboardCoveredHeight(event: KeyboardEvent, metrics: KeyboardCoverMetrics): number {
  if (metrics.platform === 'web') return 0;

  const end = event.endCoordinates;
  const reported = Math.max(0, end?.height ?? 0);
  const screenY = end?.screenY;

  if (metrics.platform !== 'android') {
    if (screenY == null || screenY === 0) return reported;
    return Math.max(0, metrics.windowHeight - screenY);
  }

  const { screenHeight } = metrics;
  let fromScreen = 0;
  if (screenY != null && screenY > 0 && screenHeight > 0) {
    const delta = screenHeight - screenY;
    // Drop nonsense frames (screenY near 0, or a delta that is most of the screen).
    if (delta > 0 && delta <= screenHeight * 0.8) fromScreen = delta;
  }

  const covered = Math.max(reported + Math.max(0, metrics.bottomInset), fromScreen);
  const cap = screenHeight > 0 ? screenHeight * 0.75 : 0;
  if (cap <= 0) return 0;
  return Math.min(Math.max(0, covered), cap);
}

function publishInset(
  setInset: (value: KeyboardInset | ((prev: KeyboardInset) => KeyboardInset)) => void,
  next: KeyboardInset,
) {
  setInset((prev) =>
    prev.visible === next.visible && prev.height === next.height && prev.duration === next.duration
      ? prev
      : next,
  );
}

/**
 * Software-keyboard overlap with the bottom of our root view.
 *
 * Expo SDK 58 / RN 0.88 is always edge-to-edge on Android (Expo Go included).
 * The window is not resized when the keyboard opens, and `app.json` does not set
 * `softwareKeyboardLayoutMode` — `adjustResize` would not move layout anyway.
 * Callers pad by `height` instead of relying on the window shrinking.
 *
 * iOS: `keyboardWillShow` / `keyboardWillHide` / `keyboardWillChangeFrame`
 * (will-events track the animation). Android: `keyboardDidShow` /
 * `keyboardDidHide`. `keyboardDidShow` is re-emitted when the height changes
 * while the keyboard stays up (emoji panel, Samsung toolbar row), and that
 * updates `height`. Web always returns a closed inset.
 */
export function useKeyboardInset(): KeyboardInset {
  const bottomInset = useSafeAreaInsets().bottom;
  const lastEventRef = useRef<KeyboardEvent | null>(null);
  const [inset, setInset] = useState<KeyboardInset>(CLOSED);

  const applyFrame = useCallback((event: KeyboardEvent, insetBottom: number) => {
    const height = keyboardCoveredHeight(event, {
      platform: Platform.OS,
      screenHeight: Dimensions.get('screen').height,
      windowHeight: Dimensions.get('window').height,
      bottomInset: insetBottom,
    });
    publishInset(setInset, { visible: height > 0, height, duration: event.duration ?? 0 });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onFrame = (event: KeyboardEvent) => {
      lastEventRef.current = event;
      applyFrame(event, bottomInset);
    };
    const onHide = (event: KeyboardEvent) => {
      lastEventRef.current = null;
      publishInset(setInset, { visible: false, height: 0, duration: event.duration ?? 0 });
    };

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
  }, [applyFrame, bottomInset]);

  // Safe area can arrive after the first keyboard event (nav bar measured late).
  // Recompute the open frame with the new inset; do not add it a second time later.
  useEffect(() => {
    const event = lastEventRef.current;
    if (!event || Platform.OS === 'web') return;
    applyFrame(event, bottomInset);
  }, [applyFrame, bottomInset]);

  if (Platform.OS === 'web') return CLOSED;
  return inset;
}

/** Whether the software keyboard is open. Thin wrapper over {@link useKeyboardInset}. */
export function useKeyboardVisible(): boolean {
  return useKeyboardInset().visible;
}

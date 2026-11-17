import { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { switchMode } from '@/lib/switch-mode';
import { useModeTransitionStore } from '@/store/mode-transition-store';
import { modeAccents, useTheme } from '@/theme';

const EASE = Easing.out(Easing.cubic);
/** Base diameter. Scale is chosen so the circle reaches the farthest corner. */
const BASE = 48;

function coverScale(origin: { x: number; y: number }, width: number, height: number): number {
  const distance = Math.max(
    Math.hypot(origin.x, origin.y),
    Math.hypot(width - origin.x, origin.y),
    Math.hypot(origin.x, height - origin.y),
    Math.hypot(width - origin.x, height - origin.y),
  );
  return (distance * 2) / BASE;
}

/**
 * Full-screen expand from the control that asked to switch modes.
 * The route change happens when the circle covers the screen, then the tint fades.
 */
export function ModeTransitionOverlay() {
  const active = useModeTransitionStore((s) => s.active);
  const origin = useModeTransitionStore((s) => s.origin);
  const target = useModeTransitionStore((s) => s.target);
  const theme = useTheme();
  const reduced = useReducedMotion() === true;
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(1);
  const generation = useRef(0);

  useEffect(() => {
    if (!active || !target || !origin) return;
    const token = ++generation.current;
    const targetMode = target;
    const reducedMotion = reduced;

    const finish = () => {
      if (generation.current !== token) return;
      useModeTransitionStore.getState().finish();
    };

    const fadeOut = () => {
      opacity.set(
        withTiming(0, { duration: reducedMotion ? 200 : 220, easing: EASE }, (finished) => {
          if (finished) scheduleOnRN(finish);
        }),
      );
    };

    const commit = () => {
      if (generation.current !== token) return;
      switchMode(targetMode);
      fadeOut();
    };

    opacity.set(1);

    if (reducedMotion) {
      // Tests and Reduce Motion: no circle. Switch before the fade so callers see the new mode immediately.
      commit();
      return;
    }

    scale.set(0);
    scale.set(
      withTiming(coverScale(origin, width, height), { duration: 260, easing: EASE }, (finished) => {
        if (finished) scheduleOnRN(commit);
      }),
    );
  }, [active, height, opacity, origin, reduced, scale, target, width]);

  const circleStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
  }));

  if (!active || !target || !origin) return null;

  const accent = modeAccents[theme.scheme][target].accent;
  const tint = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity: 0.22 }]} />
  );

  return (
    <View testID="mode-transition-overlay" pointerEvents="none" style={StyleSheet.absoluteFill}>
      {reduced ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }, fadeStyle]}>
          {tint}
        </Animated.View>
      ) : (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: origin.x - BASE / 2,
              top: origin.y - BASE / 2,
              width: BASE,
              height: BASE,
              borderRadius: BASE / 2,
              backgroundColor: theme.colors.background,
              overflow: 'hidden',
            },
            circleStyle,
          ]}>
          {tint}
        </Animated.View>
      )}
    </View>
  );
}

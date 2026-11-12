import { Platform } from 'react-native';
import {
  Easing,
  FadeIn,
  FadeOut,
  Keyframe,
  LinearTransition,
  type WithTimingConfig,
} from 'react-native-reanimated';

/**
 * Motion tokens. Everything is timing-based with ease-out curves: no springs, no overshoot.
 * Short durations keep the UI feeling precise rather than playful.
 */
const easeOut = Easing.bezier(0.22, 1, 0.36, 1); // "ease-out-quint"-like, settles softly
// easeOutCubic as a bezier, so web layout animations get the same curve (not linear).
const standard = Easing.bezier(0.33, 1, 0.68, 1);

export const easings = { easeOut, standard } as const;

export const timings = {
  /** Press-in feedback. */
  pressIn: { duration: 120, easing: standard } satisfies WithTimingConfig,
  /** Release back to rest. */
  pressOut: { duration: 180, easing: standard } satisfies WithTimingConfig,
  /** Sliding indicators (tab pill, segmented thumb). */
  indicator: { duration: 220, easing: easeOut } satisfies WithTimingConfig,
  /** Color / opacity changes. */
  fade: { duration: 180, easing: standard } satisfies WithTimingConfig,
  /** Total value counter. */
  counter: { duration: 600, easing: easeOut } satisfies WithTimingConfig,
} as const;

/** Subtle press scale used across the app. */
export const PRESS_SCALE = 0.98;

/** Stagger between entering items (ms), capped so long lists don't trail. */
export const STAGGER_MS = 30;
const MAX_STAGGER_STEPS = 5;

export function staggerDelay(index: number): number {
  return Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS;
}

/**
 * Entrance: fade + 6px rise, 220ms ease-out.
 * On web, Reanimated's Keyframe entering leaves the wrapper `position: absolute` when the
 * child re-lays out mid-animation, so web uses a plain fade with the same timing.
 */
export function enterUp(index = 0) {
  if (Platform.OS === 'web') return enterFade(index);
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 6 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }], easing: easeOut },
  })
    .duration(220)
    .delay(staggerDelay(index));
}

export const enterFade = (index = 0) =>
  FadeIn.duration(200).easing(standard).delay(staggerDelay(index));
export const exitFade = FadeOut.duration(120).easing(standard);
/** Layout transition for reflowing lists (no spring). */
export const layoutTransition = LinearTransition.duration(200).easing(standard);

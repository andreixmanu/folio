import { Easing, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

/** Shared motion tokens so every interaction feels consistent. */
export const springs = {
  /** Press feedback: quick and slightly bouncy. */
  press: { damping: 18, stiffness: 320, mass: 0.6 } satisfies WithSpringConfig,
  /** Sliding indicators (tab pill, segmented thumb). */
  indicator: { damping: 22, stiffness: 260, mass: 0.8 } satisfies WithSpringConfig,
} as const;

export const timings = {
  counter: { duration: 900, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  fade: { duration: 220, easing: Easing.out(Easing.quad) } satisfies WithTimingConfig,
} as const;

/** Stagger between list items in entering animations (ms). */
export const STAGGER_MS = 45;

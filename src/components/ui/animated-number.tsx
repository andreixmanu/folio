import { useEffect, useState } from 'react';
import {
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { MASK } from '@/lib/format';
import { timings } from '@/theme';

import { AppText, type AppTextProps } from './text';

export type AnimatedNumberProps = Omit<AppTextProps, 'children'> & {
  value: number;
  format: (value: number) => string;
  /** Value the counter starts from on first mount. */
  from?: number;
  masked?: boolean;
};

/**
 * Animated counter: tweens from the previous value to the new one on the UI thread
 * (Reanimated `withTiming`) and mirrors frames to the JS text. The accessibility label
 * always carries the final value.
 */
export function AnimatedNumber({ value, format, from = 0, masked = false, ...textProps }: AnimatedNumberProps) {
  const progress = useSharedValue(from);
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    progress.set(withTiming(value, timings.counter));
  }, [progress, value]);

  useAnimatedReaction(
    () => progress.get(),
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setDisplay, current);
    },
  );

  const finalText = masked ? MASK : format(value);
  return (
    <AppText tabular accessibilityLabel={finalText} {...textProps}>
      {masked ? MASK : format(display)}
    </AppText>
  );
}

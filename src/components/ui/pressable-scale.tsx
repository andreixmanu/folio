import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { PRESS_SCALE, timings } from '@/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Scale applied while pressed. */
  scaleTo?: number;
  /** Haptic played on press; `false` disables it. No-op on web. */
  haptic?: 'selection' | 'light' | 'medium' | false;
};

/** Pressable with subtle timing-based press-scale feedback and haptics. */
export function PressableScale({
  scaleTo = PRESS_SCALE,
  haptic = 'light',
  onPressIn,
  onPressOut,
  onPress,
  style,
  children,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        scale.set(withTiming(scaleTo, timings.pressIn));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(withTiming(1, timings.pressOut));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) haptics[haptic]();
        onPress?.(e);
      }}
      style={[style, animatedStyle]}>
      {children}
    </AnimatedPressable>
  );
}

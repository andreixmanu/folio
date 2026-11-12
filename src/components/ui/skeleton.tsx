import { useEffect } from 'react';
import type { DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme';

/** Pulsing placeholder block shown while queries load. */
export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const theme = useTheme();
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(1, { duration: 700 }), -1, true));
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.colors.surfaceMuted },
        style,
      ]}
    />
  );
}

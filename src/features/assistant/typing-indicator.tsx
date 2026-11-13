import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { easings, useTheme } from '@/theme';

function Dot({ delay }: { delay: number }) {
  const theme = useTheme();
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.set(
      withDelay(
        delay,
        withRepeat(withTiming(1, { duration: 480, easing: easings.standard }), -1, true),
      ),
    );
    return () => cancelAnimation(opacity);
  }, [delay, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      style={[
        { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.textSecondary },
        style,
      ]}
    />
  );
}

/** Three dots fading on a timing loop while the assistant message is still empty. */
export function TypingIndicator() {
  const theme = useTheme();
  return (
    <View
      accessibilityLabel="L'assistente sta scrivendo"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 20, paddingVertical: theme.spacing.xxs }}>
      <Dot delay={0} />
      <Dot delay={160} />
      <Dot delay={320} />
    </View>
  );
}

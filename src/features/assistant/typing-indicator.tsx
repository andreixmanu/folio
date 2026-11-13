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

import { AppText } from '@/components/ui';
import type { ChatPhase } from '@/services/chat/client';
import { easings, enterFade, exitFade, timings, useTheme } from '@/theme';

const PHASE_LABEL: Record<ChatPhase, string> = {
  thinking: 'Sto pensando…',
  searching_web: 'Sto cercando sul web…',
  searching_x: 'Sto cercando su X…',
};

function labelFor(phase: ChatPhase | null | undefined): string {
  return PHASE_LABEL[phase ?? 'thinking'];
}

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

function StatusLabel({ label }: { label: string }) {
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.set(
      withRepeat(
        withTiming(1, { duration: timings.counter.duration, easing: easings.standard }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View style={style}>
      <AppText variant="caption" color="textSecondary" accessibilityLiveRegion="polite" accessibilityLabel={label}>
        {label}
      </AppText>
    </Animated.View>
  );
}

/** Dots plus a calm status line while the assistant message is still empty. */
export function TypingIndicator({ phase }: { phase?: ChatPhase | null }) {
  const theme = useTheme();
  const label = labelFor(phase);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        minHeight: 20,
        paddingVertical: theme.spacing.xxs,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }} accessibilityElementsHidden>
        <Dot delay={0} />
        <Dot delay={160} />
        <Dot delay={320} />
      </View>
      <Animated.View key={label} entering={enterFade()} exiting={exitFade}>
        <StatusLabel label={label} />
      </Animated.View>
    </View>
  );
}

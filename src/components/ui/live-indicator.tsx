import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { easings, useTheme } from '@/theme';

export type LiveStatus = 'loading' | 'live' | 'stale' | 'error' | 'partial';

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Discreet price-status dot (~6px). The old "Live · time" pill is gone.
 * The accessibility label still carries the status and the update time.
 */
export function LiveIndicator({
  status,
  updatedAt,
  source = 'Kraken',
}: {
  status: LiveStatus;
  updatedAt?: number;
  source?: string;
}) {
  const theme = useTheme();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (status === 'live') {
      opacity.set(withRepeat(withTiming(0.35, { duration: 1400, easing: easings.standard }), -1, true));
    } else {
      cancelAnimation(opacity);
      opacity.set(1);
    }
  }, [status, opacity]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const color =
    status === 'live'
      ? theme.colors.positive
      : status === 'stale' || status === 'partial'
        ? theme.colors.warning
        : status === 'error'
          ? theme.colors.negative
          : theme.colors.textTertiary;
  const time = updatedAt ? clock(updatedAt) : '';
  const label =
    status === 'live'
      ? `Live · ${time}`
      : status === 'stale'
        ? `Offline · ${time}`
        : status === 'partial'
          ? 'Totale parziale'
          : status === 'error'
            ? 'Prezzi non disponibili'
            : 'Connessione…';

  return (
    <View
      testID="live-indicator"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}${status === 'live' ? `, prezzi ${source}` : ''}`}
      style={{ width: 6, height: 6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, dotStyle]} />
    </View>
  );
}

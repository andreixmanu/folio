import { StyleSheet, View } from 'react-native';

import { floatingFill, useTheme } from '@/theme';

/**
 * Android stand-in for the frosted chrome. No `BlurView` and no
 * `BlurTargetView`: both crash this screen tree on launch. The fill is
 * the same dense tint the bar used before expo-blur.
 */
export function FrostedFill() {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: floatingFill(theme.scheme) }]}
    />
  );
}

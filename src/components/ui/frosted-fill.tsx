import { BlurView, type BlurTint } from 'expo-blur';
import { Platform, StyleSheet } from 'react-native';

import { useTheme, type ColorSchemeName } from '@/theme';

/** Blur strength for the floating chrome, tuned per theme. */
const INTENSITY: Record<ColorSchemeName, number> = {
  dark: 50,
  light: 64,
};

const TINT: Record<ColorSchemeName, BlurTint> = {
  dark: 'dark',
  light: 'light',
};

/**
 * Semi-opaque tint under the blur. On native it stays light so the canvas
 * shows through; on web it is denser so the bar stays readable if
 * `backdrop-filter` is missing.
 */
const FALLBACK_FILL: Record<ColorSchemeName, string> = {
  dark: 'rgba(18,18,24,0.42)',
  light: 'rgba(255,255,255,0.42)',
};

const WEB_FALLBACK_FILL: Record<ColorSchemeName, string> = {
  dark: 'rgba(18,18,24,0.72)',
  light: 'rgba(255,255,255,0.72)',
};

/**
 * Frosted glass for the floating tab bar and the mode button, on iOS and web.
 * Must sit inside a parent with `overflow: 'hidden'` and a matching
 * `borderRadius`, so the blur is clipped to the pill. Keep shadow and
 * the hairline border on the outer view — `overflow: 'hidden'` would
 * clip the shadow.
 *
 * Android does not use this file. SDK 58 blur draws a `BlurTargetView`,
 * and that target must not contain the `BlurView` that points at it
 * (Dimezis BlurView 3: the target may not contain a blur view aimed at
 * the same target) and must not wrap a navigator. The chrome is inside
 * the root Stack, so a shared target around the Stack crashes on launch.
 */
export function FrostedFill() {
  const theme = useTheme();
  const scheme = theme.scheme;
  const fallback = Platform.OS === 'web' ? WEB_FALLBACK_FILL[scheme] : FALLBACK_FILL[scheme];

  return (
    <BlurView
      pointerEvents="none"
      intensity={INTENSITY[scheme]}
      tint={TINT[scheme]}
      style={[StyleSheet.absoluteFill, { backgroundColor: fallback }]}
    />
  );
}

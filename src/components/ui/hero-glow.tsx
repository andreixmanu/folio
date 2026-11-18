import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { rgbaFromHex, useTheme } from '@/theme';

const GLOW_HEIGHT = 460;

/**
 * Soft accent wash behind a wallet-home hero. A top-centre orb plus a vertical
 * fade into the canvas, tuned separately for dark and light so the glow reads
 * as atmosphere rather than a stripe.
 */
export function HeroGlow({ height = GLOW_HEIGHT }: { height?: number }) {
  const theme = useTheme();
  const accent = theme.colors.accent;
  const dark = theme.scheme === 'dark';
  const orb = rgbaFromHex(accent, dark ? 0.28 : 0.14);
  const halo = rgbaFromHex(accent, dark ? 0.22 : 0.1);
  const top = rgbaFromHex(accent, dark ? 0.26 : 0.16);
  const mid = rgbaFromHex(accent, dark ? 0.1 : 0.06);
  const fade = rgbaFromHex(accent, 0);

  return (
    <View pointerEvents="none" testID="hero-glow" style={{ height, width: '100%' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }}>
        <View
          style={{
            width: 420,
            height: 320,
            marginTop: -72,
            borderRadius: 210,
            backgroundColor: orb,
            boxShadow: `0px 16px 80px 40px ${halo}`,
          }}
        />
      </View>
      <LinearGradient
        colors={[top, mid, fade] as const}
        locations={[0, 0.38, 1] as const}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}
      />
    </View>
  );
}

import { LinearGradient } from 'expo-linear-gradient';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { rgbaFromHex, useTheme } from '@/theme';

const GLOW_HEIGHT = 460;

/**
 * Sample points for both washes. Colour is already gone at 0.92; the final
 * stop keeps the tail transparent so the container edge never clips a tint.
 */
const STOPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.78, 0.86, 0.92, 1] as const;

/** Screen fraction at which the wash is fully clear (before the glow ends). */
const FADE_END = 0.92;

/**
 * Holds the accent through the balance, then settles to 0.
 * The exponent delays the drop; smoothstep makes the slope 0 at the end,
 * so there is no rim where the colour meets the canvas.
 */
const HOLD_POWER = 1.75;

function alphaAt(position: number, peak: number): number {
  if (position >= FADE_END) return 0;
  const t = position / FADE_END;
  const u = t ** HOLD_POWER;
  const smooth = u * u * (3 - 2 * u);
  return Math.round(peak * (1 - smooth) * 1000) / 1000;
}

/**
 * Soft mode-accent atmosphere behind a wallet-home hero.
 * A full-width vertical fade plus a wide radial bloom, both transparent
 * before the bottom of the glow. No filled shape: a solid oval leaves a
 * hard rim, especially on a light canvas.
 */
export function HeroGlow({ height = GLOW_HEIGHT }: { height?: number }) {
  const theme = useTheme();
  const accent = theme.colors.accent;
  const dark = theme.scheme === 'dark';
  // Split so the centre (veil + bloom) stays close to the previous atmosphere:
  // about 0.41 on dark, 0.26 on light — a wash, not a stain.
  const verticalPeak = dark ? 0.3 : 0.18;
  const radialPeak = dark ? 0.16 : 0.1;
  const gradientId = `heroGlow${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const verticalColors = STOPS.map((location) =>
    rgbaFromHex(accent, alphaAt(location, verticalPeak)),
  ) as [string, string, ...string[]];

  return (
    <View pointerEvents="none" testID="hero-glow" style={{ height, width: '100%' }}>
      <LinearGradient
        colors={verticalColors}
        locations={STOPS}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg pointerEvents="none" width="100%" height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient
            id={gradientId}
            cx="50%"
            cy="0%"
            r="100%"
            gradientUnits="objectBoundingBox">
            {STOPS.map((offset) => (
              <Stop
                key={offset}
                offset={offset}
                stopColor={accent}
                stopOpacity={alphaAt(offset, radialPeak)}
              />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

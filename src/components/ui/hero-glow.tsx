import { LinearGradient } from 'expo-linear-gradient';
import { useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme, type AccentMode, type ColorSchemeName } from '@/theme';

type Rgb = { r: number; g: number; b: number };

type StopSpec = { offset: number; color: string; opacity: number };

type AmbientPalette = {
  heroCore: Rgb;
  heroCoreA: number;
  heroMid: Rgb;
  heroMidA: number;
  blob2: Rgb;
  blob2A: number;
  blob3: Rgb;
  blob3A: number;
  veil: readonly { color: Rgb; opacity: number; at: number }[];
};

/**
 * Tuned from the Seamless mockup (`.ambient`, `.blob-*`, `--hero-*`).
 * Budget swaps the violet wash for the teal accent. Extra stops past the
 * CSS 70% mark reach opacity 0 so the bloom has no hard oval edge.
 * No noise texture and no blur: both need assets or a native module we do not add.
 */
const PALETTES: Record<ColorSchemeName, Record<AccentMode, AmbientPalette>> = {
  dark: {
    invest: {
      heroCore: { r: 124, g: 108, b: 255 },
      heroCoreA: 0.64,
      heroMid: { r: 88, g: 70, b: 210 },
      heroMidA: 0.3,
      blob2: { r: 99, g: 80, b: 230 },
      blob2A: 0.34,
      blob3: { r: 167, g: 139, b: 250 },
      blob3A: 0.24,
      veil: [
        { color: { r: 80, g: 60, b: 200 }, opacity: 0, at: 0 },
        { color: { r: 80, g: 60, b: 200 }, opacity: 0, at: 0.28 },
        { color: { r: 80, g: 60, b: 200 }, opacity: 0.14, at: 0.52 },
        { color: { r: 70, g: 50, b: 170 }, opacity: 0.1, at: 0.72 },
        { color: { r: 70, g: 50, b: 160 }, opacity: 0.04, at: 1 },
      ],
    },
    budget: {
      heroCore: { r: 46, g: 196, b: 166 },
      heroCoreA: 0.55,
      heroMid: { r: 18, g: 150, b: 130 },
      heroMidA: 0.3,
      blob2: { r: 24, g: 160, b: 140 },
      blob2A: 0.34,
      blob3: { r: 110, g: 210, b: 190 },
      blob3A: 0.22,
      veil: [
        { color: { r: 20, g: 140, b: 120 }, opacity: 0, at: 0 },
        { color: { r: 20, g: 140, b: 120 }, opacity: 0, at: 0.28 },
        { color: { r: 20, g: 150, b: 130 }, opacity: 0.16, at: 0.52 },
        { color: { r: 16, g: 120, b: 105 }, opacity: 0.1, at: 0.72 },
        { color: { r: 16, g: 110, b: 100 }, opacity: 0.04, at: 1 },
      ],
    },
  },
  light: {
    invest: {
      heroCore: { r: 124, g: 108, b: 255 },
      heroCoreA: 0.48,
      heroMid: { r: 160, g: 148, b: 255 },
      heroMidA: 0.34,
      blob2: { r: 124, g: 108, b: 255 },
      blob2A: 0.3,
      blob3: { r: 150, g: 130, b: 255 },
      blob3A: 0.26,
      veil: [
        { color: { r: 140, g: 120, b: 255 }, opacity: 0.22, at: 0 },
        { color: { r: 140, g: 120, b: 255 }, opacity: 0.1, at: 0.38 },
        { color: { r: 150, g: 130, b: 255 }, opacity: 0.18, at: 0.58 },
        { color: { r: 140, g: 120, b: 255 }, opacity: 0.1, at: 1 },
      ],
    },
    budget: {
      heroCore: { r: 14, g: 159, b: 132 },
      heroCoreA: 0.4,
      heroMid: { r: 90, g: 200, b: 175 },
      heroMidA: 0.32,
      blob2: { r: 14, g: 159, b: 132 },
      blob2A: 0.26,
      blob3: { r: 80, g: 190, b: 170 },
      blob3A: 0.22,
      veil: [
        { color: { r: 40, g: 180, b: 155 }, opacity: 0.22, at: 0 },
        { color: { r: 40, g: 180, b: 155 }, opacity: 0.1, at: 0.38 },
        { color: { r: 50, g: 190, b: 165 }, opacity: 0.18, at: 0.58 },
        { color: { r: 40, g: 180, b: 155 }, opacity: 0.1, at: 1 },
      ],
    },
  },
};

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color.r},${color.g},${color.b},${alpha})`;
}

/**
 * Hold the core, then ease to 0 by 88% of the radius.
 * The gradient radius is half the box (`r="50%"`), so the square edge is
 * already clear and the bloom has no hard oval rim.
 */
function bloomStops(core: Rgb, coreA: number, mid: Rgb, midA: number): StopSpec[] {
  const offsets = [0, 0.22, 0.38, 0.52, 0.64, 0.76, 0.88, 1] as const;
  return offsets.map((offset) => {
    if (offset <= 0.38) {
      const t = offset / 0.38;
      return { offset, color: rgba(t < 0.55 ? core : mid, 1), opacity: coreA + (midA - coreA) * t };
    }
    const t = Math.min(1, (offset - 0.38) / 0.5);
    const smooth = t * t * (3 - 2 * t);
    return { offset, color: rgba(mid, 1), opacity: Math.round(midA * (1 - smooth) * 1000) / 1000 };
  });
}

function RadialBlob({
  id,
  size,
  top,
  left,
  cy = '50%',
  stops,
  opacity = 1,
}: {
  id: string;
  size: number;
  top: number;
  left: number;
  cy?: string;
  stops: readonly StopSpec[];
  opacity?: number;
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top, left, width: size, height: size, opacity }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy={cy} r="50%" gradientUnits="objectBoundingBox">
            {stops.map((stop) => (
              <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/**
 * Full-page Seamless wash. Fills its parent (the scroll content, or the screen).
 * Four soft blooms — hero, side, mid, low — sit on a vertical veil.
 * `testID` stays `hero-glow` so existing screen tests keep finding the atmosphere.
 */
export function AmbientBackground() {
  const theme = useTheme();
  const palette = PALETTES[theme.scheme][theme.mode];
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [width, setWidth] = useState(390);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && Math.abs(next - width) > 1) setWidth(next);
  };

  const hero = bloomStops(palette.heroCore, palette.heroCoreA, palette.heroMid, palette.heroMidA);
  const side = bloomStops(palette.blob3, palette.blob3A, palette.blob3, palette.blob3A);
  const mid = bloomStops(palette.blob2, palette.blob2A, palette.blob2, palette.blob2A);
  const low = bloomStops(palette.blob3, palette.blob3A, palette.blob3, palette.blob3A);

  const veilColors = palette.veil.map((stop) => rgba(stop.color, stop.opacity)) as [string, string, ...string[]];
  const veilLocations = palette.veil.map((stop) => stop.at) as [number, number, ...number[]];

  // A bit larger than the CSS boxes so the clear edge of r=50% still covers the mockup bloom.
  const heroSize = 680;
  const sideSize = 320;
  const midSize = 460;
  const lowSize = 500;

  return (
    <View pointerEvents="none" testID="hero-glow" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <LinearGradient
        colors={veilColors}
        locations={veilLocations}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <RadialBlob id={`hero${raw}`} size={heroSize} top={-180} left={(width - heroSize) / 2} cy="42%" stops={hero} />
      <RadialBlob id={`side${raw}`} size={sideSize} top={260} left={width - sideSize + 150} stops={side} opacity={0.7} />
      <RadialBlob id={`mid${raw}`} size={midSize} top={580} left={-190} stops={mid} />
      <RadialBlob id={`low${raw}`} size={lowSize} top={960} left={width - lowSize + 210} stops={low} />
    </View>
  );
}

/** @deprecated Use AmbientBackground. Kept so older imports still resolve. */
export const HeroGlow = AmbientBackground;

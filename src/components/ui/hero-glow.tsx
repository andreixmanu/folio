import { LinearGradient } from 'expo-linear-gradient';
import { useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { rgbaFromHex, spacing, useTheme, type AccentMode, type ColorSchemeName } from '@/theme';

type Rgb = { r: number; g: number; b: number };

type StopSpec = { offset: number; color: string; opacity: number };

type AmbientPalette = {
  heroCore: Rgb;
  heroCoreA: number;
  heroMid: Rgb;
  heroMidA: number;
  veil: readonly { color: Rgb; opacity: number; at: number }[];
};

/**
 * Which block the wash is sized to. The accent dissolves at the bottom of
 * that block; the painted box runs past it so the tail is already the plain
 * canvas and the section under the hero is not tinted.
 *
 * `title` — large title only (lists, news, settings).
 * `summary` — balance and account strip (Budget overview).
 * `chart` — balance, chart and range (portfolio home).
 */
export type HeroWash = 'title' | 'summary' | 'chart';

/**
 * Fraction of the wash box where the accent has dissolved into the canvas.
 * Veil stops below must be opacity 0 by this point.
 */
const WASH_CLEAR_AT = 0.72;

/** `largeTitle` line height. The header block adds the header's own vertical padding. */
const TITLE_LINE = 34;
const BALANCE_LINE = 52;
const CHANGE_ROW = 28;
const CHART_HEIGHT = 148;
const RANGE_HEIGHT = 34;
const ACCOUNT_STRIP = 68;
const CAPTION_LINE = 17;

function headerBlock(): number {
  return spacing.xs + TITLE_LINE + spacing.xs;
}

/**
 * Distance from below the safe-area pad to where the next section starts.
 * Kept in step with `ScreenHeader`, `PortfolioHero` and `BudgetHero`.
 */
export function heroWashSpan(kind: HeroWash): number {
  const header = headerBlock();
  const gap = spacing.xl;
  if (kind === 'chart') {
    const hero =
      spacing.xl +
      BALANCE_LINE +
      spacing.md +
      CHANGE_ROW +
      spacing.md +
      spacing.xs +
      CHART_HEIGHT +
      spacing.md +
      RANGE_HEIGHT +
      spacing.sm;
    return header + gap + hero + gap;
  }
  if (kind === 'summary') {
    const hero =
      spacing.xl +
      BALANCE_LINE +
      spacing.md +
      CAPTION_LINE +
      spacing.md +
      ACCOUNT_STRIP +
      spacing.sm;
    return header + gap + hero + gap;
  }
  // Body starts after the title and the following gap.
  return header + gap;
}

/**
 * Wash height from the top of the screen, including the safe-area pad.
 * Taller than the hero so `WASH_CLEAR_AT` lands on the next section.
 */
export function heroWashHeight(topPad: number, kind: HeroWash): number {
  return (topPad + heroWashSpan(kind)) / WASH_CLEAR_AT;
}

/**
 * Anchored wash behind a fixed large title (the assistant).
 * The accent is gone where the thread begins, so messages stay on the plain canvas.
 */
export function headerWashHeight(insetTop: number): number {
  const threadTop = insetTop + spacing.xs + headerBlock() + spacing.sm;
  return threadTop / WASH_CLEAR_AT;
}

/**
 * Tuned from the Seamless hero bloom, clipped to the hero.
 * The mid- and low-page blobs are gone. The veil reaches opacity 0
 * before the wash ends, and a canvas fade hides any remaining edge.
 * No noise texture and no blur: both need assets or a native module we do not add.
 */
const PALETTES: Record<ColorSchemeName, Record<AccentMode, AmbientPalette>> = {
  dark: {
    invest: {
      heroCore: { r: 124, g: 108, b: 255 },
      heroCoreA: 0.64,
      heroMid: { r: 88, g: 70, b: 210 },
      heroMidA: 0.3,
      veil: [
        { color: { r: 80, g: 60, b: 200 }, opacity: 0.1, at: 0 },
        { color: { r: 80, g: 60, b: 200 }, opacity: 0.14, at: 0.16 },
        { color: { r: 70, g: 50, b: 170 }, opacity: 0.05, at: 0.36 },
        { color: { r: 70, g: 50, b: 160 }, opacity: 0.012, at: 0.54 },
        { color: { r: 70, g: 50, b: 160 }, opacity: 0, at: WASH_CLEAR_AT },
        { color: { r: 70, g: 50, b: 160 }, opacity: 0, at: 1 },
      ],
    },
    budget: {
      heroCore: { r: 46, g: 196, b: 166 },
      heroCoreA: 0.55,
      heroMid: { r: 18, g: 150, b: 130 },
      heroMidA: 0.3,
      veil: [
        { color: { r: 20, g: 140, b: 120 }, opacity: 0.1, at: 0 },
        { color: { r: 20, g: 150, b: 130 }, opacity: 0.16, at: 0.16 },
        { color: { r: 16, g: 120, b: 105 }, opacity: 0.05, at: 0.36 },
        { color: { r: 16, g: 110, b: 100 }, opacity: 0.012, at: 0.54 },
        { color: { r: 16, g: 110, b: 100 }, opacity: 0, at: WASH_CLEAR_AT },
        { color: { r: 16, g: 110, b: 100 }, opacity: 0, at: 1 },
      ],
    },
  },
  light: {
    invest: {
      heroCore: { r: 124, g: 108, b: 255 },
      heroCoreA: 0.48,
      heroMid: { r: 160, g: 148, b: 255 },
      heroMidA: 0.34,
      veil: [
        { color: { r: 140, g: 120, b: 255 }, opacity: 0.18, at: 0 },
        { color: { r: 140, g: 120, b: 255 }, opacity: 0.1, at: 0.16 },
        { color: { r: 150, g: 130, b: 255 }, opacity: 0.03, at: 0.36 },
        { color: { r: 140, g: 120, b: 255 }, opacity: 0.008, at: 0.54 },
        { color: { r: 140, g: 120, b: 255 }, opacity: 0, at: WASH_CLEAR_AT },
        { color: { r: 140, g: 120, b: 255 }, opacity: 0, at: 1 },
      ],
    },
    budget: {
      heroCore: { r: 14, g: 159, b: 132 },
      heroCoreA: 0.4,
      heroMid: { r: 90, g: 200, b: 175 },
      heroMidA: 0.32,
      veil: [
        { color: { r: 40, g: 180, b: 155 }, opacity: 0.18, at: 0 },
        { color: { r: 40, g: 180, b: 155 }, opacity: 0.1, at: 0.16 },
        { color: { r: 50, g: 190, b: 165 }, opacity: 0.03, at: 0.36 },
        { color: { r: 40, g: 180, b: 155 }, opacity: 0.008, at: 0.54 },
        { color: { r: 40, g: 180, b: 155 }, opacity: 0, at: WASH_CLEAR_AT },
        { color: { r: 40, g: 180, b: 155 }, opacity: 0, at: 1 },
      ],
    },
  },
};

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color.r},${color.g},${color.b},${alpha})`;
}

/**
 * Hold the core, then ease to 0 by 88% of the radius so the bloom has no hard rim.
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

/**
 * Hero-only Seamless wash. Fills its parent.
 * A wide ellipse (rim off the sides) dies on the vertical axis at `WASH_CLEAR_AT`,
 * the veil is already clear there, and a canvas ramp finishes on
 * `theme.colors.background` so the clip has no oval and no hard edge.
 * Everything below that line is the plain canvas. `testID` stays `hero-glow`.
 */
export function AmbientBackground() {
  const theme = useTheme();
  const palette = PALETTES[theme.scheme][theme.mode];
  const raw = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [box, setBox] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setBox((prev) =>
      Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height },
    );
  };

  const hero = bloomStops(palette.heroCore, palette.heroCoreA, palette.heroMid, palette.heroMidA);
  const veilColors = palette.veil.map((stop) => rgba(stop.color, stop.opacity)) as [string, string, ...string[]];
  const veilLocations = palette.veil.map((stop) => stop.at) as [number, number, ...number[]];

  const { width, height } = box;
  // Brightest behind the balance / title. Horizontal radius stays off-screen
  // so overflow never cuts a bright rim. Vertical radius hits opacity 0
  // (bloom offset 0.88) exactly on the clear line.
  const cx = width / 2;
  const cy = height * 0.26;
  const clearY = height * WASH_CLEAR_AT;
  const rx = Math.max(width * 1.5, 1);
  const ry = Math.max((clearY - cy) / 0.88, 1);
  const fy = height * 0.18;

  // Ease into the canvas and arrive solid on the clear line. Same RGB as the
  // background: `transparent` is rgba(0,0,0,0) and fades through black.
  const fadeTop = height * 0.46;
  const fadeHeight = Math.max(clearY - fadeTop, 0);
  const bg = theme.colors.background;
  const fadeColors = [
    rgbaFromHex(bg, 0),
    rgbaFromHex(bg, 0.015),
    rgbaFromHex(bg, 0.06),
    rgbaFromHex(bg, 0.16),
    rgbaFromHex(bg, 0.38),
    rgbaFromHex(bg, 0.7),
    rgbaFromHex(bg, 0.92),
    bg,
  ] as [string, string, ...string[]];
  const fadeLocations = [0, 0.14, 0.28, 0.44, 0.6, 0.76, 0.9, 1] as [number, number, ...number[]];

  return (
    <View pointerEvents="none" testID="hero-glow" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <LinearGradient
        colors={veilColors}
        locations={veilLocations}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {width > 0 && height > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient
              id={`hero${raw}`}
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fx={cx}
              fy={fy}
              gradientUnits="userSpaceOnUse">
              {hero.map((stop) => (
                <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />
              ))}
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill={`url(#hero${raw})`} />
        </Svg>
      ) : null}
      {height > 0 && fadeHeight > 0 ? (
        <LinearGradient
          colors={fadeColors}
          locations={fadeLocations}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: fadeTop, height: fadeHeight }}
        />
      ) : null}
      {/* Tail is the plain canvas, covering any residual past the clear line. */}
      {height > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: Math.max(clearY - 1, 0),
            bottom: 0,
            backgroundColor: bg,
          }}
        />
      ) : null}
    </View>
  );
}

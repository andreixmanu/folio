/**
 * Color tokens. Dark is the primary theme; light is provided as an optional variant.
 * Inspired by Revolut: deep neutral background, layered "island" surfaces,
 * a vivid accent and clear positive/negative semantics.
 */
export type ColorTokens = {
  /** App canvas behind every island. */
  background: string;
  /** Default island surface. */
  surface: string;
  /** Raised surface: tab bar, pressed states, nested islands. */
  surfaceElevated: string;
  /** Subtle fill for chips, avatars, inputs. */
  surfaceMuted: string;
  /** Hairline border used to separate an island from the canvas. */
  border: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentMuted: string;
  onAccent: string;
  positive: string;
  positiveMuted: string;
  negative: string;
  negativeMuted: string;
  warning: string;
  /** Shadow color for elevated islands. */
  shadow: string;
  /** Ordered palette for charts and allocations. */
  chart: readonly string[];
  /** Asset class colors (used consistently across charts and lists). */
  assetClass: {
    stocks: string;
    crypto: string;
  };
};

const chart = [
  '#7C6CFF',
  '#35C2FF',
  '#2FD08A',
  '#FFB547',
  '#FF6B8B',
  '#B98CFF',
  '#4DE1C1',
  '#F7D154',
  '#FF8A4C',
  '#8CA3FF',
] as const;

export const darkColors: ColorTokens = {
  background: '#08080B',
  surface: '#141419',
  surfaceElevated: '#1D1D24',
  surfaceMuted: '#24242D',
  border: 'rgba(255,255,255,0.06)',
  text: '#FFFFFF',
  textSecondary: '#9A9AA8',
  textTertiary: '#5E5E6B',
  accent: '#7C6CFF',
  accentMuted: 'rgba(124,108,255,0.18)',
  onAccent: '#FFFFFF',
  positive: '#2FD08A',
  positiveMuted: 'rgba(47,208,138,0.14)',
  negative: '#FF5C6C',
  negativeMuted: 'rgba(255,92,108,0.14)',
  warning: '#FFB547',
  shadow: 'rgba(0,0,0,0.55)',
  chart,
  assetClass: {
    stocks: '#7C6CFF',
    crypto: '#FFB547',
  },
};

export const lightColors: ColorTokens = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#EDEDF2',
  border: 'rgba(0,0,0,0.05)',
  text: '#0B0B10',
  textSecondary: '#6B6B78',
  textTertiary: '#A3A3AE',
  accent: '#5B4BFF',
  accentMuted: 'rgba(91,75,255,0.12)',
  onAccent: '#FFFFFF',
  positive: '#12A86B',
  positiveMuted: 'rgba(18,168,107,0.12)',
  negative: '#E5384A',
  negativeMuted: 'rgba(229,56,74,0.10)',
  warning: '#E59A1F',
  shadow: 'rgba(20,20,40,0.12)',
  chart,
  assetClass: {
    stocks: '#5B4BFF',
    crypto: '#E59A1F',
  },
};

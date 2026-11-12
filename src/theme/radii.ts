export const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  /** Default island corner radius. */
  xl: 24,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radii;

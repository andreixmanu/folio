/** 4pt spacing scale. Islands use generous spacing: `lg` inside, `xl` around. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Layout constants shared by screens and the floating tab bar. */
export const layout = {
  screenPadding: spacing.lg,
  /** Max content width on web / tablets so islands do not stretch edge to edge. */
  maxContentWidth: 560,
  tabBarHeight: 68,
  tabBarSideInset: spacing.xxl,
  tabBarBottomGap: spacing.md,
} as const;

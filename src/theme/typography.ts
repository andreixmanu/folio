import type { TextStyle } from 'react-native';

/** Inter font family names, as registered by `@expo-google-fonts/inter`. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

type Variant = Pick<TextStyle, 'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing'>;

export const typography = {
  /** Hero numbers such as the portfolio total. */
  display: { fontFamily: fonts.bold, fontSize: 36, lineHeight: 42, letterSpacing: -1 },
  /** Large screen titles. */
  largeTitle: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  callout: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 17, letterSpacing: 0 },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.2 },
  micro: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.4 },
} as const satisfies Record<string, Variant>;

export type TypographyVariant = keyof typeof typography;

import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

type TextColor = keyof Pick<
  ColorTokens,
  'text' | 'textSecondary' | 'textTertiary' | 'accent' | 'positive' | 'negative' | 'onAccent' | 'warning'
>;

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: TextColor;
  /** Use tabular figures so changing numbers do not jitter. */
  tabular?: boolean;
  align?: TextStyle['textAlign'];
};

export function AppText({
  variant = 'body',
  color = 'text',
  tabular = false,
  align,
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  return (
    <Text
      {...rest}
      style={[
        theme.typography[variant],
        { color: theme.colors[color] },
        tabular && { fontVariant: ['tabular-nums'] },
        align !== undefined && { textAlign: align },
        style,
      ]}
    />
  );
}

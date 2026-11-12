import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { enterUp, useTheme, type SpacingToken } from '@/theme';

import { PressableScale } from './pressable-scale';

export type IslandCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Inner padding token. Defaults to `lg`. */
  padding?: SpacingToken;
  /** Elevation level of the floating surface. */
  elevated?: 0 | 1 | 2 | 3;
  /** Surface tone. `elevated` is one step lighter than the default. */
  tone?: 'default' | 'elevated' | 'accent';
  /** Position in a list, used to stagger the entering animation. Omit to disable. */
  index?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * The core "floating island": a rounded, softly elevated surface detached from
 * the canvas by spacing, a hairline border and a shadow.
 */
export function IslandCard({
  children,
  style,
  padding = 'lg',
  elevated = 1,
  tone = 'default',
  index,
  onPress,
  accessibilityLabel,
  testID,
}: IslandCardProps) {
  const theme = useTheme();
  const backgroundColor =
    tone === 'accent'
      ? theme.colors.accent
      : tone === 'elevated'
        ? theme.colors.surfaceElevated
        : theme.colors.surface;

  const surfaceStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor,
      borderRadius: theme.radii.xl,
      padding: theme.spacing[padding],
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderCurve: 'continuous',
    },
    theme.elevation(elevated),
    style,
  ];

  const entering = index === undefined ? undefined : enterUp(index);

  return (
    <Animated.View entering={entering}>
      {onPress ? (
        <PressableScale
          onPress={onPress}
          style={surfaceStyle}
          accessibilityLabel={accessibilityLabel}
          testID={testID}>
          {children}
        </PressableScale>
      ) : (
        <View style={surfaceStyle} accessibilityLabel={accessibilityLabel} testID={testID}>
          {children}
        </View>
      )}
    </Animated.View>
  );
}

import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { enterUp, useTheme, type SpacingToken } from '@/theme';

import { PressableScale } from './pressable-scale';

export type IslandCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Inner padding token. Defaults to none so sections sit on the canvas. */
  padding?: SpacingToken;
  /** Kept for call-site compatibility. Seamless sections are not elevated. */
  elevated?: 0 | 1 | 2 | 3;
  /** Kept for call-site compatibility. Seamless sections have no surface fill. */
  tone?: 'default' | 'elevated' | 'accent';
  /** Position in a list, used to stagger the entering animation. Omit to disable. */
  index?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Seamless section. The name remains so existing testIDs and call sites stay
 * put; the floating surface (fill, radius, shadow, hairline card) is gone.
 * Content sits directly on the ambient canvas.
 */
export function IslandCard({
  children,
  style,
  padding = 'none',
  index,
  onPress,
  accessibilityLabel,
  testID,
}: IslandCardProps) {
  const theme = useTheme();
  const surfaceStyle: StyleProp<ViewStyle> = [
    {
      backgroundColor: 'transparent',
      padding: theme.spacing[padding],
    },
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

import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { enterFade, useTheme } from '@/theme';

import { PressableScale } from './pressable-scale';
import { AppText } from './text';

export type ScreenHeaderProps = {
  title: string;
  /** Small line above the title (greeting, date…). */
  eyebrow?: string;
  right?: ReactNode;
};

/** Large-title header in the Revolut style. */
export function ScreenHeader({ title, eyebrow, right }: ScreenHeaderProps) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={enterFade()}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingTop: theme.spacing.xs,
        paddingBottom: theme.spacing.xs,
      }}>
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? (
          <AppText variant="caption" color="textSecondary">
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant="largeTitle" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {right ? <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>{right}</View> : null}
    </Animated.View>
  );
}

/** Round icon button for header actions. */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
}: {
  name: ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      scaleTo={0.94}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
      ]}>
      <Ionicons name={name} size={18} color={theme.colors.text} />
    </PressableScale>
  );
}

/** Initials avatar used in headers. */
export function ProfileAvatar({ initials }: { initials: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.accentMuted,
      }}>
      <AppText variant="label" color="accent">
        {initials}
      </AppText>
    </View>
  );
}

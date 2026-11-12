import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';

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
      entering={FadeIn.duration(300)}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.lg,
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
      scaleTo={0.9}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
      ]}>
      <Ionicons name={name} size={19} color={theme.colors.text} />
    </PressableScale>
  );
}

/** Initials avatar used in headers. */
export function ProfileAvatar({ initials }: { initials: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
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

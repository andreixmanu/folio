import type { LucideIcon } from './icons';
import type { ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { enterFade, useTheme } from '@/theme';

import { Icon } from './icon';
import { PressableScale } from './pressable-scale';
import { AppText } from './text';

export type ScreenHeaderProps = {
  title: string;
  right?: ReactNode;
};

/** Large-title header in the Revolut style. Mode lives on the floating tab bar. */
export function ScreenHeader({ title, right }: ScreenHeaderProps) {
  const theme = useTheme();
  const headerStyle: ViewStyle = {
    // Stay in normal flow. An entering animation must not leave this row absolute.
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  };
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <AppText variant="largeTitle" accessibilityRole="header">
          {title}
        </AppText>
      </View>
      {right ? (
        <View
          style={{
            // The 36px action is a flex sibling of the title, never taken out of flow.
            position: 'relative',
            flexDirection: 'row',
            flexShrink: 0,
            gap: theme.spacing.sm,
          }}>
          {right}
        </View>
      ) : null}
    </>
  );

  // On Android, Reanimated `entering` (FadeIn / Keyframe) can leave the animated
  // node — and an animated descendant such as IconButton's Pressable — at
  // `position: 'absolute'` with the default origin. That paints the 36px surface
  // circle over the title. News and settings use this same header with no right
  // slot; skipping the entrance on Android keeps every tab's title in flow.
  if (Platform.OS === 'android') {
    return <View style={headerStyle}>{body}</View>;
  }

  return (
    <Animated.View entering={enterFade()} style={headerStyle}>
      {body}
    </Animated.View>
  );
}

/** Round icon button for header actions. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled = false,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      haptic="selection"
      scaleTo={0.94}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={{
        position: 'relative',
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        opacity: disabled ? 0.4 : 1,
      }}>
      <Icon icon={icon} size={18} color={theme.colors.text} />
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

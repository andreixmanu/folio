import type { ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
};

/**
 * Scrollable screen container for edge-to-edge layouts:
 * - content scrolls under the transparent status bar;
 * - a scrim fades in behind the status bar once you scroll;
 * - bottom padding clears the floating tab bar and the gesture/navigation bar.
 */
export function Screen({ children, refreshing = false, onRefresh, testID }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, 24], [0, 1], 'clamp'),
  }));

  const bottomPadding =
    theme.layout.tabBarHeight + theme.layout.tabBarBottomGap + insets.bottom + theme.spacing.lg;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID={testID}>
      <Animated.ScrollView
        testID="screen-scroll"
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.xs,
          paddingBottom: bottomPadding,
          paddingHorizontal: theme.layout.screenPadding,
          width: '100%',
          maxWidth: theme.layout.maxContentWidth,
          alignSelf: 'center',
          gap: theme.spacing.md,
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.textSecondary}
              colors={[theme.colors.accent]}
              progressBackgroundColor={theme.colors.surfaceElevated}
              progressViewOffset={insets.top}
            />
          ) : undefined
        }>
        {children}
      </Animated.ScrollView>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top,
            backgroundColor: theme.colors.background,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.border,
          },
          scrimStyle,
        ]}
      />
    </View>
  );
}

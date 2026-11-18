import type { ReactNode } from 'react';
import { RefreshControl, View, useWindowDimensions } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { AmbientBackground } from './hero-glow';

export type ScreenProps = {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
};

/**
 * Scrollable screen on the Seamless canvas.
 * The ambient wash is inside the scroll content, so the blooms travel with the
 * page the way they do in the full-height mockup. A scrim fades in behind the
 * status bar once the title scrolls under it.
 */
export function Screen({ children, refreshing = false, onRefresh, testID }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [0, 24], [0, 1], 'clamp'),
  }));

  const topPad = insets.top + theme.spacing.xs;
  const bottomPad =
    theme.layout.tabBarHeight + theme.layout.tabBarBottomGap + insets.bottom + theme.spacing.lg;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }} testID={testID}>
      <Animated.ScrollView
        testID="screen-scroll"
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          minHeight: windowHeight,
          paddingTop: topPad,
          paddingBottom: bottomPad,
          paddingHorizontal: theme.layout.screenPadding,
          width: '100%',
          maxWidth: theme.layout.maxContentWidth,
          alignSelf: 'center',
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
        {/* Bleed through the scroll padding so the wash reaches the screen edges. */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -topPad,
            left: -theme.layout.screenPadding,
            right: -theme.layout.screenPadding,
            bottom: -bottomPad,
            overflow: 'hidden',
          }}>
          <AmbientBackground />
        </View>
        <View style={{ gap: theme.spacing.xl }}>{children}</View>
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

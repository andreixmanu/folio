import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Platform, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useKeyboardVisible } from '@/lib/use-keyboard-visible';
import { timings, useTheme } from '@/theme';

const INNER_PAD = 6;

function TabItem({
  label,
  focused,
  icon,
  onPress,
  onLongPress,
  testID,
}: {
  label: string;
  focused: boolean;
  icon: React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
  testID?: string;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => scale.set(withTiming(0.96, timings.pressIn))}
      onPressOut={() => scale.set(withTiming(1, timings.pressOut))}
      style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ alignItems: 'center', gap: 2, width: '100%' }, style]}>
        {icon}
        <AppText
          variant="micro"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          color={focused ? 'text' : 'textSecondary'}
          style={{ width: '100%', textAlign: 'center', letterSpacing: 0 }}>
          {label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Pill-shaped floating tab bar, detached from screen edges, with an eased
 * selection indicator and haptic ticks. Sits above the Android gesture/navigation bar.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();
  const keyboardVisible = useKeyboardVisible();
  // Edge-to-edge Android does not resize the window for the keyboard, so this
  // absolute bar would sit under it. Fade it out (no spring) until the keyboard closes.
  const hideForKeyboard = Platform.OS === 'android' && keyboardVisible;
  const [barWidth, setBarWidth] = useState(0);
  const count = state.routes.length;
  const itemWidth = barWidth > 0 ? (barWidth - INNER_PAD * 2) / count : 0;
  const indicatorX = useSharedValue(0);
  const barOpacity = useSharedValue(1);

  useEffect(() => {
    if (itemWidth > 0) indicatorX.set(withTiming(state.index * itemWidth, timings.indicator));
  }, [state.index, itemWidth, indicatorX]);

  useEffect(() => {
    barOpacity.set(withTiming(hideForKeyboard ? 0 : 1, timings.fade));
  }, [hideForKeyboard, barOpacity]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.get() }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    opacity: barOpacity.get(),
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setBarWidth(w);
    indicatorX.set((state.index * (w - INNER_PAD * 2)) / count);
  };

  return (
    // The fade animates opacity only. `position` / `bottom` stay on a plain View
    // so a Reanimated style update cannot drop them and pin the bar at the top.
    <View
      pointerEvents={hideForKeyboard ? 'none' : 'box-none'}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + theme.layout.tabBarBottomGap,
        alignItems: 'center',
        paddingHorizontal: theme.layout.tabBarSideInset,
      }}>
      <Animated.View style={[{ alignSelf: 'stretch', alignItems: 'center' }, barStyle]}>
        <View
          accessibilityRole="tablist"
          onLayout={onLayout}
          style={[
            {
              width: '100%',
              maxWidth: 420,
              height: theme.layout.tabBarHeight,
              flexDirection: 'row',
              padding: INNER_PAD,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.surfaceElevated,
              borderWidth: 1,
              borderColor: theme.colors.border,
            },
            theme.elevation(3),
          ]}>
          {itemWidth > 0 ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: INNER_PAD,
                bottom: INNER_PAD,
                left: INNER_PAD,
                width: itemWidth,
              }}>
              <Animated.View
                style={[
                  {
                    flex: 1,
                    borderRadius: theme.radii.pill,
                    backgroundColor: theme.colors.surfaceMuted,
                  },
                  indicatorStyle,
                ]}
              />
            </View>
          ) : null}
          {state.routes.map((route, index) => {
            const descriptor = descriptors[route.key];
            if (!descriptor) return null;
            const { options } = descriptor;
            const focused = index === state.index;
            const label = options.title ?? route.name;
            const color = focused ? theme.colors.text : theme.colors.textSecondary;

            return (
              <TabItem
                key={route.key}
                label={label}
                focused={focused}
                testID={options.tabBarButtonTestID}
                icon={options.tabBarIcon?.({ focused, color, size: 22 })}
                onPress={() => {
                  const event = emitter.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    haptics.selection();
                    navigateToTab(route.key);
                  }
                }}
                onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
              />
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

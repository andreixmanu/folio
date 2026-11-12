import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { springs, useTheme } from '@/theme';

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
  const lift = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    lift.set(withSpring(focused ? 1 : 0, springs.indicator));
  }, [focused, lift]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() * (1 + lift.get() * 0.04) }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => scale.set(withSpring(0.9, springs.press))}
      onPressOut={() => scale.set(withSpring(1, springs.press))}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ alignItems: 'center', gap: 2 }, style]}>
        {icon}
        <AppText variant="micro" color={focused ? 'text' : 'textSecondary'}>
          {label}
        </AppText>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Pill-shaped floating tab bar, detached from screen edges, with a spring-animated
 * selection indicator and haptic ticks. Sits above the Android gesture/navigation bar.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();
  const [barWidth, setBarWidth] = useState(0);
  const count = state.routes.length;
  const itemWidth = barWidth > 0 ? (barWidth - INNER_PAD * 2) / count : 0;
  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (itemWidth > 0) indicatorX.set(withSpring(state.index * itemWidth, springs.indicator));
  }, [state.index, itemWidth, indicatorX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.get() }],
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setBarWidth(w);
    indicatorX.set((state.index * (w - INNER_PAD * 2)) / count);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + theme.layout.tabBarBottomGap,
        alignItems: 'center',
        paddingHorizontal: theme.layout.tabBarSideInset,
      }}>
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
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: INNER_PAD,
                bottom: INNER_PAD,
                left: INNER_PAD,
                width: itemWidth,
                borderRadius: theme.radii.pill,
                backgroundColor: theme.colors.surfaceMuted,
              },
              indicatorStyle,
            ]}
          />
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
    </View>
  );
}

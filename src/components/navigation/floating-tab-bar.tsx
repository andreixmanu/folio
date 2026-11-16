import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, useWindowDimensions, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ModeCircleButton, requestModeSwitch } from '@/components/navigation/mode-circle-button';
import { MODE_TABS, otherMode } from '@/components/navigation/mode-tabs';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useKeyboardVisible } from '@/lib/use-keyboard-visible';
import { useModeStore, type AppMode } from '@/store/mode-store';
import { modeAccents, timings, useTheme } from '@/theme';

const INNER_PAD = 6;

type HostMeasure = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

const SWITCH_LABEL: Record<AppMode, string> = {
  budget: 'Passa a Budget',
  invest: 'Passa a Investimenti',
};

function TabItem({
  label,
  accessibilityLabel,
  focused,
  icon,
  onPress,
  onLongPress,
  testID,
}: {
  label: string;
  accessibilityLabel: string;
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
      accessibilityLabel={accessibilityLabel}
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

function GhostFace({ mode }: { mode: AppMode }) {
  const theme = useTheme();
  return (
    <View pointerEvents="none" style={{ flex: 1, flexDirection: 'row', padding: INNER_PAD }}>
      {MODE_TABS[mode].map((tab) => (
        <View key={tab.name} style={{ flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Icon icon={tab.icon} size={22} color={theme.colors.textSecondary} />
          <AppText
            variant="micro"
            numberOfLines={1}
            color="textSecondary"
            style={{ width: '100%', textAlign: 'center' }}>
            {tab.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/**
 * Pill-shaped floating tab bar, detached from screen edges, with an eased
 * selection indicator and haptic ticks. Sits above the Android gesture/navigation bar.
 * A horizontal drag or long-press previews and commits a switch to the other mode.
 */
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const theme = useTheme();
  const mode = useModeStore((s) => s.mode);
  const setLastRoute = useModeStore((s) => s.setLastRoute);
  const other = otherMode(mode);
  const keyboardVisible = useKeyboardVisible();
  // Edge-to-edge Android does not resize the window for the keyboard, so this
  // absolute bar would sit under it. Fade it out (no spring) until the keyboard closes.
  const hideForKeyboard = Platform.OS === 'android' && keyboardVisible;
  const [barWidth, setBarWidth] = useState(0);
  const count = state.routes.length;
  const itemWidth = barWidth > 0 ? (barWidth - INNER_PAD * 2) / count : 0;
  const indicatorX = useSharedValue(0);
  const barOpacity = useSharedValue(1);
  const progress = useSharedValue(0);
  const barWidthSV = useSharedValue(0);
  const barRef = useRef<HostMeasure | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const centreX = useSharedValue(windowWidth);
  const centreY = useSharedValue(windowHeight);
  const accent = modeAccents[theme.scheme][mode].accent;
  const otherAccent = modeAccents[theme.scheme][other].accent;

  useEffect(() => {
    const route = state.routes[state.index];
    if (!route) return;
    setLastRoute(mode, `/${route.name}`);
  }, [mode, setLastRoute, state.index, state.routes]);

  useEffect(() => {
    if (itemWidth > 0) indicatorX.set(withTiming(state.index * itemWidth, timings.indicator));
  }, [state.index, itemWidth, indicatorX]);

  useEffect(() => {
    barOpacity.set(withTiming(hideForKeyboard ? 0 : 1, timings.fade));
  }, [hideForKeyboard, barOpacity]);

  const updateCentre = () => {
    const node = barRef.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) {
        centreX.set(x + w / 2);
        centreY.set(y + h / 2);
      }
    });
  };

  const commitSwitch = useCallback(() => {
    const next = otherMode(useModeStore.getState().mode);
    requestModeSwitch(next, { x: centreX.get(), y: centreY.get() });
  }, [centreX, centreY]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-10, 10])
        .onUpdate((event) => {
          const width = barWidthSV.get();
          if (width <= 0) return;
          const next = Math.min(1, Math.max(-1, event.translationX / width));
          progress.set(next);
        })
        .onEnd((event) => {
          const amount = Math.abs(progress.get());
          const commit = amount > 0.35 || Math.abs(event.velocityX) > 800;
          if (commit) {
            scheduleOnRN(commitSwitch);
            progress.set(withTiming(0, { duration: 180 }));
            return;
          }
          progress.set(withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) }));
        }),
    [barWidthSV, commitSwitch, progress],
  );

  const longPress = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(450)
        .onStart(() => {
          scheduleOnRN(commitSwitch);
        }),
    [commitSwitch],
  );

  const gesture = useMemo(() => Gesture.Exclusive(pan, longPress), [longPress, pan]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.get() }],
  }));

  const indicatorColorStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.abs(progress.get()), [0, 1], [accent, otherAccent]),
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(Math.abs(progress.get()), [0, 1], [accent, otherAccent]),
  }));

  const keyboardStyle = useAnimatedStyle(() => ({
    opacity: barOpacity.get(),
  }));

  const frontStyle = useAnimatedStyle(() => {
    const drag = progress.get();
    const width = barWidthSV.get();
    return {
      opacity: 1 - Math.abs(drag) * 0.6,
      transform: [
        { perspective: 800 },
        { rotateY: `${drag * 25}deg` },
        { translateX: drag * width * 0.35 },
      ],
    };
  });

  const ghostStyle = useAnimatedStyle(() => {
    const drag = progress.get();
    const sign = drag < 0 ? -1 : 1;
    return {
      opacity: Math.abs(drag),
      transform: [{ perspective: 800 }, { rotateY: `${(drag - sign) * 25}deg` }],
    };
  });

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setBarWidth(width);
    barWidthSV.set(width);
    indicatorX.set((state.index * (width - INNER_PAD * 2)) / count);
    updateCentre();
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'switchMode') commitSwitch();
  };

  return (
    // The fade animates opacity only. `position` / `bottom` stay on a plain View
    // so a Reanimated style update cannot drop them and pin the bar at the top.
    <GestureHandlerRootView
      pointerEvents={hideForKeyboard ? 'none' : 'box-none'}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + theme.layout.tabBarBottomGap,
        alignItems: 'center',
        paddingHorizontal: theme.layout.tabBarSideInset,
      }}>
      <Animated.View style={[{ alignSelf: 'stretch', alignItems: 'center' }, keyboardStyle]}>
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}>
          <View style={{ flex: 1, height: theme.layout.tabBarHeight }}>
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  borderRadius: theme.radii.pill,
                  backgroundColor: theme.colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  overflow: 'hidden',
                },
                ghostStyle,
              ]}>
              <GhostFace mode={other} />
            </Animated.View>
            <GestureDetector gesture={gesture}>
              <Animated.View
                ref={barRef as never}
                accessibilityRole="tablist"
                testID="mode-tab-bar"
                accessibilityActions={[{ name: 'switchMode', label: SWITCH_LABEL[other] }]}
                onAccessibilityAction={onAccessibilityAction}
                onLayout={onLayout}
                style={[
                  {
                    height: '100%',
                    flexDirection: 'row',
                    padding: INNER_PAD,
                    borderRadius: theme.radii.pill,
                    backgroundColor: theme.colors.surfaceElevated,
                    borderWidth: 1,
                  },
                  theme.elevation(3),
                  borderStyle,
                  frontStyle,
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
                        },
                        indicatorColorStyle,
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
                  const title = options.title ?? route.name;
                  const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : title;
                  const accessibilityLabel = options.tabBarAccessibilityLabel ?? title;
                  const color = focused ? theme.colors.text : theme.colors.textSecondary;

                  return (
                    <TabItem
                      key={route.key}
                      label={label}
                      accessibilityLabel={accessibilityLabel}
                      focused={focused}
                      testID={options.tabBarButtonTestID}
                      icon={options.tabBarIcon?.({ focused, color, size: 22 })}
                      onPress={() => {
                        const pressEvent = emitter.emit({
                          type: 'tabPress',
                          target: route.key,
                          canPreventDefault: true,
                        });
                        if (!focused && !pressEvent.defaultPrevented) {
                          haptics.selection();
                          navigateToTab(route.key);
                        }
                      }}
                      onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
                    />
                  );
                })}
              </Animated.View>
            </GestureDetector>
          </View>
          <ModeCircleButton />
        </View>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

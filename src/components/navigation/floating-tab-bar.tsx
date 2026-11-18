import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ModeCircleButton, requestModeSwitch } from '@/components/navigation/mode-circle-button';
import { FrostedFill } from '@/components/ui/frosted-fill';
import { MODE_TABS, otherMode } from '@/components/navigation/mode-tabs';
import { Icon } from '@/components/ui/icon';
import { AppText } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { useKeyboardVisible } from '@/lib/use-keyboard-visible';
import { useModeStore, type AppMode } from '@/store/mode-store';
import { floatingSurface, modeAccents, timings, useTheme } from '@/theme';

const INNER_PAD = 6;

type HostMeasure = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

const SWITCH_LABEL: Record<AppMode, string> = {
  budget: 'Passa a Budget',
  invest: 'Passa a Investimenti',
};

/** Flex of the active tab. Inactive tabs are 1, so the pill takes about 3/7 of the bar. */
const ACTIVE_FLEX = 3;

function TabItem({
  label,
  accessibilityLabel,
  focused,
  icon,
  pillColor,
  onPress,
  onLongPress,
  testID,
}: {
  label: string;
  accessibilityLabel: string;
  focused: boolean;
  icon: React.ReactNode;
  /** Low-opacity accent tint behind the active tab. */
  pillColor: string;
  onPress: () => void;
  onLongPress: () => void;
  testID?: string;
}) {
  const scale = useSharedValue(1);
  const active = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    active.set(withTiming(focused ? 1 : 0, timings.indicator));
  }, [active, focused]);

  const itemStyle = useAnimatedStyle(() => ({
    flex: 1 + (ACTIVE_FLEX - 1) * active.get(),
    backgroundColor: interpolateColor(active.get(), [0, 1], ['rgba(0,0,0,0)', pillColor]),
  }));
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: active.get() }));

  return (
    <Animated.View style={[{ minWidth: 0, borderRadius: 999 }, itemStyle]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => scale.set(withTiming(0.96, timings.pressIn))}
        onPressOut={() => scale.set(withTiming(1, timings.pressOut))}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={[
            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
            contentStyle,
          ]}>
          {icon}
          {/* Revolut-style: only the active tab spells its name; every tab keeps its a11y label. */}
          {focused ? (
            <Animated.View style={[{ flexShrink: 1 }, labelStyle]}>
              <AppText variant="label" numberOfLines={1} color="accent" style={{ letterSpacing: 0 }}>
                {label}
              </AppText>
            </Animated.View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function GhostFace({ mode }: { mode: AppMode }) {
  const theme = useTheme();
  return (
    <View pointerEvents="none" style={{ flex: 1, flexDirection: 'row', padding: INNER_PAD }}>
      {MODE_TABS[mode].map((tab, index) => (
        <View
          key={tab.name}
          style={{ flex: index === 0 ? ACTIVE_FLEX : 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Icon icon={tab.icon} size={22} color={theme.colors.textSecondary} />
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
  const barOpacity = useSharedValue(1);
  const progress = useSharedValue(0);
  const barWidthSV = useSharedValue(0);
  const barRef = useRef<HostMeasure | null>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const centreX = useSharedValue(windowWidth);
  const centreY = useSharedValue(windowHeight);
  const accentMuted = modeAccents[theme.scheme][mode].accentMuted;
  const otherAccentMuted = modeAccents[theme.scheme][other].accentMuted;

  useEffect(() => {
    const route = state.routes[state.index];
    if (!route) return;
    setLastRoute(mode, `/${route.name}`);
  }, [mode, setLastRoute, state.index, state.routes]);

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


  const keyboardStyle = useAnimatedStyle(() => ({
    opacity: barOpacity.get(),
  }));

  // Cylinder faces: the outgoing set is gone by half way, the incoming one appears after it.
  // Both sit in a clipped container, so the two sets never overlap on screen.
  const frontStyle = useAnimatedStyle(() => {
    const drag = progress.get();
    const width = barWidthSV.get();
    return {
      opacity: interpolate(Math.abs(drag), [0, 0.5], [1, 0], Extrapolation.CLAMP),
      transform: [
        { perspective: 800 },
        { translateX: drag * width * 0.35 },
        { rotateY: `${drag * 25}deg` },
      ],
    };
  });

  const ghostStyle = useAnimatedStyle(() => {
    const drag = progress.get();
    const width = barWidthSV.get();
    const sign = drag < 0 ? -1 : 1;
    return {
      opacity: interpolate(Math.abs(drag), [0.5, 0.85], [0, 1], Extrapolation.CLAMP),
      transform: [
        { perspective: 800 },
        { translateX: (drag - sign) * width * 0.35 },
        { rotateY: `${(drag - sign) * 25}deg` },
      ],
    };
  });

  // The accent shifts toward the other mode while dragging (pill tint only, border stays neutral).
  const tintStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.abs(progress.get()), [0, 1], ['rgba(0,0,0,0)', otherAccentMuted]),
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    barWidthSV.set(width);
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
          {/* Outer: shadow and hairline. Inner: clips the frost and both faces (shadows do not survive overflow hidden). */}
          <View
            style={[
              {
                flex: 1,
                height: theme.layout.tabBarHeight,
                borderRadius: theme.radii.pill,
              },
              floatingSurface(theme.scheme),
            ]}>
            <GestureDetector gesture={gesture}>
              <Animated.View
                ref={barRef as never}
                accessibilityRole="tablist"
                testID="mode-tab-bar"
                accessibilityActions={[{ name: 'switchMode', label: SWITCH_LABEL[other] }]}
                onAccessibilityAction={onAccessibilityAction}
                onLayout={onLayout}
                style={{ flex: 1, borderRadius: theme.radii.pill, overflow: 'hidden' }}>
                <FrostedFill />
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tintStyle]} />
                <Animated.View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, ghostStyle]}>
                  <GhostFace mode={other} />
                </Animated.View>
                <Animated.View style={[{ flex: 1, flexDirection: 'row', padding: INNER_PAD }, frontStyle]}>
                  {state.routes.map((route, index) => {
                    const descriptor = descriptors[route.key];
                    if (!descriptor) return null;
                    const { options } = descriptor;
                    const focused = index === state.index;
                    const title = options.title ?? route.name;
                    const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : title;
                    const accessibilityLabel = options.tabBarAccessibilityLabel ?? title;
                    const color = focused ? theme.colors.accent : theme.colors.textSecondary;

                    return (
                      <TabItem
                        key={route.key}
                        label={label}
                        accessibilityLabel={accessibilityLabel}
                        focused={focused}
                        pillColor={accentMuted}
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
              </Animated.View>
            </GestureDetector>
          </View>
          <ModeCircleButton />
        </View>
      </Animated.View>
    </GestureHandlerRootView>
  );
}

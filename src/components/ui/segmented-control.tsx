import { useEffect, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { timings, useTheme } from '@/theme';

import { AppText } from './text';

export type SegmentedOption<T extends string> = { value: T; label: string };

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** `ghost` is a quiet pill (time ranges). `underline` is text with a short accent bar. */
  variant?: 'solid' | 'ghost' | 'underline';
  testID?: string;
};

const PAD = 4;

/** Pill segmented control with an eased sliding thumb (used for time ranges). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  variant = 'solid',
  testID,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segmentWidth = width > 0 ? (width - PAD * 2) / options.length : 0;
  const translateX = useSharedValue(0);
  const thumbWidth = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    const seg = (w - PAD * 2) / options.length;
    translateX.set(selectedIndex * seg);
    thumbWidth.set(seg);
  };

  useEffect(() => {
    // Slide the thumb whenever the selection (or the measured width) changes.
    if (segmentWidth <= 0) return;
    translateX.set(withTiming(selectedIndex * segmentWidth, timings.indicator));
    thumbWidth.set(segmentWidth);
  }, [selectedIndex, segmentWidth, translateX, thumbWidth]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: thumbWidth.get(),
    transform: [{ translateX: translateX.get() }],
  }));

  const height = size === 'sm' ? 34 : 40;
  const ghost = variant === 'ghost';
  const underline = variant === 'underline';
  const trackBg = ghost || underline ? 'transparent' : theme.colors.surfaceMuted;
  const thumbBg = ghost
    ? theme.scheme === 'dark'
      ? 'rgba(255,255,255,0.12)'
      : 'rgba(255,255,255,0.70)'
    : theme.colors.surfaceElevated;
  const idleColor = ghost || underline ? 'textTertiary' : 'textSecondary';

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      onLayout={underline ? undefined : onLayout}
      style={
        underline
          ? { flexDirection: 'row', alignItems: 'center' }
          : {
              flexDirection: 'row',
              height,
              padding: PAD,
              borderRadius: theme.radii.pill,
              backgroundColor: trackBg,
            }
      }>
      {underline ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: PAD,
              bottom: PAD,
              left: PAD,
              borderRadius: theme.radii.pill,
              backgroundColor: thumbBg,
            },
            ghost ? null : theme.elevation(1),
            thumbStyle,
          ]}
        />
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            testID={testID ? `${testID}-${option.value}` : undefined}
            onPress={() => {
              if (!selected) {
                haptics.selection();
                onChange(option.value);
              }
            }}
            style={
              underline
                ? { paddingHorizontal: 9, paddingTop: 5, paddingBottom: 7, alignItems: 'center' }
                : { flex: 1, alignItems: 'center', justifyContent: 'center' }
            }>
            <AppText variant="label" color={selected ? 'text' : idleColor}>
              {option.label}
            </AppText>
            {underline ? (
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 8,
                  right: 8,
                  bottom: 2,
                  height: 2,
                  borderRadius: 2,
                  backgroundColor: selected ? theme.colors.accent : 'transparent',
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

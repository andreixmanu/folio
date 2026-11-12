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
  testID?: string;
};

const PAD = 4;

/** Pill segmented control with an eased sliding thumb (used for time ranges). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
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

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      onLayout={onLayout}
      style={{
        flexDirection: 'row',
        height,
        padding: PAD,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.surfaceMuted,
      }}>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: PAD,
            bottom: PAD,
            left: PAD,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.surfaceElevated,
          },
          theme.elevation(1),
          thumbStyle,
        ]}
      />
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
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="label" color={selected ? 'text' : 'textSecondary'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

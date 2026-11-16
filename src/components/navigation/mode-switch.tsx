import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { haptics } from '@/lib/haptics';
import { MODE_HOME, useModeStore, type AppMode } from '@/store/mode-store';
import { timings, useTheme } from '@/theme';

const OPTIONS: readonly { value: AppMode; label: string; testID: string }[] = [
  { value: 'invest', label: 'Investimenti', testID: 'mode-invest' },
  { value: 'budget', label: 'Budget', testID: 'mode-budget' },
];

/** Fits the header's extra row (28–32px). SegmentedControl `sm` is 34. */
const HEIGHT = 30;
const PAD = 3;

/**
 * Compact Investimenti / Budget pill. Same eased thumb as SegmentedControl,
 * sized to the header row.
 */
export function ModeSwitch() {
  const theme = useTheme();
  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);
  const [widths, setWidths] = useState<Partial<Record<AppMode, number>>>({});
  const translateX = useSharedValue(0);
  const thumbWidth = useSharedValue(0);
  const placed = useRef(false);

  const investWidth = widths.invest ?? 0;
  const budgetWidth = widths.budget ?? 0;

  useEffect(() => {
    if (investWidth <= 0 || budgetWidth <= 0) return;
    const x = mode === 'budget' ? investWidth : 0;
    const width = mode === 'budget' ? budgetWidth : investWidth;
    if (!placed.current) {
      translateX.set(x);
      thumbWidth.set(width);
      placed.current = true;
      return;
    }
    translateX.set(withTiming(x, timings.indicator));
    thumbWidth.set(width);
  }, [budgetWidth, investWidth, mode, thumbWidth, translateX]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: thumbWidth.get(),
    transform: [{ translateX: translateX.get() }],
  }));

  const onLayout = (value: AppMode) => (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setWidths((current) => (current[value] === width ? current : { ...current, [value]: width }));
  };

  const select = (next: AppMode) => {
    if (next === mode) return;
    haptics.light();
    setMode(next);
    router.replace(MODE_HOME[next]);
  };

  return (
    <View
      testID="mode-switch"
      accessibilityRole="tablist"
      style={{
        position: 'relative',
        alignSelf: 'flex-start',
        flexShrink: 0,
        flexDirection: 'row',
        height: HEIGHT,
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
      {OPTIONS.map((option) => {
        const selected = option.value === mode;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            testID={option.testID}
            onPress={() => select(option.value)}
            onLayout={onLayout(option.value)}
            style={{ paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="label" color={selected ? 'text' : 'textSecondary'}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

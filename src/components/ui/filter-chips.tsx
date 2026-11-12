import { ScrollView } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

import { springs, useTheme } from '@/theme';

import { PressableScale } from './pressable-scale';
import { AppText } from './text';

export type FilterChipOption<T extends string> = { value: T; label: string };

function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  const theme = useTheme();
  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(selected ? theme.colors.text : theme.colors.surface, { duration: 180 }),
    transform: [{ scale: withSpring(selected ? 1 : 0.98, springs.press) }],
  }));
  return (
    <PressableScale
      haptic="selection"
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}>
      <Animated.View
        style={[
          {
            paddingHorizontal: theme.spacing.lg,
            height: 36,
            justifyContent: 'center',
            borderRadius: theme.radii.pill,
            borderWidth: 1,
            borderColor: theme.colors.border,
          },
          bgStyle,
        ]}>
        <AppText variant="label" style={{ color: selected ? theme.colors.background : theme.colors.text }}>
          {label}
        </AppText>
      </Animated.View>
    </PressableScale>
  );
}

/** Horizontal row of filter chips (single selection). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: readonly FilterChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: 2 }}>
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
          testID={testID ? `${testID}-${o.value}` : undefined}
        />
      ))}
    </ScrollView>
  );
}

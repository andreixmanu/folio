import { useState } from 'react';
import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { PressableScale } from '@/components/ui/pressable-scale';
import { AppText } from '@/components/ui/text';
import { formatMoney, formatPercent, MASK } from '@/lib/format';
import type { AllocationSlice } from '@/services/types';
import { useTheme } from '@/theme';

export type AllocationDonutProps = {
  slices: AllocationSlice[];
  masked?: boolean;
  radius?: number;
};

/** Donut chart with a tappable legend; the center shows the selected slice. */
export function AllocationDonut({ slices, masked = false, radius = 84 }: AllocationDonutProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState(0);
  const current = slices[Math.min(selected, slices.length - 1)];

  const data = slices.map((s, i) => ({
    value: s.value,
    color: s.color,
    focused: i === selected,
    onPress: () => setSelected(i),
  }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
      <Animated.View entering={ZoomIn.springify().damping(16)} key={slices.map((s) => s.key).join('|')}>
        <PieChart
          data={data}
          donut
          radius={radius}
          innerRadius={radius * 0.72}
          innerCircleColor={theme.colors.surface}
          strokeWidth={3}
          strokeColor={theme.colors.surface}
          focusOnPress
          sectionAutoFocus
          extraRadius={6}
          centerLabelComponent={() =>
            current ? (
              <View style={{ alignItems: 'center' }}>
                <AppText variant="title" tabular>
                  {formatPercent(current.percent, { signed: false })}
                </AppText>
                <AppText variant="micro" color="textSecondary" numberOfLines={1}>
                  {current.label}
                </AppText>
              </View>
            ) : null
          }
        />
      </Animated.View>
      <View style={{ flex: 1, gap: 2 }}>
        {slices.map((s, i) => (
          <PressableScale
            key={s.key}
            haptic="selection"
            scaleTo={0.97}
            onPress={() => setSelected(i)}
            accessibilityLabel={`${s.label} ${formatPercent(s.percent, { signed: false })}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingVertical: 5,
              paddingHorizontal: theme.spacing.sm,
              borderRadius: theme.radii.sm,
              backgroundColor: i === selected ? theme.colors.surfaceMuted : 'transparent',
            }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
            <Animated.View entering={FadeIn.delay(i * 40)} style={{ flex: 1 }}>
              <AppText variant="caption" numberOfLines={1}>
                {s.label}
              </AppText>
            </Animated.View>
            <View style={{ alignItems: 'flex-end' }}>
              <AppText variant="label" tabular>
                {formatPercent(s.percent, { signed: false })}
              </AppText>
              <AppText variant="micro" color="textSecondary" tabular>
                {masked ? MASK : formatMoney(s.value, 'EUR', { fractionDigits: 0 })}
              </AppText>
            </View>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

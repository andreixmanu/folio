import { useState } from 'react';
import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import Animated from 'react-native-reanimated';

import { AssetAvatar } from '@/components/ui/asset-avatar';
import { PressableScale } from '@/components/ui/pressable-scale';
import { AppText } from '@/components/ui/text';
import { formatMoney, formatPercent, MASK } from '@/lib/format';
import type { AllocationSlice } from '@/services/types';
import { enterFade, useTheme } from '@/theme';

export type AllocationDonutProps = {
  slices: AllocationSlice[];
  masked?: boolean;
  radius?: number;
};

/** Compact donut with a tappable legend; the center shows the selected slice. */
export function AllocationDonut({ slices, masked = false, radius = 59 }: AllocationDonutProps) {
  const theme = useTheme();
  const [selected, setSelected] = useState(0);
  const current = slices[Math.min(selected, slices.length - 1)];
  const withLogos = slices.some((s) => s.asset);

  const data = slices.map((s, i) => ({
    value: s.value,
    color: s.color,
    focused: i === selected,
    onPress: () => setSelected(i),
  }));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
      }}>
      <Animated.View entering={enterFade()}>
        <PieChart
          data={data}
          donut
          radius={radius}
          innerRadius={radius * 0.74}
          innerCircleColor={theme.colors.background}
          strokeWidth={2}
          strokeColor={theme.colors.background}
          focusOnPress
          sectionAutoFocus
          extraRadius={3}
          centerLabelComponent={() =>
            current ? (
              <View style={{ alignItems: 'center', maxWidth: radius * 1.3 }}>
                <AppText variant="headline" tabular>
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
      <View style={{ flex: 1, gap: 0 }}>
        {slices.map((s, i) => (
          <PressableScale
            key={s.key}
            haptic="selection"
            onPress={() => setSelected(i)}
            accessibilityLabel={`${s.label} ${formatPercent(s.percent, { signed: false })}`}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: theme.spacing.sm,
              paddingVertical: 8,
              borderBottomWidth: i < slices.length - 1 ? 1 : 0,
              borderBottomColor: theme.colors.border,
            }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginTop: 5,
                backgroundColor: s.color,
              }}
            />
            {s.asset ? (
              <AssetAvatar symbol={s.asset.symbol} assetClass={s.asset.assetClass} size={22} />
            ) : withLogos ? (
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: theme.colors.surfaceMuted,
                }}
              />
            ) : null}
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 14, lineHeight: 18 }}>
                {s.label}
              </AppText>
              <AppText variant="caption" color="textSecondary" tabular>
                {masked ? MASK : formatMoney(s.value, 'EUR', { fractionDigits: 0 })}
              </AppText>
            </View>
            <AppText
              variant="label"
              tabular
              style={{ minWidth: 48, textAlign: 'right', fontSize: 13, lineHeight: 18, letterSpacing: -0.1 }}>
              {formatPercent(s.percent, { signed: false })}
            </AppText>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

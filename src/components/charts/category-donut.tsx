import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { MoneyText, categoryColor } from '@/features/budget/components';
import { isCategoryId, type Category } from '@/features/budget/model';
import { useCustomCategories } from '@/features/budget/use-categories';
import { useTheme, type ColorSchemeName } from '@/theme';

export type CategoryDonutSlice = {
  categoryId: string;
  value: number;
};

export type CategoryDonutProps = {
  slices: readonly CategoryDonutSlice[];
  total: number;
  masked?: boolean;
  size?: number;
  testID?: string;
};

const STROKE = 16;
const GAP = 2;

function sliceColor(
  categoryId: string,
  scheme: ColorSchemeName,
  fallback: string,
  custom: readonly Category[],
): string {
  if (!isCategoryId(categoryId)) return fallback;
  return categoryColor(categoryId, scheme, custom);
}

/**
 * Spending share as a ring. Each slice is a stroke segment with a 2px gap,
 * starting at 12 o'clock. The center is the period total.
 */
export function CategoryDonut({
  slices,
  total,
  masked = false,
  size = 168,
  testID = 'category-donut',
}: CategoryDonutProps) {
  const theme = useTheme();
  const custom = useCustomCategories();
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const arcs = slices.filter((slice) => slice.value > 0);
  const sum = arcs.reduce((acc, slice) => acc + slice.value, 0);

  const lengths = arcs.map((slice) => (sum > 0 ? (slice.value / sum) * circumference : 0));
  const segments = lengths.map((length, index) => ({
    key: arcs[index]?.categoryId ?? String(index),
    color: sliceColor(arcs[index]?.categoryId ?? '', theme.scheme, theme.colors.textTertiary, custom),
    dash: Math.max(0, length - GAP),
    offset: lengths.slice(0, index).reduce((acc, value) => acc + value, 0),
  }));

  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel="Ripartizione per categoria"
      style={{ width: size, height: size, alignSelf: 'center' }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.colors.border}
          strokeWidth={STROKE}
          fill="none"
        />
        {segments.map((segment) => (
          <Circle
            key={segment.key}
            cx={center}
            cy={center}
            r={radius}
            stroke={segment.color}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="butt"
            strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
            strokeDashoffset={-segment.offset}
            rotation={-90}
            originX={center}
            originY={center}
          />
        ))}
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: STROKE + 8,
          right: STROKE + 8,
          top: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <MoneyText amount={total} tone="balance" variant="bodyStrong" masked={masked} numberOfLines={1} />
      </View>
    </View>
  );
}

import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { LineChart, type lineDataItem } from 'react-native-gifted-charts';

import { AppText } from '@/components/ui/text';
import { formatMoney, MASK } from '@/lib/format';
import { useTheme } from '@/theme';

export type SpendComparePoint = {
  day: number;
  current: number | null;
  previous: number | null;
};

export type SpendCompareChartProps = {
  points: readonly SpendComparePoint[];
  height?: number;
  masked?: boolean;
  currentLabel?: string;
  previousLabel?: string;
  testID?: string;
};

/** Values up to the first null. Cumulative series only go null at the tail. */
function definedPrefix(values: readonly (number | null)[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    if (value == null) break;
    out.push(value);
  }
  return out;
}

function axisLabel(day: number, last: number): string | undefined {
  if (day === 1 || day === last) return String(day);
  if (last >= 21 && day === 10) return '10';
  if (last >= 28 && day === 20) return '20';
  return undefined;
}

/** Wider than `spacing`, which is all gifted-charts gives each x-axis label. */
const DAY_LABEL_WIDTH = 28;
/** Height of the x-axis day labels plus a small gap before the legend. */
const DAY_LABEL_CLEARANCE = 24;

type AxisPoint = lineDataItem & { labelWidth?: number };

function withOrigin(
  values: readonly number[],
  labelAt?: (day: number) => string | undefined,
  labelTextStyle?: lineDataItem['labelTextStyle'],
): AxisPoint[] {
  const items: AxisPoint[] = [{ value: 0 }];
  values.forEach((value, index) => {
    const label = labelAt?.(index + 1);
    items.push(
      label
        ? {
            value,
            label,
            labelTextStyle,
            labelWidth: DAY_LABEL_WIDTH,
          }
        : { value },
    );
  });
  return items;
}

function LegendMark({ color, dashed }: { color: string; dashed: boolean }) {
  if (!dashed) {
    return <View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: color }} />;
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, width: 16 }}>
      <View style={{ width: 6, height: 2, borderRadius: 1, backgroundColor: color }} />
      <View style={{ width: 6, height: 2, borderRadius: 1, backgroundColor: color }} />
    </View>
  );
}

/**
 * Month-to-date cumulative spend against the previous month.
 * Same LineChart as the portfolio value chart: solid accent area for this month,
 * dimmed dashed line for the last one. Both series start at zero so the slope is visible.
 */
export function SpendCompareChart({
  points,
  height = 132,
  masked = false,
  currentLabel = 'Questo mese',
  previousLabel = 'Mese scorso',
  testID = 'spend-compare-chart',
}: SpendCompareChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const accent = theme.colors.accent;
  const previousColor = theme.colors.textTertiary;

  const model = useMemo(() => {
    const currentValues = definedPrefix(points.map((point) => point.current));
    const previousValues = definedPrefix(points.map((point) => point.previous));
    const dayLabelStyle = {
      color: theme.colors.textTertiary,
      fontSize: 11,
      fontFamily: theme.fonts.medium,
      width: DAY_LABEL_WIDTH,
      // react-native-web caps one-line Text at maxWidth 100% of the spacing-wide slot.
      maxWidth: DAY_LABEL_WIDTH,
      textAlign: 'center' as const,
      alignSelf: 'center' as const,
    };
    const current = withOrigin(currentValues, (day) => axisLabel(day, currentValues.length), dayLabelStyle);
    const previous = withOrigin(previousValues);
    const peak = Math.max(0, ...currentValues, ...previousValues);
    return {
      current,
      previous,
      currentValues,
      previousValues,
      maxValue: peak > 0 ? peak * 1.12 : 1,
    };
  }, [points, theme.colors.textTertiary, theme.fonts.medium]);

  const count = Math.max(model.current.length, model.previous.length);
  const spacing = count > 1 && width > 0 ? width / (count - 1) : 0;
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width));

  const valueAt = (values: readonly number[], index: number): number | undefined => {
    if (index === 0) return 0;
    return values[index - 1];
  };

  return (
    <View testID={testID}>
      <View
        collapsable={false}
        onLayout={onLayout}
        style={{ height }}>
        {width > 0 && model.current.length > 1 ? (
          <LineChart
            data={model.current}
            data2={model.previous}
            width={width}
            height={height}
            maxValue={model.maxValue}
            spacing={spacing}
            initialSpacing={0}
            endSpacing={0}
            areaChart1
            curved
            curvature={0.12}
            thickness={2.5}
            thickness2={1.5}
            color={accent}
            color2={previousColor}
            startFillColor={accent}
            endFillColor={accent}
            startOpacity={0.22}
            endOpacity={0}
            startOpacity2={0}
            endOpacity2={0}
            strokeDashArray2={[4, 4]}
            hideDataPoints
            hideRules
            hideYAxisText
            yAxisLabelWidth={0}
            yAxisThickness={0}
            xAxisThickness={0}
            xAxisLabelTextStyle={{
              color: theme.colors.textTertiary,
              fontSize: 11,
              fontFamily: theme.fonts.medium,
            }}
            disableScroll
            isAnimated
            animationDuration={450}
            zIndex1={1}
            pointerConfig={{
              pointerStripHeight: height,
              pointerStripColor: theme.colors.textTertiary,
              pointerStripWidth: 1,
              strokeDashArray: [3, 4],
              pointerColor: accent,
              pointer1Color: accent,
              pointer2Color: previousColor,
              radius: 5,
              pointerLabelWidth: 168,
              pointerLabelHeight: 72,
              activatePointersOnLongPress: false,
              autoAdjustPointerLabelPosition: true,
              shiftPointerLabelY: -8,
              pointerLabelComponent: (_item: unknown, _secondary: unknown, index: number) => {
                if (typeof index !== 'number' || index < 0) return null;
                const currentValue = valueAt(model.currentValues, index);
                const previousValue = valueAt(model.previousValues, index);
                const caption = index === 0 ? 'Inizio' : `Giorno ${index}`;
                const money = (value: number) => (masked ? MASK : formatMoney(value));
                return (
                  <View
                    style={[
                      {
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: theme.radii.md,
                        backgroundColor: theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        gap: 2,
                      },
                      theme.elevation(2),
                    ]}>
                    <AppText variant="micro" color="textSecondary">
                      {caption}
                    </AppText>
                    {currentValue != null ? (
                      <AppText variant="label" color="accent" tabular>
                        {`${currentLabel} ${money(currentValue)}`}
                      </AppText>
                    ) : null}
                    {previousValue != null ? (
                      <AppText variant="label" color="textSecondary" tabular>
                        {`${previousLabel} ${money(previousValue)}`}
                      </AppText>
                    ) : null}
                  </View>
                );
              },
            }}
          />
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.lg,
          // Day labels render below the plot area; keep the legend clear of them.
          marginTop: DAY_LABEL_CLEARANCE,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <LegendMark color={accent} dashed={false} />
          <AppText variant="micro" color="textSecondary">
            {currentLabel}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <LegendMark color={previousColor} dashed />
          <AppText variant="micro" color="textSecondary">
            {previousLabel}
          </AppText>
        </View>
      </View>
    </View>
  );
}

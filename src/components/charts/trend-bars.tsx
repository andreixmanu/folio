import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { BarChart, type barDataItem } from 'react-native-gifted-charts';

import { AppText } from '@/components/ui/text';
import { useTheme } from '@/theme';

export type TrendBarPoint = {
  month: string;
  spent: number;
  income: number;
};

export type TrendBarsProps = {
  points: readonly TrendBarPoint[];
  height?: number;
  testID?: string;
};

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'] as const;

function monthLabel(isoMonth: string): string {
  const index = Number(isoMonth.slice(5, 7)) - 1;
  return MONTHS[index] ?? isoMonth.slice(5, 7);
}

function LegendMark({ color, label }: { color: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <View style={{ width: 10, height: 10, borderRadius: theme.radii.pill, backgroundColor: color }} />
      <AppText variant="micro" color="textSecondary">
        {label}
      </AppText>
    </View>
  );
}

/**
 * Six-month income against spending. Grouped bars: accent for Uscite, positive for Entrate.
 * Width comes from the container so the chart fits the island card.
 */
export function TrendBars({ points, height = 148, testID = 'trend-bars' }: TrendBarsProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const spentColor = theme.colors.negative;
  const incomeColor = theme.colors.positive;
  const onLayout = (event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width));

  const model = useMemo(() => {
    const labelStyle = {
      color: theme.colors.textTertiary,
      fontSize: 11,
      fontFamily: theme.fonts.medium,
    };
    const data: barDataItem[] = [];
    points.forEach((point) => {
      data.push({
        value: point.spent,
        label: monthLabel(point.month),
        spacing: 3,
        labelWidth: 32,
        labelTextStyle: labelStyle,
        frontColor: spentColor,
      });
      data.push({
        value: point.income,
        frontColor: incomeColor,
      });
    });
    const peak = Math.max(0, ...points.flatMap((point) => [point.spent, point.income]));
    return { data, maxValue: peak > 0 ? peak * 1.16 : 1 };
  }, [incomeColor, points, spentColor, theme.colors.textTertiary, theme.fonts.medium]);

  const groups = Math.max(points.length, 1);
  const groupGap = 14;
  const innerGap = 3;
  const barWidth = width > 0 ? Math.max(6, Math.floor((width - groups * groupGap - groups * innerGap) / (groups * 2))) : 8;

  return (
    <View testID={testID}>
      <View collapsable={false} onLayout={onLayout} style={{ height }}>
        {width > 0 && model.data.length > 0 ? (
          <BarChart
            data={model.data}
            width={width}
            height={height}
            barWidth={barWidth}
            spacing={groupGap}
            initialSpacing={0}
            endSpacing={0}
            maxValue={model.maxValue}
            noOfSections={3}
            roundedTop
            disableScroll
            hideRules
            hideYAxisText
            yAxisLabelWidth={0}
            yAxisThickness={0}
            xAxisThickness={0}
            labelsExtraHeight={18}
            xAxisLabelTextStyle={{
              color: theme.colors.textTertiary,
              fontSize: 11,
              fontFamily: theme.fonts.medium,
            }}
            isAnimated
            animationDuration={450}
          />
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.lg,
          // Month labels render below the bars' box; keep the legend clear of them.
          marginTop: 28,
        }}>
        <LegendMark color={spentColor} label="Uscite" />
        <LegendMark color={incomeColor} label="Entrate" />
      </View>
    </View>
  );
}

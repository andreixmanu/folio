import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { LineChart, type lineDataItem } from "react-native-gifted-charts";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AppText } from "@/components/ui/text";
import { chartPointBudget, downsampleLttb } from "@/lib/downsample";
import { formatChartDate, formatMoney, MASK } from "@/lib/format";
import type { TimeRange, ValuePoint } from "@/services/types";
import { timings, useTheme } from "@/theme";

export type ValueChartProps = {
  points: ValuePoint[];
  range: TimeRange;
  height?: number;
  /** Positive trend uses the positive color, negative the negative color. */
  trend: "up" | "down";
  masked?: boolean;
};

/**
 * 220ms ease-out on first paint and when the range changes. Keyed by range so a live
 * quote (same range, new last point) does not replay it. Gifted-charts' own draw is
 * linear and restarts on data changes, so it stays off.
 */
function ChartFade({
  range,
  children,
}: {
  range: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion() === true;
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      opacity.set(1);
      return;
    }
    opacity.set(withTiming(1, timings.chart));
  }, [opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View key={range} style={[{ flex: 1 }, style]}>
      {children}
    </Animated.View>
  );
}

/**
 * Area chart of portfolio value over time (react-native-gifted-charts + react-native-svg,
 * works in Expo Go and on web). Drag to scrub: the label is that series point's euro
 * value and date, not the shifted chart coordinate. The range chip stays on the
 * first-to-last change; it does not follow the finger.
 */
function ValueChartImpl({
  points: rawPoints,
  range,
  height = 150,
  trend,
  masked = false,
}: ValueChartProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const color = trend === "up" ? theme.colors.positive : theme.colors.negative;

  const budget = chartPointBudget(width);
  const points = useMemo(
    () => downsampleLttb(rawPoints, budget),
    [rawPoints, budget],
  );

  const { data, maxValue } = useMemo(() => {
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.12, 1);
    // Shift values so the curve uses the full chart height instead of starting at 0.
    const shifted: lineDataItem[] = values.map((v) => ({
      value: v - min + pad,
    }));
    return { data: shifted, maxValue: max - min + pad * 2 };
  }, [points]);

  const pointerConfig = useMemo(
    () => ({
      pointerStripHeight: height,
      pointerStripColor: theme.colors.textTertiary,
      pointerStripWidth: 1,
      strokeDashArray: [3, 4],
      pointerColor: color,
      radius: 6,
      pointerLabelWidth: 150,
      pointerLabelHeight: 56,
      activatePointersOnLongPress: false,
      autoAdjustPointerLabelPosition: true,
      shiftPointerLabelY: -8,
      pointerLabelComponent: (
        _items: lineDataItem[],
        _secondary: unknown,
        index: number,
      ) => {
        const point = points[index];
        if (!point) return null;
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
              },
              theme.elevation(2),
            ]}
          >
            <AppText variant="label" tabular>
              {masked ? MASK : formatMoney(point.value)}
            </AppText>
            <AppText variant="micro" color="textSecondary">
              {formatChartDate(point.timestamp, range)}
            </AppText>
          </View>
        );
      },
    }),
    [height, theme, color, points, masked, range],
  );

  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(Math.floor(e.nativeEvent.layout.width));
  const spacing = data.length > 1 && width > 0 ? width / (data.length - 1) : 0;

  return (
    <View
      onLayout={onLayout}
      style={{ height, marginHorizontal: -theme.spacing.lg }}
      testID="value-chart"
    >
      {width > 0 && data.length > 1 ? (
        <ChartFade key={range} range={range}>
          <LineChart
            data={data}
            width={width}
            height={height}
            maxValue={maxValue}
            noOfSections={4}
            spacing={spacing}
            initialSpacing={0}
            endSpacing={0}
            areaChart
            curved
            curvature={0.12}
            thickness={2.5}
            color={color}
            startFillColor={color}
            endFillColor={color}
            startOpacity={0.28}
            endOpacity={0}
            hideDataPoints
            hideRules
            hideYAxisText
            yAxisLabelWidth={0}
            yAxisThickness={0}
            xAxisThickness={0}
            disableScroll
            isAnimated={false}
            animateOnDataChange={false}
            pointerConfig={pointerConfig}
          />
        </ChartFade>
      ) : null}
    </View>
  );
}

export const ValueChart = memo(ValueChartImpl);

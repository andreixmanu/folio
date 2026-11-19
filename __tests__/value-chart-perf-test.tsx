import { act, screen } from "@testing-library/react-native";
import { useState } from "react";
import { View } from "react-native";

import { ValueChart } from "@/components/charts/value-chart";
import { downsampleLttb } from "@/lib/downsample";
import { buildValueHistory } from "@/services/portfolio";
import { RANGE_SPECS } from "@/services/ranges";
import type {
  Position,
  PriceSeries,
  TimeRange,
  ValuePoint,
} from "@/services/types";
import { renderWithProviders } from "../test/test-utils";

const lineChartCalls: { points: number }[] = [];
let lastPoints = 0;
jest.mock("react-native-gifted-charts", () => ({
  LineChart: (props: { data: unknown[] }) => {
    lastPoints = props.data.length;
    lineChartCalls.push({ points: props.data.length });
    return null;
  },
}));

const POSITIONS: Position[] = ["BTC", "ETH", "SOL"].map((symbol) => ({
  id: symbol,
  sourceId: "tangem",
  symbol,
  name: symbol,
  assetClass: "crypto",
  instrument: "coin",
  quantity: 2,
}));

function series(range: TimeRange): PriceSeries[] {
  const n = RANGE_SPECS[range].points;
  return POSITIONS.map((p, k) => ({
    symbol: p.symbol,
    points: Array.from({ length: n }, (_, i) => ({
      t: i * 1000,
      close: 100 + 20 * Math.sin(i / (7 + k)) + i * 0.05,
    })),
  }));
}

function time(fn: () => void, runs = 200): number {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t0) / runs;
}

test("chart data transform timings (ms/run)", () => {
  for (const range of ["1W", "1Y"] as TimeRange[]) {
    const s = series(range);
    let pts: ValuePoint[] = [];
    const build = time(() => {
      pts = buildValueHistory(POSITIONS, s, range, {
        t: 1e9,
        value: 500,
      }).points;
    });
    const down = time(() => downsampleLttb(pts, 120));
    console.log(
      `PERF ${range}: points=${pts.length} buildValueHistory=${build.toFixed(3)}ms lttb(120)=${down.toFixed(3)}ms`,
    );
  }
});

test("downsample keeps ends and extremes shape", () => {
  const pts = Array.from({ length: 365 }, (_, i) => ({
    timestamp: i,
    value: i === 200 ? 1000 : Math.sin(i / 9) * 10,
  }));
  const d = downsampleLttb(pts, 100);
  expect(d).toHaveLength(100);
  expect(d[0]).toBe(pts[0]);
  expect(d.at(-1)).toBe(pts.at(-1));
  expect(d.some((p) => p.value === 1000)).toBe(true);
});

test("chart does not re-render when the parent re-renders with the same props", async () => {
  const pts: ValuePoint[] = Array.from({ length: 365 }, (_, i) => ({
    timestamp: i,
    value: 100 + i,
  }));
  let bump: () => void = () => {};
  function Parent() {
    const [, set] = useState(0);
    bump = () => set((x) => x + 1);
    return (
      <View>
        <ValueChart points={pts} range="1Y" trend="up" />
      </View>
    );
  }
  await renderWithProviders(<Parent />);
  await act(async () => {
    screen
      .getByTestId("value-chart")
      .props.onLayout({ nativeEvent: { layout: { width: 360 } } });
  });
  lineChartCalls.length = 0;
  for (let i = 0; i < 5; i++) await act(async () => bump());
  console.log(
    `PERF rerender: LineChart renders after 5 parent renders = ${lineChartCalls.length}`,
  );
  await act(async () => {
    screen
      .getByTestId("value-chart")
      .props.onLayout({ nativeEvent: { layout: { width: 360 } } });
  });
  console.log(`PERF data points passed to LineChart (365 in) = ${lastPoints}`);
});

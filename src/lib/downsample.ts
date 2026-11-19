export type XY = { timestamp: number; value: number };

/** Target point count for the chart: ~1 point per 3 px is visually lossless for a 2.5px line. */
export function chartPointBudget(widthPx: number): number {
  return Math.max(60, Math.min(160, Math.round(widthPx / 3)));
}

/**
 * Largest-Triangle-Three-Buckets downsampling: keeps first/last point and the visual shape.
 * Returns the input untouched when it is already within `target`.
 */
export function downsampleLttb<T extends XY>(points: T[], target: number): T[] {
  const n = points.length;
  if (target >= n || target < 3) return points;
  const out: T[] = [points[0]!];
  const every = (n - 2) / (target - 2);
  let a = 0;
  for (let i = 0; i < target - 2; i++) {
    const nextStart = Math.floor((i + 1) * every) + 1;
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
    let avgX = 0;
    let avgY = 0;
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += j;
      avgY += points[j]!.value;
    }
    const len = Math.max(1, nextEnd - nextStart);
    avgX /= len;
    avgY /= len;
    const start = Math.floor(i * every) + 1;
    const end = Math.floor((i + 1) * every) + 1;
    const ax = a;
    const ay = points[a]!.value;
    let best = -1;
    let pick = start;
    for (let j = start; j < end; j++) {
      const area = Math.abs(
        (ax - avgX) * (points[j]!.value - ay) - (ax - j) * (avgY - ay),
      );
      if (area > best) {
        best = area;
        pick = j;
      }
    }
    out.push(points[pick]!);
    a = pick;
  }
  out.push(points[n - 1]!);
  return out;
}

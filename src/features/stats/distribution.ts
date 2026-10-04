import type { StatsRow } from "./model";

/** Context across team medians, not a second aggregation of robot-match values. */
export function percentile(
  values: readonly number[],
  fraction: number,
): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * fraction;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return ordered[low] + (ordered[high] - ordered[low]) * (position - low);
}

export function fuelDistribution(
  rows: readonly StatsRow[],
  minimumSamples = 2,
) {
  const values = rows.flatMap((row) =>
    row.metrics.fuel.teleop.sampleSize >= minimumSamples &&
    row.metrics.fuel.teleop.median !== null
      ? [row.metrics.fuel.teleop.median]
      : [],
  );
  return {
    teamCount: values.length,
    min: percentile(values, 0),
    q1: percentile(values, 0.25),
    median: percentile(values, 0.5),
    q3: percentile(values, 0.75),
    max: percentile(values, 1),
    topDecile: values.length >= 10 ? percentile(values, 0.9) : null,
  };
}

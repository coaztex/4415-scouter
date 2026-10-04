export type NumericSummary = {
  sampleSize: number;
  mean: number | null;
  median: number | null;
  best: number | null;
  standardDeviation: number | null;
};

/** Population SD describes the observed sample, not an estimate of a population. */
export function summarize(values: readonly (number | null)[]): NumericSummary {
  const known = values.filter((value): value is number => value !== null);
  if (known.some((value) => !Number.isFinite(value)))
    throw new Error("Metrics must be finite.");
  const n = known.length;
  if (!n)
    return {
      sampleSize: 0,
      mean: null,
      median: null,
      best: null,
      standardDeviation: null,
    };
  const ordered = [...known].sort((a, b) => a - b);
  const mean = known.reduce((total, value) => total + value, 0) / n;
  const middle = Math.floor(n / 2);
  return {
    sampleSize: n,
    mean,
    median:
      n % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2,
    best: ordered[n - 1],
    standardDeviation: Math.sqrt(
      known.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n,
    ),
  };
}

export function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

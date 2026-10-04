import type { MetricFormat } from "./module";

/** Explicit locale avoids server/client locale-dependent formatting differences. */
export function formatMetric(
  value: number | null,
  format: MetricFormat,
  locale = "en-US",
): string {
  if (value === null) return "—";
  if (!Number.isFinite(value))
    throw new Error("Cannot format a non-finite metric.");
  return new Intl.NumberFormat(locale, {
    style: format === "percent" ? "percent" : "decimal",
    maximumFractionDigits: format === "integer" ? 0 : 1,
  }).format(value);
}

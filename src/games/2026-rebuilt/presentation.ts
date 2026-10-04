import type { MetricDefinition } from "../core/module";
import { activityStates } from "./activity";
const metric = (
  id: string,
  label: string,
  description: string,
  format: MetricDefinition["format"] = "decimal",
  extra: Partial<MetricDefinition> = {},
): MetricDefinition => ({ id, label, description, format, ...extra });
export const rebuiltMetrics: readonly MetricDefinition[] = [
  metric(
    "sampleSize",
    "Scouted matches",
    "Selected final team/match observations.",
    "integer",
  ),
  metric(
    "fuel.confidentSampleSize",
    "Confident FUEL samples",
    "Both phases known; good or rough estimate, excluding DNS/DNF.",
    "integer",
  ),
  metric(
    "fuel.veryUncertainSampleSize",
    "Very uncertain FUEL samples",
    "Stored observations excluded from default FUEL summaries only.",
    "integer",
  ),
  ...(["auto", "teleop", "total"] as const).flatMap((phase) =>
    (
      ["mean", "median", "best", "standardDeviation", "sampleSize"] as const
    ).map((stat) =>
      metric(
        `fuel.${phase}.${stat}`,
        `${phase.toUpperCase()} estimated FUEL ${stat === "standardDeviation" ? "spread (SD)" : stat}`,
        "Known completed-match estimates including zero; very uncertain excluded unless opted in. DNS/DNF output stays on match records but is excluded from offensive summaries. SD is population spread, not accuracy.",
        stat === "sampleSize" ? "integer" : "decimal",
        { unit: stat === "sampleSize" ? "observations" : "FUEL" },
      ),
    ),
  ),
  ...activityStates.flatMap((state) => [
    metric(
      `activity.${state}.seconds.mean`,
      `${state === "shuttling_passing" ? "Shuttling/passing" : state.replace("_", "/")} time per observed match`,
      "Known positive observation windows only; seconds, not inferred full-match duration.",
      "decimal",
      { unit: "seconds" },
    ),
    metric(
      `activity.${state}.share.mean`,
      `${state === "shuttling_passing" ? "Shuttling/passing" : state} time share`,
      "Mean per-observation share; partial windows retain their measured denominator.",
      "percent",
    ),
    metric(
      `activity.${state}.periods.mean`,
      `${state === "shuttling_passing" ? "Shuttling/passing" : state} periods per observed match`,
      "Contiguous positive-duration periods; no manual cycle count.",
    ),
    metric(
      `activity.${state}.frequency`,
      `${state === "shuttling_passing" ? "Shuttling/passing" : state} frequency`,
      "Fraction of timed observations with at least one period.",
      "percent",
    ),
  ]),
  metric(
    "defense.frequency",
    "Observed defense frequency",
    "At least five timed seconds or deliberate defense observation; untimed unmarked records excluded.",
    "percent",
  ),
  ...(["poor", "average", "strong"] as const).map((rating) =>
    metric(
      `defense.effectiveness.frequencies.${rating}`,
      `Defense effectiveness: ${rating} (subjective)`,
      "Scout assessment; no numeric score assigned to ordinal ratings.",
      "percent",
      { subjective: true, priority: "supporting" },
    ),
  ),
  metric(
    "auto.successfulRate",
    "AUTO successful rate",
    "Known execution observations only.",
    "percent",
  ),
  metric(
    "auto.partialRate",
    "AUTO partial rate",
    "Known execution observations only.",
    "percent",
  ),
  metric(
    "auto.failedRate",
    "AUTO failed rate",
    "Known execution observations only.",
    "percent",
  ),
  metric(
    "auto.additionalFuel.frequency",
    "AUTO additional FUEL collection",
    "Yes divided by yes/no reports; unknown/DNS excluded.",
    "percent",
  ),
  metric(
    "reliability.fullMatchRate",
    "Full-match rate",
    "Normal/minor/major issue divided by all statuses including DNF/DNS.",
    "percent",
  ),
  ...(["rough", "average", "strong"] as const).map((rating) =>
    metric(
      `driverControl.frequencies.${rating}`,
      `Driver control: ${rating} (subjective)`,
      "Supporting scout opinion; not a decisive performance metric.",
      "percent",
      { subjective: true, priority: "supporting" },
    ),
  ),
  metric(
    "climb.auto.frequencies.achieved",
    "AUTO climb achieved",
    "Known climb observations only; secondary metric.",
    "percent",
    { priority: "supporting" },
  ),
];

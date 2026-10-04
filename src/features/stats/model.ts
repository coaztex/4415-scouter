import { z } from "zod";
import {
  build2026Stats,
  scoutingMetric,
  scoutingMetricSample,
  type ScoutingMetricKey,
} from "@/games/2026-rebuilt/stats";
import type { RebuiltAggregate } from "@/games/2026-rebuilt/aggregate";
import type { RebuiltPitData } from "@/games/2026-rebuilt/pit-schema";
import type { TeamDirectoryRow } from "@/features/teams/model";

export const tabs = [
  "overview",
  "fuel",
  "activity",
  "auto",
  "reliability",
  "external",
] as const;
export type StatsTab = (typeof tabs)[number];
export const tabLabels: Record<StatsTab, string> = {
  overview: "Overview",
  fuel: "FUEL",
  activity: "Activity",
  auto: "Auto",
  reliability: "Reliability",
  external: "External",
};

export type Metric = {
  key: string;
  label: string;
  unit: "fuel" | "seconds" | "percent" | "count" | "points";
  scouting?: ScoutingMetricKey;
  external?: (row: TeamDirectoryRow) => number | null;
  source: "Our scouting" | "TBA" | "Statbotics";
  lowerIsBetter?: boolean;
};
const scout = (
  key: ScoutingMetricKey,
  label: string,
  unit: Metric["unit"],
  lowerIsBetter = false,
): Metric => ({
  key,
  label,
  unit,
  scouting: key,
  source: "Our scouting",
  lowerIsBetter,
});
const external = (
  key: string,
  label: string,
  unit: Metric["unit"],
  source: "TBA" | "Statbotics",
  get: Metric["external"],
  lowerIsBetter = false,
): Metric => ({ key, label, unit, source, external: get, lowerIsBetter });

export const metricsByTab: Record<Exclude<StatsTab, "overview">, Metric[]> = {
  fuel: [
    scout("teleop_median", "Median TELEOP FUEL", "fuel"),
    scout("teleop_mean", "Mean TELEOP FUEL", "fuel"),
    scout("teleop_best", "Best TELEOP FUEL", "fuel"),
    scout("total_median", "Median total FUEL", "fuel"),
    scout("total_mean", "Mean total FUEL", "fuel"),
    scout("total_best", "Best total FUEL", "fuel"),
    scout("auto_median", "Median AUTO FUEL", "fuel"),
    scout("fuel_consistency", "TELEOP FUEL standard deviation", "fuel", true),
  ],
  activity: [
    scout("scoring_share", "Scoring time share", "percent"),
    scout("passing_share", "Shuffling time share", "percent"),
    scout("defending_share", "Defense time share", "percent"),
    scout("other_share", "Inactive / other time share", "percent"),
    scout("scoring_seconds", "Scoring seconds / timed match", "seconds"),
    scout("passing_seconds", "Shuffling seconds / timed match", "seconds"),
    scout("defense_seconds", "Defense seconds / timed match", "seconds"),
    scout("scoring_periods", "Scoring periods / timed match", "count"),
    scout("passing_periods", "Shuffling periods / timed match", "count"),
    scout("passer_role", "Shuttler observed-role frequency", "percent"),
    scout("defense_frequency", "Meaningful defense frequency", "percent"),
    scout("defense_strong", "Strong defense rating (subjective)", "percent"),
    scout("defender_role", "Defender observed-role frequency", "percent"),
  ],
  auto: [
    scout("auto_median", "Median AUTO FUEL", "fuel"),
    scout("auto_mean", "Mean AUTO FUEL", "fuel"),
    scout("auto_best", "Best AUTO FUEL", "fuel"),
    scout("auto_success", "Successful auto rate", "percent"),
    scout("auto_partial", "Partial auto rate", "percent"),
    scout("auto_failed", "Failed auto rate", "percent"),
    scout("auto_collection", "Additional FUEL collection frequency", "percent"),
  ],
  reliability: [
    scout("full_match", "Full-match rate", "percent"),
    scout("dns_frequency", "DNS frequency", "percent", true),
    scout("dnf_frequency", "DNF frequency", "percent", true),
    scout("minor_issues", "Minor-issue matches", "count", true),
    scout("major_issues", "Major-issue matches", "count", true),
    scout(
      "recent_issue_change",
      "Recent notable-issue change",
      "percent",
      true,
    ),
  ],
  external: [
    external(
      "epa",
      "Statbotics EPA",
      "points",
      "Statbotics",
      (row) => row.statbotics?.total ?? null,
    ),
    external(
      "epa_auto",
      "Statbotics AUTO EPA",
      "points",
      "Statbotics",
      (row) => row.statbotics?.auto ?? null,
    ),
    external(
      "epa_teleop",
      "Statbotics TELEOP EPA",
      "points",
      "Statbotics",
      (row) => row.statbotics?.teleop ?? null,
    ),
    external(
      "epa_endgame",
      "Statbotics ENDGAME EPA",
      "points",
      "Statbotics",
      (row) => row.statbotics?.endgame ?? null,
    ),
    external(
      "epa_auto_fuel",
      "Statbotics AUTO FUEL component",
      "fuel",
      "Statbotics",
      (row) => row.statbotics?.components.auto_fuel ?? null,
    ),
    external(
      "epa_teleop_fuel",
      "Statbotics TELEOP FUEL component",
      "fuel",
      "Statbotics",
      (row) => row.statbotics?.components.teleop_fuel ?? null,
    ),
    external("opr", "TBA OPR", "points", "TBA", (row) => row.tba?.opr ?? null),
    external(
      "dpr",
      "TBA DPR",
      "points",
      "TBA",
      (row) => row.tba?.dpr ?? null,
      true,
    ),
    external(
      "ccwm",
      "TBA CCWM",
      "points",
      "TBA",
      (row) => row.tba?.ccwm ?? null,
    ),
    external(
      "copr_auto_fuel",
      "TBA AUTO FUEL COPR",
      "fuel",
      "TBA",
      (row) => row.tba?.components.auto_fuel ?? null,
    ),
    external(
      "copr_teleop_fuel",
      "TBA TELEOP FUEL COPR",
      "fuel",
      "TBA",
      (row) => row.tba?.components.teleop_fuel ?? null,
    ),
    external(
      "copr_total_fuel",
      "TBA total FUEL COPR",
      "fuel",
      "TBA",
      (row) => row.tba?.components.total_fuel ?? null,
    ),
    external("rank", "TBA event rank", "count", "TBA", (row) => row.rank, true),
  ],
};
export const querySchema = z.object({
  tab: z
    .preprocess(
      (value) =>
        value === "scoring"
          ? "fuel"
          : value === "support" || value === "defense"
            ? "activity"
            : value,
      z.enum(tabs),
    )
    .catch("overview"),
  metric: z.string().max(50).catch(""),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  min: z.coerce.number().int().min(0).max(20).catch(1),
  uncertain: z.enum(["exclude", "include"]).catch("exclude"),
  team: z.coerce.number().int().positive().optional().catch(undefined),
  q: z.string().trim().max(80).catch(""),
});
export type StatsQuery = z.infer<typeof querySchema>;
export type StatsRow = TeamDirectoryRow & {
  metrics: RebuiltAggregate;
  issueTrend: number | null;
  claimedRoutines: RebuiltPitData["autonomous_routines"];
};

export function buildStatsRows(
  eventId: string,
  rows: readonly TeamDirectoryRow[],
  includeVeryUncertainFuel: boolean,
) {
  const submissions = rows.flatMap((row) =>
    row.observations.map((item) => ({
      eventId,
      matchId: item.matchId,
      teamNumber: row.teamNumber,
      matchOrder: item.matchNumber,
      data: item.data,
    })),
  );
  const result = build2026Stats(submissions, { includeVeryUncertainFuel });
  return {
    overall: result.overall,
    autoStarts: result.autoStarts,
    rows: rows.map((row): StatsRow => ({
      ...row,
      metrics: result.teamMetrics.get(row.teamNumber) ?? row.scouting,
      issueTrend: result.issueTrends.get(row.teamNumber) ?? null,
      claimedRoutines: null,
    })),
  };
}

export function selectedMetric(query: StatsQuery): Metric | null {
  if (query.tab === "overview") return null;
  const choices = metricsByTab[query.tab];
  return choices.find((choice) => choice.key === query.metric) ?? choices[0];
}
/** Choose a populated external default without overriding an explicit metric choice. */
export function withAvailableExternalDefault(
  query: StatsQuery,
  rows: readonly StatsRow[],
): StatsQuery {
  if (
    query.tab !== "external" ||
    query.metric ||
    rows.some((row) => row.statbotics?.total != null)
  )
    return query;
  if (rows.some((row) => row.tba?.opr != null))
    return { ...query, metric: "opr" };
  if (rows.some((row) => row.rank != null)) return { ...query, metric: "rank" };
  return query;
}
export function metricValue(row: StatsRow, metric: Metric): number | null {
  return metric.scouting
    ? scoutingMetric(row.metrics, metric.scouting, row.issueTrend)
    : (metric.external?.(row) ?? null);
}
export function metricSample(row: StatsRow, metric: Metric) {
  return metric.scouting
    ? scoutingMetricSample(row.metrics, metric.scouting)
    : null;
}
export function rankedRows(
  rows: readonly StatsRow[],
  metric: Metric,
  query: StatsQuery,
) {
  return rows
    .filter(
      (row) =>
        (!metric.scouting || (metricSample(row, metric) ?? 0) >= query.min) &&
        (!query.q ||
          String(row.teamNumber).includes(query.q.toLowerCase()) ||
          (row.nickname ?? "").toLowerCase().includes(query.q.toLowerCase())),
    )
    .sort((a, b) => {
      const av = metricValue(a, metric),
        bv = metricValue(b, metric);
      if (av == null && bv == null) return a.teamNumber - b.teamNumber;
      if (av == null) return 1;
      if (bv == null) return -1;
      const difference = query.dir === "asc" ? av - bv : bv - av;
      return difference || a.teamNumber - b.teamNumber;
    });
}
export function formatMetric(value: number | null, metric: Metric) {
  if (value == null) return "—";
  if (metric.key === "recent_issue_change")
    return `${value >= 0 ? "+" : ""}${Math.round(value * 100)} pp`;
  if (metric.unit === "percent") return `${Math.round(value * 100)}%`;
  if (metric.unit === "seconds") return `${value.toFixed(1)} s`;
  if (metric.unit === "count")
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return value.toFixed(1).replace(/\.0$/, "");
}

import type { AggregateSubmission } from "../core/module";
import {
  aggregateEvent,
  type AggregateOptions,
  type RebuiltAggregate,
} from "./aggregate";
import type { RebuiltMatchData } from "./match-schema";

export type StatsObservation = AggregateSubmission<RebuiltMatchData> & {
  matchOrder: number;
};

export const scoutingMetricKeys = [
  "teleop_median",
  "teleop_mean",
  "teleop_best",
  "total_median",
  "total_mean",
  "total_best",
  "auto_median",
  "auto_mean",
  "auto_best",
  "fuel_consistency",
  "scoring_seconds",
  "scoring_share",
  "defending_share",
  "other_share",
  "scoring_periods",
  "passing_seconds",
  "passing_share",
  "passing_periods",
  "passer_role",
  "auto_success",
  "auto_partial",
  "auto_failed",
  "auto_collection",
  "defense_seconds",
  "defense_frequency",
  "defense_strong",
  "defender_role",
  "full_match",
  "dns_frequency",
  "dnf_frequency",
  "minor_issues",
  "major_issues",
  "recent_issue_change",
] as const;
export type ScoutingMetricKey = (typeof scoutingMetricKeys)[number];

function notableIssue(data: RebuiltMatchData) {
  return (
    data.post_match.reliability === "major_issue" ||
    data.post_match.reliability === "DNF" ||
    data.post_match.reliability === "DNS" ||
    (data.issues?.length ?? 0) > 0
  );
}

/** Two adjacent three-match windows. Null means the trend is too thin to report. */
export function recentIssueChange(observations: readonly StatsObservation[]) {
  if (observations.length < 6) return null;
  const ordered = [...observations].sort(
    (a, b) => a.matchOrder - b.matchOrder || a.matchId.localeCompare(b.matchId),
  );
  const recent = ordered
    .slice(-3)
    .filter((row) => notableIssue(row.data)).length;
  const prior = ordered
    .slice(-6, -3)
    .filter((row) => notableIssue(row.data)).length;
  return (recent - prior) / 3;
}

export function build2026Stats(
  observations: readonly StatsObservation[],
  options: AggregateOptions = {},
) {
  const aggregated = aggregateEvent(observations, options);
  const byTeam = new Map<number, StatsObservation[]>();
  const starts = { left: 0, center: 0, right: 0, unknown: 0 };
  for (const row of observations) {
    const group = byTeam.get(row.teamNumber) ?? [];
    group.push(row);
    byTeam.set(row.teamNumber, group);
    if (row.data.post_match.reliability !== "DNS")
      starts[row.data.auto.start_position]++;
  }
  return {
    overall: aggregated.overall,
    teamMetrics: new Map(
      aggregated.teams.map((row) => [row.teamNumber, row.metrics]),
    ),
    issueTrends: new Map(
      [...byTeam].map(([team, rows]) => [team, recentIssueChange(rows)]),
    ),
    autoStarts: starts,
  };
}

export function scoutingMetric(
  metrics: RebuiltAggregate,
  key: ScoutingMetricKey,
  issueTrend: number | null = null,
): number | null {
  switch (key) {
    case "teleop_median":
      return metrics.fuel.teleop.median;
    case "teleop_mean":
      return metrics.fuel.teleop.mean;
    case "teleop_best":
      return metrics.fuel.teleop.best;
    case "total_median":
      return metrics.fuel.total.median;
    case "total_mean":
      return metrics.fuel.total.mean;
    case "total_best":
      return metrics.fuel.total.best;
    case "auto_median":
      return metrics.fuel.auto.median;
    case "auto_mean":
      return metrics.fuel.auto.mean;
    case "auto_best":
      return metrics.fuel.auto.best;
    case "fuel_consistency":
      return metrics.fuel.teleop.standardDeviation;
    case "scoring_seconds":
      return metrics.activity.scoring.seconds.mean;
    case "scoring_share":
      return metrics.activity.scoring.share.mean;
    case "defending_share":
      return metrics.activity.defending.share.mean;
    case "other_share":
      return metrics.activity.other_idle.share.mean;
    case "scoring_periods":
      return metrics.activity.scoring.periods.mean;
    case "passing_seconds":
      return metrics.activity.shuttling_passing.seconds.mean;
    case "passing_share":
      return metrics.activity.shuttling_passing.share.mean;
    case "passing_periods":
      return metrics.activity.shuttling_passing.periods.mean;
    case "passer_role":
      return metrics.roles.frequencies.passer_feeder;
    case "auto_success":
      return metrics.auto.execution.sampleSize >= 2
        ? metrics.auto.successfulRate
        : null;
    case "auto_partial":
      return metrics.auto.execution.sampleSize >= 2
        ? metrics.auto.partialRate
        : null;
    case "auto_failed":
      return metrics.auto.execution.sampleSize >= 2
        ? metrics.auto.failedRate
        : null;
    case "auto_collection":
      return metrics.auto.additionalFuel.frequency;
    case "defense_seconds":
      return metrics.activity.defending.seconds.mean;
    case "defense_frequency":
      return metrics.defense.frequency;
    case "defense_strong":
      return metrics.defense.effectiveness.frequencies.strong;
    case "defender_role":
      return metrics.roles.frequencies.defender;
    case "full_match":
      return metrics.reliability.fullMatchRate;
    case "dns_frequency":
      return metrics.reliability.frequencies.DNS;
    case "dnf_frequency":
      return metrics.reliability.frequencies.DNF;
    case "minor_issues":
      return metrics.reliability.counts.minor_issue;
    case "major_issues":
      return metrics.reliability.counts.major_issue;
    case "recent_issue_change":
      return issueTrend;
  }
}

export function scoutingMetricSample(
  metrics: RebuiltAggregate,
  key: ScoutingMetricKey,
) {
  if (
    [
      "teleop_median",
      "teleop_mean",
      "teleop_best",
      "fuel_consistency",
    ].includes(key)
  )
    return metrics.fuel.teleop.sampleSize;
  if (key.startsWith("total_")) return metrics.fuel.total.sampleSize;
  if (
    key.startsWith("auto_") &&
    ["auto_median", "auto_mean", "auto_best"].includes(key)
  )
    return metrics.fuel.auto.sampleSize;
  if (key.startsWith("scoring_"))
    return metrics.activity.scoring.seconds.sampleSize;
  if (key === "defending_share" || key === "other_share")
    return metrics.activity.scoring.share.sampleSize;
  if (key.startsWith("passing_"))
    return metrics.activity.shuttling_passing.seconds.sampleSize;
  if (key === "defense_seconds")
    return metrics.activity.defending.seconds.sampleSize;
  if (key === "defense_frequency" || key === "defense_strong")
    return key === "defense_strong"
      ? metrics.defense.effectiveness.sampleSize
      : metrics.defense.sampleSize;
  if (key === "auto_success" || key === "auto_partial" || key === "auto_failed")
    return metrics.auto.execution.sampleSize;
  if (key === "auto_collection") return metrics.auto.additionalFuel.sampleSize;
  if (key === "recent_issue_change") return metrics.sampleSize >= 6 ? 6 : 0;
  return metrics.sampleSize;
}

import { roleLabels, type TeamDirectoryRow } from "@/features/teams/model";
import type { RebuiltPitData } from "@/games/2026-rebuilt/pit-schema";
import type { MatchObservation } from "@/features/teams/model";
import {
  isPlayed,
  officialMatchLabel,
  orderedMatches,
} from "@/features/event-schedule/model";
import type { MatchStation } from "@/features/events/match-stations";

export type PrepMatch = {
  id: string;
  tba_match_key: string;
  comp_level: string;
  set_number: number;
  match_number: number;
  scheduled_time: string | null;
  predicted_time: string | null;
  actual_time: string | null;
  result_metadata: unknown;
};
export type PrepStation = MatchStation;
export const matchLabel = officialMatchLabel;
export const prepMatchStatus = (match: PrepMatch) =>
  isPlayed(match)
    ? "Completed"
    : match.actual_time
      ? "Started · result pending"
      : "Upcoming";
export function upcomingMatches(matches: readonly PrepMatch[]) {
  return orderedMatches(matches).filter(
    (match) => !match.actual_time && !isPlayed(match),
  );
}
/** The caller passes only the current event's cached matches. */
export function selectPrepMatch(
  matches: readonly PrepMatch[],
  stations: readonly PrepStation[],
  own: number | null,
  selectedKey?: string,
) {
  const explicit = selectedKey
    ? matches.find((match) => match.tba_match_key === selectedKey)
    : null;
  return {
    selected: explicit ?? defaultMatch(matches, stations, own),
    invalidSelection: !!selectedKey && !explicit,
  };
}
export function defaultMatch(
  matches: readonly PrepMatch[],
  stations: readonly PrepStation[],
  own: number | null,
) {
  if (own === null) return null;
  return (
    upcomingMatches(matches).find((match) =>
      stations.some((s) => s.match_id === match.id && s.team_number === own),
    ) ?? null
  );
}
export function prepSummary(row: TeamDirectoryRow) {
  const m = row.scouting;
  const recent = row.observations.slice(-3);
  const recentUncertain = recent.filter(
    (o) => o.data.post_match.fuel_estimate_confidence === "very_uncertain",
  ).length;
  const roles = Object.entries(m.roles.counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([role, count]) =>
        `${roleLabels[role as keyof typeof roleLabels]} ${count}`,
    );
  const recentRole = recent.at(-1)?.data.post_match.observed_role;
  const leadRole = m.roles.mostCommon ?? recentRole ?? null;
  const claims: string[] = [];
  if (
    m.fuel.total.sampleSize >= 3 &&
    m.fuel.total.median !== null &&
    m.fuel.total.median >= 30
  )
    claims.push("High-output scorer");
  if (
    m.roles.sampleSize >= 3 &&
    m.roles.counts.passer_feeder / m.roles.sampleSize >= 0.5
  )
    claims.push("Frequently observed as Passer-Feeder");
  if (
    m.defense.sampleSize >= 3 &&
    m.defense.frequency !== null &&
    m.defense.frequency >= 0.5
  )
    claims.push("Regularly plays defense");
  if (
    m.auto.execution.sampleSize >= 3 &&
    m.auto.successfulRate !== null &&
    m.auto.successfulRate >= 0.75
  )
    claims.push("Strong observed auto success");
  const recentIssue = recent.some((o) =>
    ["major_issue", "DNF", "DNS"].includes(o.data.post_match.reliability),
  );
  if (recentIssue) claims.push("Recent reliability concern");
  if (m.fuel.total.sampleSize < 3) claims.push("Limited FUEL sample");
  if (recentUncertain)
    claims.push(
      `${recentUncertain}/${recent.length} recent FUEL estimates very uncertain`,
    );
  return { leadRole, roles, claims, recentIssue, recentUncertain };
}
export function autoEvidence(
  pit: RebuiltPitData | null,
  observations: readonly MatchObservation[],
) {
  const routines = pit?.autonomous_routines ?? null;
  const sides = [
    ...new Set(
      (routines ?? []).map((r) => r.start_side).filter((s) => s !== "unknown"),
    ),
  ];
  const observed = observations.filter(
    (o) => o.data.auto.execution_result !== null,
  );
  const successes = observed.filter(
    (o) => o.data.auto.execution_result === "successful",
  ).length;
  return { routines, sides, successes, observed: observed.length };
}
export function sharedStartSides(
  items: readonly { teamNumber: number; sides: readonly string[] }[],
) {
  const hits: string[] = [];
  for (const side of ["left", "center", "right"])
    if (items.filter((item) => item.sides.includes(side)).length > 1)
      hits.push(
        `${side}: ${items
          .filter((item) => item.sides.includes(side))
          .map((item) => item.teamNumber)
          .join(" & ")}`,
      );
  return hits;
}

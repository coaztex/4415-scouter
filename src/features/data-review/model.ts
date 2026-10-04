import type { RebuiltMatchData } from "@/games/2026-rebuilt/match-schema";

/** One review policy location; the UI never embeds discrepancy magic numbers. */
export const FUEL_REVIEW_THRESHOLD = {
  percentage: 25,
  absoluteWhenOfficialIsZero: 20,
} as const;

export type ReviewContribution = {
  id: string;
  teamNumber: number;
  confidence: RebuiltMatchData["post_match"]["fuel_estimate_confidence"];
  reliability: RebuiltMatchData["post_match"]["reliability"];
  abnormal: boolean;
};

export type Difference = {
  absoluteDifference: number | null;
  percentageDifference: number | null;
};

export function discrepancyMagnitude(phases: readonly Difference[]): number {
  return Math.max(
    0,
    ...phases.map(
      (phase) => phase.percentageDifference ?? phase.absoluteDifference ?? 0,
    ),
  );
}

export function needsFuelReview(phases: readonly Difference[]) {
  return phases.some(
    (phase) =>
      (phase.percentageDifference !== null &&
        phase.percentageDifference >= FUEL_REVIEW_THRESHOLD.percentage) ||
      (phase.percentageDifference === null &&
        phase.absoluteDifference !== null &&
        phase.absoluteDifference >=
          FUEL_REVIEW_THRESHOLD.absoluteWhenOfficialIsZero),
  );
}

export function duplicateCandidateGroups<
  T extends {
    id: string;
    event_id: string;
    team_number: number;
    match_id?: string;
  },
>(rows: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.event_id}:${row.match_id ?? "pit"}:${row.team_number}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function isAbnormal(data: RebuiltMatchData) {
  return (
    data.post_match.reliability !== "normal" || (data.issues?.length ?? 0) > 0
  );
}

export function needsSchemaReview(
  storedVersion: number,
  currentVersion: number,
  parsesWithCurrentSchema: boolean,
) {
  return storedVersion !== currentVersion || !parsesWithCurrentSchema;
}

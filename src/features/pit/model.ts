import { z } from "zod";
import type { CachedNexusInspection } from "@/lib/nexus/inspection";
import {
  rebuiltPitSchema,
  type RebuiltPitData,
} from "@/games/2026-rebuilt/pit-schema";
export const pitStatuses = [
  "not_scouted",
  "in_progress",
  "completed",
  "needs_review",
] as const;
export type PitStatus = (typeof pitStatuses)[number];
export type TeamListRow = {
  teamNumber: number;
  nickname: string | null;
  status: PitStatus;
  claimedBy: string | null;
  pitLabel?: string | null;
  inspection?: CachedNexusInspection | null;
};
export type TeamFilter = "all" | "unscouted" | "completed";
const priority: Record<PitStatus, number> = {
  not_scouted: 0,
  needs_review: 1,
  in_progress: 2,
  completed: 3,
};
export function visibleTeams(
  rows: readonly TeamListRow[],
  term: string,
  filter: TeamFilter,
) {
  const search = term.trim().toLocaleLowerCase();
  return rows
    .filter((row) => {
      const fits =
        !search ||
        String(row.teamNumber).includes(search) ||
        row.nickname?.toLocaleLowerCase().includes(search);
      return (
        fits &&
        (filter === "all" ||
          (filter === "unscouted" && row.status === "not_scouted") ||
          (filter === "completed" && row.status === "completed"))
      );
    })
    .sort(
      (a, b) =>
        priority[a.status] - priority[b.status] || a.teamNumber - b.teamNumber,
    );
}
export function blankPit(): RebuiltPitData {
  return {
    drivetrain: "unknown",
    robot_weight_lbs: null,
    primary_scoring_mechanism: "unknown",
    fuel_capacity: { kind: "band", band: "unknown" },
    preferred_scoring_areas: null,
    shoot_while_moving: "unknown",
    traversal: null,
    climbing: { capability: "unknown" },
    autonomous_routines: null,
  };
}
export function newRoutine(
  id: string,
): NonNullable<RebuiltPitData["autonomous_routines"]>[number] {
  return {
    id,
    start_side: "unknown",
    scores_fuel: "unknown",
    collects_additional_fuel: "unknown",
    reliability_claim: "unknown",
  };
}
export function weightInputValue(data: RebuiltPitData, savedText?: string) {
  return (
    savedText ??
    (data.robot_weight_lbs === null ? "" : String(data.robot_weight_lbs))
  );
}
export function preparePit(
  data: RebuiltPitData,
  capacityMode: "approximate_count" | "band",
  numeric: string,
  weightNumeric = weightInputValue(data),
) {
  const weightText = weightNumeric.trim();
  const weight = weightText === "" ? null : Number(weightText);
  const capacity =
    capacityMode === "approximate_count"
      ? {
          kind: "approximate_count" as const,
          amount: z.coerce
            .number()
            .int()
            .min(0)
            .max(10000)
            .parse(numeric.trim() ? numeric : NaN),
        }
      : data.fuel_capacity.kind === "band"
        ? data.fuel_capacity
        : { kind: "band" as const, band: "unknown" as const };
  const cleaned = {
    ...data,
    robot_weight_lbs: weight,
    fuel_capacity: capacity,
    other_shooter_type:
      data.primary_scoring_mechanism === "other"
        ? data.other_shooter_type?.trim()
        : undefined,
    strategy_note: data.strategy_note?.trim() || undefined,
    autonomous_routines:
      data.autonomous_routines?.map((r) => ({
        ...r,
        name: r.name?.trim() || undefined,
        note: r.note?.trim() || undefined,
      })) ?? null,
  };
  return rebuiltPitSchema.parse(cleaned);
}

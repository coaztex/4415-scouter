import { z } from "zod";
import type { TeamDirectoryRow } from "./model";

export const roleLabels = {
  scorer: "Scorer",
  passer_feeder: "Passer-Feeder",
  defender: "Defender",
  mixed: "Mixed",
  inactive: "Inactive",
} as const;
export const pitStatusLabels = {
  not_scouted: "Not scouted",
  in_progress: "In progress",
  completed: "Completed",
  needs_review: "Needs review",
} as const;
export const sortKeys = [
  "team",
  "rank",
  "epa",
  "auto_epa",
  "teleop_epa",
  "opr",
  "tba_auto_fuel",
  "tba_teleop_fuel",
  "median_fuel",
  "mean_fuel",
  "scoring",
  "passing",
  "reliability",
  "defense",
  "auto_success",
  "pit",
] as const;
export type TeamSort = (typeof sortKeys)[number];
export type DirectoryListRow = Omit<TeamDirectoryRow, "observations">;
export const directoryQuerySchema = z.object({
  q: z.string().trim().max(80).catch(""),
  sort: z.enum(sortKeys).catch("team"),
  dir: z.enum(["asc", "desc"]).catch("asc"),
  pit: z.enum(["all", "unscouted", "completed"]).catch("all"),
  mechanism: z.enum(["all", "drum", "turret", "other", "unknown"]).catch("all"),
});
export function formatNumber(value: number | null | undefined, digits = 1) {
  return value == null ? "—" : value.toFixed(digits).replace(/\.0$/, "");
}
export function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}
export function defaultDirection(sort: TeamSort) {
  return sort === "team" || sort === "rank" || sort === "pit" ? "asc" : "desc";
}
export function sortValue(
  row: DirectoryListRow,
  sort: TeamSort,
): number | null {
  switch (sort) {
    case "team":
      return row.teamNumber;
    case "rank":
      return row.rank;
    case "epa":
      return row.statbotics?.total ?? null;
    case "auto_epa":
      return row.statbotics?.auto ?? null;
    case "teleop_epa":
      return row.statbotics?.teleop ?? null;
    case "opr":
      return row.tba?.opr ?? null;
    case "tba_auto_fuel":
      return row.tba?.components.auto_fuel ?? null;
    case "tba_teleop_fuel":
      return row.tba?.components.teleop_fuel ?? null;
    case "median_fuel":
      return row.scouting.fuel.total.median;
    case "mean_fuel":
      return row.scouting.fuel.total.mean;
    case "scoring":
      return row.scouting.activity.scoring.share.mean;
    case "passing":
      return row.scouting.activity.shuttling_passing.share.mean;
    case "reliability":
      return row.scouting.reliability.fullMatchRate;
    case "defense":
      return row.scouting.defense.frequency;
    case "auto_success":
      return row.scouting.auto.execution.sampleSize >= 2
        ? row.scouting.auto.successfulRate
        : null;
    case "pit":
      return (
        {
          not_scouted: 0,
          in_progress: 1,
          needs_review: 2,
          completed: 3,
        } as const
      )[row.pitStatus];
  }
}
export function directoryRows(
  rows: readonly DirectoryListRow[],
  input: unknown,
) {
  const query = directoryQuerySchema.parse(input),
    search = query.q.toLocaleLowerCase();
  const filtered = rows.filter(
    (row) =>
      (!search ||
        String(row.teamNumber).includes(search) ||
        row.nickname?.toLocaleLowerCase().includes(search)) &&
      (query.pit === "all" ||
        (query.pit === "completed"
          ? row.pitStatus === "completed"
          : row.pitStatus !== "completed")) &&
      (query.mechanism === "all" || row.pitMechanism === query.mechanism),
  );
  return {
    query,
    rows: [...filtered].sort((a, b) => {
      const av = sortValue(a, query.sort),
        bv = sortValue(b, query.sort);
      if (av == null && bv == null) return a.teamNumber - b.teamNumber;
      if (av == null) return 1;
      if (bv == null) return -1;
      const result = av - bv;
      return (
        (query.dir === "asc" ? result : -result) || a.teamNumber - b.teamNumber
      );
    }),
  };
}

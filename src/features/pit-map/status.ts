export type PitMapStatus =
  "not_scouted" | "in_progress" | "complete" | "unassigned";
export const pitMapStatuses = {
  not_scouted: {
    label: "Not scouted",
    symbol: "○",
    fill: "#fee2e2",
    stroke: "#b91c1c",
    text: "#7f1d1d",
  },
  in_progress: {
    label: "In progress",
    symbol: "◷",
    fill: "#fef08a",
    stroke: "#a16207",
    text: "#713f12",
  },
  complete: {
    label: "Complete",
    symbol: "✓",
    fill: "#bbf7d0",
    stroke: "#15803d",
    text: "#14532d",
  },
  unassigned: {
    label: "Unassigned",
    symbol: "—",
    fill: "#e5e7eb",
    stroke: "#6b7280",
    text: "#374151",
  },
} as const;

export function pitMapStatus(
  teamNumber: number | null,
  knownTeams: ReadonlySet<number>,
  completedTeams: ReadonlySet<number>,
  activeTeams: ReadonlySet<number>,
): PitMapStatus {
  if (teamNumber === null || !knownTeams.has(teamNumber)) return "unassigned";
  if (activeTeams.has(teamNumber)) return "in_progress";
  return completedTeams.has(teamNumber) ? "complete" : "not_scouted";
}

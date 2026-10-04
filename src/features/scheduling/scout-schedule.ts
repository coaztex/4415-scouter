export type ScoutAssignment = {
  id: string;
  sequence: number;
  assignment_type: "match" | "break";
  status: "assigned" | "in_progress" | "submitted" | "missed";
  team_number: number | null;
  match_id: string | null;
  break_match_id: string | null;
};
export type ScoutMatch = {
  id: string;
  tba_match_key: string;
  scheduled_time: string | null;
};
export type ScoutStation = {
  match_id: string;
  team_number: number;
  alliance: "red" | "blue";
  station: number;
};
export function organizeScoutSchedule(
  assignments: readonly ScoutAssignment[],
  matches: readonly ScoutMatch[],
  stations: readonly ScoutStation[],
) {
  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const rows = [...assignments]
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))
    .map((a) => {
      const match = matchMap.get(a.match_id ?? a.break_match_id ?? "") ?? null;
      const station =
        stations.find(
          (s) => s.match_id === a.match_id && s.team_number === a.team_number,
        ) ?? null;
      return {
        ...a,
        match,
        station,
        breakBlock: null as {
          first: string;
          last: string;
          length: number;
        } | null,
        displayStatus:
          a.assignment_type === "break" ? ("break" as const) : a.status,
        completed: a.status === "submitted" || a.status === "missed",
      };
    });
  let block: typeof rows = [];
  const finishBlock = () => {
    if (block.length >= 2) {
      const first = block[0].match?.tba_match_key ?? "?";
      const last = block.at(-1)?.match?.tba_match_key ?? "?";
      for (const row of block)
        row.breakBlock = { first, last, length: block.length };
    }
    block = [];
  };
  for (const row of rows) {
    if (row.assignment_type !== "break") {
      finishBlock();
      continue;
    }
    if (block.length && row.sequence !== block.at(-1)!.sequence + 1)
      finishBlock();
    block.push(row);
  }
  finishBlock();
  const pending = rows.filter((r) => !r.completed),
    completed = rows.filter((r) => r.completed);
  const next =
    pending.find((r) => r.status === "in_progress") ?? pending[0] ?? null;
  return {
    next,
    upcoming: pending.filter((r) => r.id !== next?.id),
    completed,
  };
}
export type ScoutScheduleRow = ReturnType<
  typeof organizeScoutSchedule
>["upcoming"][number];

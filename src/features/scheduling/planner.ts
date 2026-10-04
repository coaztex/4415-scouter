import {
  assignmentSlot,
  generateConfigSchema,
  retainedByGenerator,
  type GenerateConfig,
  type PlanRow,
  type PreviewRow,
  type ScheduleAssignment,
  type SchedulePreview,
  type ScheduleSnapshot,
} from "./model";

type Load = {
  scoutId: string;
  assignments: number;
  assignmentsInRange: number;
  run: number;
  longestRun: number;
  restMatches: number;
  breakRun: number;
};
type BlockItem = { matchId: string; sequence: number };

/** A break block is consecutive in imported match order, not clock time. */
function blocks(items: BlockItem[]) {
  const sorted = [...items].sort((a, b) => a.sequence - b.sequence);
  const groups: { first: string; last: string; length: number }[] = [];
  let previousSequence = -2;
  for (const item of sorted) {
    const group = groups.at(-1);
    if (group && item.sequence === previousSequence + 1) {
      group.last = item.matchId;
      group.length++;
    } else groups.push({ first: item.matchId, last: item.matchId, length: 1 });
    previousSequence = item.sequence;
  }
  return groups;
}

/**
 * Preserve protected rows (or all saved rows in fill-gaps mode), cover every
 * possible canonical robot slot, prefer under-observed teams when short,
 * balance workload, then rotate two-match breaks. Rest never takes a scout
 * away from a robot that would otherwise be covered.
 */
export function generateSchedule(
  snapshot: ScheduleSnapshot,
  input: GenerateConfig,
): SchedulePreview {
  const config = generateConfigSchema.parse(input);
  const { data } = snapshot;
  if (data.event.status !== "active")
    throw new Error("Only active events can be scheduled.");
  const ordered = [...data.matches].sort(
    (a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id),
  );
  const matchById = new Map(ordered.map((match) => [match.id, match]));
  const matchBySequence = new Map(
    ordered.map((match) => [match.sequence, match]),
  );
  const targets = new Set(config.matchIds);
  const scouts = [...config.scoutIds].sort();
  const activeScouts = new Set(data.scouts.map((scout) => scout.id));
  if (
    config.matchIds.some((id) => !matchById.has(id)) ||
    scouts.some((id) => !activeScouts.has(id))
  )
    throw new Error("Choose imported matches and active team members.");

  const oldByMatch = new Map<string, ScheduleAssignment[]>();
  for (const assignment of data.assignments) {
    // Legacy breaks had only a sequence, so account for their occupied scout.
    const slot =
      assignmentSlot(assignment) ??
      (assignment.assignment_type === "break"
        ? matchBySequence.get(assignment.sequence)?.id
        : undefined);
    if (!slot) continue;
    const rows = oldByMatch.get(slot) ?? [];
    rows.push(assignment);
    oldByMatch.set(slot, rows);
  }
  const keep = (row: ScheduleAssignment) =>
    config.replaceMode === "fill_gaps" || retainedByGenerator(row);
  const observed = new Map(
    data.observations.map((row) => [row.team_number, row.count]),
  );
  const teamCounts = new Map(observed);
  const loads = new Map<string, Load>(
    scouts.map((scoutId) => [
      scoutId,
      {
        scoutId,
        assignments: 0,
        assignmentsInRange: 0,
        run: 0,
        longestRun: 0,
        restMatches: 0,
        breakRun: 0,
      },
    ]),
  );
  for (const match of ordered)
    for (const old of oldByMatch.get(match.id) ?? []) {
      if (old.assignment_type !== "match" || old.status === "missed") continue;
      if (!targets.has(match.id) || keep(old)) {
        const load = loads.get(old.scout_user_id);
        if (load) {
          load.assignments++;
          if (targets.has(match.id)) load.assignmentsInRange++;
        }
        if (!old.has_final && old.team_number !== null)
          teamCounts.set(
            old.team_number,
            (teamCounts.get(old.team_number) ?? 0) + 1,
          );
      }
    }

  const chosenByMatch = new Map<string, PreviewRow[]>();
  const idleByScout = new Map<string, (BlockItem & { fixed: boolean })[]>();
  const warnings: string[] = [];
  for (const match of ordered) {
    const old = oldByMatch.get(match.id) ?? [];
    if (!targets.has(match.id)) {
      const working = new Set(
        old
          .filter((a) => a.assignment_type === "match" && a.status !== "missed")
          .map((a) => a.scout_user_id),
      );
      for (const id of scouts) {
        const load = loads.get(id)!;
        load.run = working.has(id) ? load.run + 1 : 0;
        load.longestRun = Math.max(load.longestRun, load.run);
        load.breakRun = 0;
      }
      continue;
    }
    const fixed = old.filter(keep);
    const chosen: PreviewRow[] = fixed.map((a) => ({
      slot_match_id: match.id,
      team_number: a.team_number,
      scout_user_id: a.scout_user_id,
      assignment_type: a.assignment_type,
      status: a.status,
      retained: true,
    }));
    const occupiedScouts = new Set(fixed.map((row) => row.scout_user_id));
    const occupiedTeams = new Set(
      fixed
        .filter((row) => row.assignment_type === "match")
        .map((row) => row.team_number),
    );
    const slots = match.stations.filter(
      (slot) => !occupiedTeams.has(slot.team_number),
    );
    // Existing final observations plus retained/planned assignments drive diversity.
    slots.sort(
      (a, b) =>
        (teamCounts.get(a.team_number) ?? 0) -
          (teamCounts.get(b.team_number) ?? 0) || a.team_number - b.team_number,
    );
    const available = scouts.filter((id) => !occupiedScouts.has(id));
    const restCount = Math.max(0, available.length - slots.length);
    available.sort((a, b) => {
      const x = loads.get(a)!,
        y = loads.get(b)!;
      return (
        Number(y.breakRun === 1) - Number(x.breakRun === 1) ||
        Number(y.run >= config.maxConsecutive) -
          Number(x.run >= config.maxConsecutive) ||
        y.run - x.run ||
        y.assignments - x.assignments ||
        x.restMatches - y.restMatches ||
        a.localeCompare(b)
      );
    });
    const resting = new Set(available.slice(0, restCount));
    const workers = available.filter((id) => !resting.has(id));
    workers.sort((a, b) => {
      const x = loads.get(a)!,
        y = loads.get(b)!;
      return (
        x.assignments - y.assignments || x.run - y.run || a.localeCompare(b)
      );
    });
    for (
      let index = 0;
      index < Math.min(workers.length, slots.length);
      index++
    ) {
      const id = workers[index],
        team = slots[index].team_number;
      chosen.push({
        slot_match_id: match.id,
        team_number: team,
        scout_user_id: id,
        assignment_type: "match",
        status: "assigned",
        retained: false,
      });
      const load = loads.get(id)!;
      load.assignments++;
      load.assignmentsInRange++;
      teamCounts.set(team, (teamCounts.get(team) ?? 0) + 1);
    }
    const working = new Set(
      chosen
        .filter(
          (row) => row.assignment_type === "match" && row.status !== "missed",
        )
        .map((row) => row.scout_user_id),
    );
    const fixedBreaks = new Set(
      chosen
        .filter((row) => row.assignment_type === "break")
        .map((row) => row.scout_user_id),
    );
    for (const id of scouts) {
      const load = loads.get(id)!;
      load.run = working.has(id) ? load.run + 1 : 0;
      load.longestRun = Math.max(load.longestRun, load.run);
      const isIdle = resting.has(id) || fixedBreaks.has(id);
      load.breakRun = isIdle ? load.breakRun + 1 : 0;
      if (isIdle) {
        load.restMatches++;
        const items = idleByScout.get(id) ?? [];
        items.push({
          matchId: match.id,
          sequence: match.sequence,
          fixed: fixedBreaks.has(id),
        });
        idleByScout.set(id, items);
      }
    }
    chosenByMatch.set(match.id, chosen);
  }

  // A newly idle match is displayed as BREAK only in a real 2+ match block.
  for (const [id, items] of idleByScout)
    for (const group of blocks(items)) {
      if (group.length < 2) continue;
      const first = items.findIndex((item) => item.matchId === group.first);
      for (const item of items.slice(first, first + group.length)) {
        if (item.fixed) continue;
        chosenByMatch.get(item.matchId)!.push({
          slot_match_id: item.matchId,
          team_number: null,
          scout_user_id: id,
          assignment_type: "break",
          status: "assigned",
          retained: false,
        });
      }
    }

  const rows: PreviewRow[] = [],
    writes: PlanRow[] = [],
    remove_ids: string[] = [];
  const uncovered: SchedulePreview["summary"]["uncovered"] = [];
  const distribution = new Map<number, number>();
  const teamsInRange = new Set<number>(),
    teamsCovered = new Set<number>();
  for (const match of ordered.filter((row) => targets.has(row.id))) {
    const chosen = chosenByMatch.get(match.id) ?? [];
    rows.push(...chosen);
    const old = (oldByMatch.get(match.id) ?? []).filter((row) => !keep(row));
    const usedOld = new Set<string>();
    for (const row of chosen.filter((item) => !item.retained)) {
      const reuse = old.find(
        (candidate) =>
          !usedOld.has(candidate.id) &&
          candidate.assignment_type === row.assignment_type &&
          (row.assignment_type === "match"
            ? candidate.team_number === row.team_number
            : candidate.scout_user_id === row.scout_user_id),
      );
      if (reuse) usedOld.add(reuse.id);
      if (
        !reuse ||
        reuse.scout_user_id !== row.scout_user_id ||
        reuse.sequence !== match.sequence ||
        reuse.status !== "assigned" ||
        (row.assignment_type === "break" && reuse.break_match_id !== match.id)
      )
        writes.push({
          id: reuse?.id ?? null,
          slot_match_id: match.id,
          team_number: row.team_number,
          scout_user_id: row.scout_user_id,
          assignment_type: row.assignment_type,
          status: "assigned",
        });
    }
    remove_ids.push(
      ...old
        .filter((candidate) => !usedOld.has(candidate.id))
        .map((candidate) => candidate.id),
    );
    for (const slot of match.stations) {
      teamsInRange.add(slot.team_number);
      const covered = chosen.some(
        (row) =>
          row.assignment_type === "match" &&
          row.team_number === slot.team_number &&
          row.status !== "missed",
      );
      if (covered) {
        teamsCovered.add(slot.team_number);
        distribution.set(
          slot.team_number,
          (distribution.get(slot.team_number) ?? 0) + 1,
        );
      } else
        uncovered.push({
          matchId: match.id,
          matchKey: match.key,
          teamNumber: slot.team_number,
        });
    }
  }
  const selectedMatches = ordered.filter((match) => targets.has(match.id));
  const desiredSlots = selectedMatches.reduce(
    (sum, match) => sum + match.stations.length,
    0,
  );
  const coveredSlots = desiredSlots - uncovered.length;
  if (uncovered.length)
    warnings.push(
      `${uncovered.length} robot-match slots remain uncovered. Review gaps before publishing.`,
    );
  if (
    scouts.length <
    Math.max(0, ...selectedMatches.map((match) => match.stations.length))
  )
    warnings.push(
      "Selected scout count is below the largest match roster; complete robot coverage is mathematically impossible.",
    );
  const workloads = scouts.map((id) => {
    const load = loads.get(id)!;
    if (load.longestRun > config.maxConsecutive)
      warnings.push(
        `${data.scouts.find((person) => person.id === id)?.display_name || id}: longest run ${load.longestRun} exceeds the ${config.maxConsecutive}-match target.`,
      );
    const assignedBreaks = rows
      .filter(
        (row) => row.scout_user_id === id && row.assignment_type === "break",
      )
      .map((row) => ({
        matchId: row.slot_match_id,
        sequence: matchById.get(row.slot_match_id)!.sequence,
      }));
    return {
      scoutId: id,
      assignments: load.assignments,
      assignmentsInRange: load.assignmentsInRange,
      breakBlocks: blocks(assignedBreaks),
      longestRun: load.longestRun,
    };
  });
  if (writes.length + remove_ids.length > 3000)
    throw new Error("Schedule fewer matches at once (maximum 3,000 changes).");
  const loadsInRange = workloads.map((row) => row.assignmentsInRange);
  return {
    rows,
    warnings,
    workloads,
    operations: { remove_ids, rows: writes },
    summary: {
      scouts: scouts.length,
      matches: targets.size,
      desiredSlots,
      coveredSlots,
      coveragePercent: desiredSlots
        ? Math.round((coveredSlots / desiredSlots) * 1000) / 10
        : 0,
      uncovered,
      teamsCovered: teamsCovered.size,
      teamsInRange: teamsInRange.size,
      teamDistribution: [...teamsInRange]
        .sort((a, b) => a - b)
        .map((teamNumber) => ({
          teamNumber,
          planned: distribution.get(teamNumber) ?? 0,
          observed: observed.get(teamNumber) ?? 0,
        })),
      averageAssignments:
        loadsInRange.reduce((a, b) => a + b, 0) / loadsInRange.length,
      minimumAssignments: Math.min(...loadsInRange),
      maximumAssignments: Math.max(...loadsInRange),
    },
  };
}

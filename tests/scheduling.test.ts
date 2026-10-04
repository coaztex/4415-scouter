import test from "node:test";
import assert from "node:assert/strict";
import { generateSchedule } from "../src/features/scheduling/planner";
import {
  previewSchedule,
  publishAcceptedPreview,
} from "../src/features/scheduling/publication";
import { planManualEdit } from "../src/features/scheduling/manual-plan";
import { organizeScoutSchedule } from "../src/features/scheduling/scout-schedule";
import {
  scheduleSnapshotSchema,
  type ScheduleSnapshot,
  type ScheduleAssignment,
  type PlanRow,
} from "../src/features/scheduling/model";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(scoutCount = 8, matchCount = 20): ScheduleSnapshot {
  return scheduleSnapshotSchema.parse({
    version: "test",
    data: {
      event: {
        id: id(999),
        tba_key: "2026test",
        name: "Fixture only",
        status: "active",
      },
      scouts: Array.from({ length: scoutCount }, (_, i) => ({
        id: id(i + 1),
        display_name: `Scout ${i + 1}`,
        username: `scout${i + 1}`,
        role: "scout",
      })),
      matches: Array.from({ length: matchCount }, (_, i) => ({
        id: id(100 + i),
        key: `2026test_qm${i + 1}`,
        comp_level: "qm",
        match_number: i + 1,
        set_number: 1,
        sequence: i + 1,
        scheduled_time: null,
        actual_time: null,
        stations: Array.from({ length: 6 }, (_, j) => ({
          team_number: j + 1,
          alliance: j < 3 ? "red" : "blue",
          station: (j % 3) + 1,
        })),
      })),
      assignments: [],
    },
  });
}
const config = (s: ScheduleSnapshot) => ({
  matchIds: s.data.matches.map((m) => m.id),
  scoutIds: s.data.scouts.map((s) => s.id),
  maxConsecutive: 3,
  replaceMode: "replace_editable" as const,
});
function assignment(
  n: number,
  scout: number,
  team: number | null,
  match = 100,
  status: ScheduleAssignment["status"] = "assigned",
): ScheduleAssignment {
  return {
    id: id(1000 + n),
    match_id: team === null ? null : id(match),
    break_match_id: team === null ? id(match) : null,
    team_number: team,
    scout_user_id: id(scout),
    assignment_type: team === null ? "break" : "match",
    status,
    sequence: match - 99,
    has_submission: false,
    has_final: false,
    scout_name: `Scout ${scout}`,
  };
}
const desired = (
  a: ScheduleAssignment,
  changes: Partial<PlanRow> = {},
): PlanRow => ({
  id: a.id,
  slot_match_id: a.match_id ?? a.break_match_id!,
  team_number: a.team_number,
  scout_user_id: a.scout_user_id,
  assignment_type: a.assignment_type,
  status: "assigned",
  ...changes,
});

test("schedule is deterministic, covers six robots, balances workload, and rotates two-match breaks", () => {
  const s = fixture(),
    plan = generateSchedule(s, config(s));
  assert.deepEqual(
    plan,
    generateSchedule(s, {
      ...config(s),
      scoutIds: [...config(s).scoutIds].reverse(),
    }),
  );
  for (const m of s.data.matches) {
    const rows = plan.rows.filter((r) => r.slot_match_id === m.id);
    assert.ok(rows.length >= 6 && rows.length <= 8);
    assert.equal(new Set(rows.map((r) => r.scout_user_id)).size, rows.length);
    assert.equal(
      new Set(
        rows.filter((r) => r.team_number !== null).map((r) => r.team_number),
      ).size,
      6,
    );
    assert.ok(rows.filter((r) => r.assignment_type === "break").length <= 2);
  }
  const loads = plan.workloads.map((w) => w.assignments);
  assert.ok(
    Math.max(...loads) - Math.min(...loads) <= 2,
    JSON.stringify(loads),
  );
  assert.ok(plan.workloads.every((w) => w.longestRun <= 6));
  assert.ok(plan.workloads.every((w) => w.breakBlocks.length > 0));
  assert.ok(
    plan.workloads.every((w) => w.breakBlocks.every((b) => b.length >= 2)),
  );
  assert.equal(plan.summary.coveredSlots, 120);
});

test("short staffing keeps coverage and reports every uncovered robot slot", () => {
  const s = fixture(5, 8);
  const coverage = generateSchedule(s, config(s));
  assert.equal(
    coverage.rows.filter((r) => r.assignment_type === "match").length,
    40,
  );
  assert.equal(coverage.summary.desiredSlots, 48);
  assert.equal(coverage.summary.uncovered.length, 8);
  assert.ok(
    coverage.warnings.some((w) => w.includes("mathematically impossible")),
  );
  assert.equal(
    coverage.rows.filter((r) => r.assignment_type === "break").length,
    0,
  );
});

test("short staffing favors teams with fewer final and planned observations", () => {
  const s = fixture(5, 8);
  s.data.observations = [{ team_number: 1, count: 7 }];
  const plan = generateSchedule(s, config(s));
  assert.ok(plan.summary.uncovered.some((gap) => gap.teamNumber === 1));
  assert.ok(
    plan.summary.teamDistribution.find((row) => row.teamNumber === 6)!.planned >
      0,
  );
  assert.equal(plan.summary.coveredSlots, 40);
});

test("two-match breaks stagger without leaving a robot uncovered", () => {
  const s = fixture(7, 12);
  const plan = generateSchedule(s, config(s));
  assert.equal(plan.summary.uncovered.length, 0);
  assert.ok(plan.workloads.some((row) => row.breakBlocks.length > 0));
  assert.ok(
    plan.workloads.every((row) =>
      row.breakBlocks.every((block) => block.length >= 2),
    ),
  );
  for (const match of s.data.matches) {
    const rows = plan.rows.filter((row) => row.slot_match_id === match.id);
    assert.equal(
      rows.filter((row) => row.assignment_type === "match").length,
      6,
    );
    assert.equal(
      new Set(rows.map((row) => row.scout_user_id)).size,
      rows.length,
    );
  }
});

test("fill-gaps mode preserves saved rows; broader reset can reclaim editable breaks", () => {
  const s = fixture(6, 1);
  s.data.assignments = [assignment(1, 1, 1), assignment(2, 2, null)];
  const fill = generateSchedule(s, { ...config(s), replaceMode: "fill_gaps" });
  assert.equal(fill.summary.uncovered.length, 1);
  assert.ok(!fill.operations.remove_ids.includes(s.data.assignments[1].id));
  const reset = generateSchedule(s, config(s));
  assert.equal(reset.summary.uncovered.length, 0);
  assert.ok(reset.operations.remove_ids.includes(s.data.assignments[1].id));
});

test("legacy unanchored breaks occupy their sequence and are anchored when reused", () => {
  const s = fixture(7, 2);
  s.data.assignments = [{ ...assignment(1, 1, null), break_match_id: null }];
  const plan = generateSchedule(s, config(s));
  assert.ok(
    plan.operations.rows.some(
      (row) =>
        row.id === s.data.assignments[0].id && row.slot_match_id === id(100),
    ),
  );
  assert.ok(
    plan.rows
      .filter((row) => row.slot_match_id === id(100))
      .every(
        (row) =>
          !(row.scout_user_id === id(1) && row.assignment_type === "match"),
      ),
  );
});

test("preview is read-only and accepted publication saves exactly the reviewed plan", async () => {
  const s = fixture(7, 4);
  s.observationVersion = "observations-a";
  const selection = config(s);
  let writes = 0;
  const preview = previewSchedule(s, selection);
  assert.equal(writes, 0);
  const previous = {
    preview,
    config: selection,
    version: s.version,
    observationVersion: s.observationVersion,
  };
  const published = await publishAcceptedPreview(
    s,
    selection,
    previous,
    { version: s.version, observationVersion: s.observationVersion },
    async (operations) => {
      writes++;
      assert.deepEqual(operations, preview.operations);
    },
  );
  assert.deepEqual(published, preview);
  assert.equal(writes, 1);
  await assert.rejects(
    () =>
      publishAcceptedPreview(
        { ...s, observationVersion: "observations-b" },
        selection,
        previous,
        { version: s.version, observationVersion: s.observationVersion },
        async () => {
          writes++;
        },
      ),
    /stale/i,
  );
  assert.equal(writes, 1);
});

test("completed scouting remains attached during regeneration", () => {
  const s = fixture(6, 2);
  s.data.assignments = [
    {
      ...assignment(1, 1, 1),
      status: "submitted",
      has_submission: true,
      has_final: true,
    },
  ];
  const plan = generateSchedule(s, config(s));
  assert.ok(plan.rows.some((row) => row.team_number === 1 && row.retained));
  assert.ok(!plan.operations.remove_ids.includes(s.data.assignments[0].id));
  assert.ok(
    !plan.operations.rows.some((row) => row.id === s.data.assignments[0].id),
  );
});

test("submitted, started, missed, and draft-linked identities survive generation even outside selected scouts", () => {
  const s = fixture();
  s.data.assignments = [
    assignment(1, 1, 1, 100, "submitted"),
    assignment(2, 2, 2, 100, "in_progress"),
    assignment(3, 3, 3, 100, "missed"),
    { ...assignment(4, 4, 4), has_submission: true },
    assignment(5, 5, null, 100, "submitted"),
  ];
  const plan = generateSchedule(s, {
    ...config(s),
    scoutIds: [id(6), id(7), id(8)],
  });
  for (const a of s.data.assignments) {
    assert.ok(!plan.operations.remove_ids.includes(a.id));
    assert.ok(!plan.operations.rows.some((r) => r.id === a.id));
    assert.ok(
      plan.rows.some(
        (r) =>
          r.retained &&
          r.scout_user_id === a.scout_user_id &&
          r.team_number === a.team_number &&
          r.status === a.status,
      ),
    );
  }
  assert.equal(
    plan.rows.filter(
      (r) => r.slot_match_id === id(100) && r.assignment_type === "match",
    ).length,
    6,
  );
});

test("repeating the same plan has no writes and range planning leaves other matches alone", () => {
  const s = fixture();
  const plan = generateSchedule(s, config(s));
  s.data.assignments = plan.rows.map((r, i) => ({
    ...assignment(
      i,
      Number(r.scout_user_id.slice(-12)),
      r.team_number,
      Number(r.slot_match_id.slice(-12)),
    ),
    status: r.status,
  }));
  assert.deepEqual(generateSchedule(s, config(s)).operations, {
    rows: [],
    remove_ids: [],
  });
  const range = generateSchedule(s, {
    ...config(s),
    matchIds: [id(105)],
    scoutIds: [id(1), id(2)],
  });
  assert.ok(range.operations.rows.every((r) => r.slot_match_id === id(105)));
  assert.ok(
    range.operations.remove_ids.every(
      (id) => s.data.assignments.find((a) => a.id === id)?.sequence === 6,
    ),
  );
});

test("invalid or duplicate choices are rejected", () => {
  const s = fixture();
  assert.throws(() =>
    generateSchedule(s, { ...config(s), scoutIds: [id(1), id(1)] }),
  );
  assert.throws(() =>
    generateSchedule(s, { ...config(s), scoutIds: [id(98)] }),
  );
  assert.throws(() =>
    generateSchedule(s, { ...config(s), matchIds: [id(98)] }),
  );
  s.data.event.status = "archived";
  assert.throws(() => generateSchedule(s, config(s)));
});

test("manual scout and team changes make atomic swaps, including work/break swaps", () => {
  const s = fixture();
  s.data.assignments = [
    assignment(1, 1, 1),
    assignment(2, 2, 2),
    assignment(3, 3, null),
  ];
  const swap = planManualEdit(
    s,
    desired(s.data.assignments[0], { scout_user_id: id(2), team_number: 2 }),
  ).rows;
  assert.equal(swap.length, 2);
  assert.deepEqual(
    swap.map((r) => [r.scout_user_id, r.team_number]),
    [
      [id(2), 2],
      [id(1), 1],
    ],
  );
  const three = planManualEdit(
    s,
    desired(s.data.assignments[0], { scout_user_id: id(3), team_number: 2 }),
  ).rows;
  assert.equal(three.length, 3);
  assert.equal(new Set(three.map((r) => r.scout_user_id)).size, 3);
  assert.equal(new Set(three.map((r) => r.team_number)).size, 3);
  const breakSwap = planManualEdit(
    s,
    desired(s.data.assignments[2], {
      assignment_type: "match",
      team_number: 1,
    }),
  ).rows;
  assert.deepEqual(
    breakSwap.map((r) => [r.scout_user_id, r.team_number, r.assignment_type]),
    [
      [id(3), 1, "match"],
      [id(1), null, "break"],
    ],
  );
});

test("manual edits cannot swap or detach started/submitted/linked assignments", () => {
  for (const protectedRow of [
    assignment(2, 2, 2, 100, "submitted"),
    assignment(2, 2, 2, 100, "in_progress"),
    { ...assignment(2, 2, 2), has_submission: true },
  ]) {
    const s = fixture();
    s.data.assignments = [assignment(1, 1, 1), protectedRow];
    assert.throws(() =>
      planManualEdit(
        s,
        desired(s.data.assignments[0], { scout_user_id: id(2) }),
      ),
    );
    assert.throws(() =>
      planManualEdit(s, desired(s.data.assignments[0], { team_number: 2 })),
    );
    assert.throws(() => planManualEdit(s, desired(protectedRow)));
  }
});

test("scout schedule separates completed work, shows breaks, and prioritizes work in progress", () => {
  const s = fixture();
  const rows = [
    assignment(4, 1, 1, 104),
    assignment(3, 1, 1, 103, "in_progress"),
    assignment(2, 1, null, 102),
    assignment(1, 1, 1, 101, "submitted"),
    assignment(5, 1, 1, 105, "missed"),
  ];
  const matches = s.data.matches.map((m) => ({
    id: m.id,
    tba_match_key: m.key,
    scheduled_time: m.scheduled_time,
  }));
  const stations = s.data.matches.flatMap((m) =>
    m.stations.map((st) => ({ ...st, match_id: m.id })),
  );
  const result = organizeScoutSchedule(rows, matches, stations);
  assert.equal(result.next?.status, "in_progress");
  assert.equal(result.next?.station?.alliance, "red");
  assert.deepEqual(
    result.upcoming.map((r) => r.displayStatus),
    ["break", "assigned"],
  );
  assert.deepEqual(
    result.completed.map((r) => r.status),
    ["submitted", "missed"],
  );
  const breakNext = organizeScoutSchedule(
    [assignment(2, 1, null, 102), assignment(4, 1, 1, 104)],
    matches,
    stations,
  );
  assert.equal(breakNext.next?.displayStatus, "break");
  const block = organizeScoutSchedule(
    [assignment(2, 1, null, 102), assignment(3, 1, null, 103)],
    matches,
    stations,
  );
  assert.deepEqual(block.next?.breakBlock, {
    first: "2026test_qm3",
    last: "2026test_qm4",
    length: 2,
  });
  assert.equal(organizeScoutSchedule([], [], []).next, null);
});

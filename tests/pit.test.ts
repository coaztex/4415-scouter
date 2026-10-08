import test from "node:test";
import assert from "node:assert/strict";
import { rebuiltPitSchema } from "../src/games/2026-rebuilt/pit-schema";
import { pitDeviceDraftSchema } from "../src/features/pit/device-draft";
import { pitData } from "./fixtures/rebuilt";
import {
  blankPit,
  newRoutine,
  preparePit,
  weightInputValue,
  visibleTeams,
  type TeamListRow,
} from "../src/features/pit/model";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("revised pit schema accepts numeric, qualitative, and unknown capacity", () => {
  const blank = blankPit();
  assert.equal(rebuiltPitSchema.parse(blank).fuel_capacity.kind, "band");
  assert.deepEqual(preparePit(blank, "approximate_count", "0").fuel_capacity, {
    kind: "approximate_count",
    amount: 0,
  });
  assert.deepEqual(preparePit(blank, "approximate_count", "42").fuel_capacity, {
    kind: "approximate_count",
    amount: 42,
  });
  assert.deepEqual(
    preparePit(
      { ...blank, fuel_capacity: { kind: "band", band: "medium" } },
      "band",
      "",
    ).fuel_capacity,
    { kind: "band", band: "medium" },
  );
  for (const count of ["", "1.5", "-1", "10001", "unknown"]) {
    assert.throws(() => preparePit(blank, "approximate_count", count));
  }
});

test("robot-only weight accepts integers and decimals, and blank persists as null", () => {
  const blank = blankPit();
  assert.equal(blank.robot_weight_lbs, null);
  assert.equal(preparePit(blank, "band", "", "112").robot_weight_lbs, 112);
  assert.equal(preparePit(blank, "band", "", "112.4").robot_weight_lbs, 112.4);
  assert.equal(preparePit(blank, "band", "", " ").robot_weight_lbs, null);
  assert.equal(
    preparePit({ ...blank, robot_weight_lbs: 112.4 }, "band", "", "")
      .robot_weight_lbs,
    null,
  );
  for (const value of ["0", "-1", "not a number", "Infinity"]) {
    assert.throws(() => preparePit(blank, "band", "", value));
  }
  assert.equal(
    rebuiltPitSchema.safeParse({ ...blank, robot_weight_lbs: -1 }).success,
    false,
  );
  assert.equal(
    rebuiltPitSchema.safeParse({ ...blank, robot_weight_lbs: "112.4" }).success,
    false,
  );
});

test("version-2 legacy pit reports and device drafts restore without weight", () => {
  const legacy = { ...pitData() } as Partial<ReturnType<typeof pitData>>;
  delete legacy.robot_weight_lbs;
  assert.equal(rebuiltPitSchema.parse(legacy).robot_weight_lbs, null);
  const oldDraft = pitDeviceDraftSchema.parse({
    data: legacy,
    clientId: id(92),
    revision: 2,
    capacityMode: "band",
    numeric: "",
    claimed: true,
  });
  assert.equal(oldDraft.data.robot_weight_lbs, null);
  assert.equal(oldDraft.weightNumeric, undefined);
  assert.equal(weightInputValue(oldDraft.data, oldDraft.weightNumeric), "");
  const edited = pitDeviceDraftSchema.parse({
    ...oldDraft,
    data: { ...oldDraft.data, robot_weight_lbs: 112.4 },
    weightNumeric: "112.4",
  });
  assert.equal(edited.weightNumeric, "112.4");
  assert.equal(weightInputValue(edited.data, edited.weightNumeric), "112.4");
  assert.equal(
    preparePit(
      edited.data,
      edited.capacityMode,
      edited.numeric,
      edited.weightNumeric,
    ).robot_weight_lbs,
    112.4,
  );
});

test("older pit records and device drafts resolve missing mechanism to Unknown", () => {
  const legacy = JSON.parse(JSON.stringify(pitData()));
  delete legacy.primary_scoring_mechanism;
  assert.equal(
    rebuiltPitSchema.parse(legacy).primary_scoring_mechanism,
    "unknown",
  );
  const draft = pitDeviceDraftSchema.parse({
    data: legacy,
    clientId: id(90),
    revision: 0,
    capacityMode: "band",
    numeric: "",
    claimed: true,
  });
  assert.equal(draft.data.primary_scoring_mechanism, "unknown");
});

test("Other requires a shooter description for final submission but permits an unfinished device draft", () => {
  const other = { ...blankPit(), primary_scoring_mechanism: "other" as const };
  assert.equal(rebuiltPitSchema.safeParse(other).success, false);
  assert.equal(
    pitDeviceDraftSchema.safeParse({
      data: other,
      clientId: id(91),
      revision: 0,
      capacityMode: "band",
      numeric: "",
      claimed: true,
    }).success,
    true,
  );
  assert.equal(
    preparePit({ ...other, other_shooter_type: "  flywheel  " }, "band", "")
      .other_shooter_type,
    "flywheel",
  );
  assert.equal(
    rebuiltPitSchema.safeParse({
      ...blankPit(),
      primary_scoring_mechanism: "drum",
      other_shooter_type: "flywheel",
    }).success,
    false,
  );
  assert.equal(
    rebuiltPitSchema.safeParse({
      ...blankPit(),
      primary_scoring_mechanism: "launcher",
    }).success,
    false,
  );
});

test("multiple autonomous claims and optional auto climb validate", () => {
  const first = {
    ...newRoutine(id(1)),
    start_side: "left" as const,
    scores_fuel: "yes" as const,
  };
  const second = {
    ...newRoutine(id(2)),
    start_side: "right" as const,
    collects_additional_fuel: "yes" as const,
    climb: { result: "achieved" as const, achieved_level: "level_1" as const },
    reliability_claim: "usually" as const,
    note: "Described by drive team",
  };
  const report = { ...blankPit(), autonomous_routines: [first, second] };
  assert.equal(rebuiltPitSchema.parse(report).autonomous_routines?.length, 2);
  assert.equal(
    rebuiltPitSchema.safeParse({
      ...report,
      autonomous_routines: [first, first],
    }).success,
    false,
  );
  for (const forbidden of [
    "ground_intake",
    "source_intake",
    "cycler",
    "passing_capability",
  ]) {
    assert.equal(
      rebuiltPitSchema.safeParse({ ...report, [forbidden]: "yes" }).success,
      false,
    );
  }
});

test("team search, filters, and unscouted-first order", () => {
  const rows: TeamListRow[] = [
    { teamNumber: 3, nickname: "Gamma", status: "completed", claimedBy: null },
    {
      teamNumber: 2,
      nickname: "Beta",
      status: "in_progress",
      claimedBy: id(2),
    },
    {
      teamNumber: 1,
      nickname: "Alpha",
      status: "not_scouted",
      claimedBy: null,
    },
    {
      teamNumber: 4,
      nickname: "Alpha Two",
      status: "needs_review",
      claimedBy: null,
    },
  ];
  assert.deepEqual(
    visibleTeams(rows, "", "all").map((r) => r.teamNumber),
    [1, 4, 2, 3],
  );
  assert.deepEqual(
    visibleTeams(rows, "alpha", "all").map((r) => r.teamNumber),
    [1, 4],
  );
  assert.deepEqual(
    visibleTeams(rows, "3", "completed").map((r) => r.teamNumber),
    [3],
  );
  assert.deepEqual(
    visibleTeams(rows, "", "unscouted").map((r) => r.teamNumber),
    [1],
  );
});

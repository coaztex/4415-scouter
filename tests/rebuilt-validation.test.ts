import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rebuiltMatchSchema,
  matchCaptureConfig,
  observedRoles,
} from "../src/games/2026-rebuilt/match-schema";
import { rebuiltPitSchema } from "../src/games/2026-rebuilt/pit-schema";
import {
  activityTimelineSchema,
  deriveActivity,
} from "../src/games/2026-rebuilt/activity";
import { matchData, pitData } from "./fixtures/rebuilt";
test("v2 accepts observed zero and null, rejects old or forbidden semantics", () => {
  assert.equal(
    rebuiltMatchSchema.parse(matchData()).auto.estimated_fuel_scored,
    0,
  );
  assert.deepEqual(matchCaptureConfig.fuelIncrements, [1, 5, 10, 20]);
  for (const value of [-1, 0.5, NaN, Infinity, "0", undefined]) {
    const d = matchData();
    assert.equal(
      rebuiltMatchSchema.safeParse({
        ...d,
        auto: { ...d.auto, estimated_fuel_scored: value },
      }).success,
      false,
    );
  }
  for (const role of observedRoles) {
    const d = matchData();
    d.post_match.observed_role = role;
    assert.ok(rebuiltMatchSchema.safeParse(d).success);
  }
  const d = matchData();
  assert.ok(
    !rebuiltMatchSchema.safeParse({
      ...d,
      post_match: { ...d.post_match, observed_role: "cycler" },
    }).success,
  );
  assert.ok(
    !rebuiltMatchSchema.safeParse({
      ...d,
      teleop: { ...d.teleop, shuffleCount: 0 },
    }).success,
  );
  d.auto.estimated_fuel_scored = null;
  d.teleop.estimated_fuel_scored = null;
  assert.ok(rebuiltMatchSchema.safeParse(d).success);
});
test("activity transitions derive non-overlapping periods and reject impossible states", () => {
  const timeline = {
    duration_seconds: 100,
    transitions: [
      { at_seconds: 0, state: "scoring" as const },
      { at_seconds: 10, state: "shuttling_passing" as const },
      { at_seconds: 40, state: "defending" as const },
      { at_seconds: 60, state: "scoring" as const },
      { at_seconds: 80, state: "other_idle" as const },
    ],
  };
  const a = deriveActivity(timeline);
  assert.deepEqual(a.seconds, {
    scoring: 30,
    shuttling_passing: 30,
    defending: 20,
    other_idle: 20,
  });
  assert.equal(a.periods.scoring, 2);
  assert.equal(a.shares.shuttling_passing, 0.3);
  const bad = [
    { ...timeline, transitions: [] },
    { ...timeline, transitions: [{ at_seconds: 1, state: "scoring" }] },
    {
      ...timeline,
      transitions: [
        { at_seconds: 0, state: "scoring" },
        { at_seconds: 0, state: "defending" },
      ],
    },
    {
      ...timeline,
      transitions: [
        { at_seconds: 0, state: "scoring" },
        { at_seconds: 10, state: "scoring" },
      ],
    },
    {
      ...timeline,
      transitions: [
        { at_seconds: 0, state: "scoring" },
        { at_seconds: 100, state: "defending" },
      ],
    },
    { ...timeline, transitions: [{ at_seconds: 0, state: "intaking" }] },
    {
      ...timeline,
      transitions: [
        { at_seconds: 0, state: "scoring", end_seconds: 40 },
        { at_seconds: 20, state: "defending" },
      ],
    },
    {
      ...timeline,
      transitions: [
        { at_seconds: 0, state: "scoring" },
        { at_seconds: 30, state: "defending" },
        { at_seconds: 20, state: "scoring" },
      ],
    },
    { ...timeline, duration_seconds: -1 },
  ];
  for (const input of bad)
    assert.ok(!activityTimelineSchema.safeParse(input).success);
  assert.equal(
    deriveActivity({ duration_seconds: 0, transitions: [] }).shares.scoring,
    null,
  );
});
test("defense requires observed evidence; DNS stays separate from offensive zero", () => {
  const d = matchData();
  d.post_match.defense_effectiveness = "average";
  assert.ok(!rebuiltMatchSchema.safeParse(d).success);
  d.post_match.defense_observed = true;
  assert.ok(rebuiltMatchSchema.safeParse(d).success);
  d.post_match.defense_observed = false;
  d.teleop.activity = {
    duration_seconds: 10,
    transitions: [{ at_seconds: 0, state: "defending" }],
  };
  assert.ok(rebuiltMatchSchema.safeParse(d).success);
  d.post_match.reliability = "DNS";
  assert.ok(!rebuiltMatchSchema.safeParse(d).success);
  delete d.post_match.defense_effectiveness;
  d.post_match.observed_role = "inactive";
  d.auto.estimated_fuel_scored = null;
  d.auto.execution_result = null;
  d.teleop.estimated_fuel_scored = null;
  d.teleop.activity = null;
  assert.ok(rebuiltMatchSchema.safeParse(d).success);
});
test("issues retain observed symptoms separately from reviewer-proven causes", () => {
  const d = matchData();
  d.issues = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      phase: "teleop",
      at_seconds: 0,
      observed: { category: "disabled" },
      recovered: "unknown",
    },
  ];
  assert.ok(rebuiltMatchSchema.safeParse(d).success);
  assert.ok(
    !rebuiltMatchSchema.safeParse({
      ...d,
      issues: [
        { ...d.issues[0], confirmed_cause: { category: "communications" } },
      ],
    }).success,
  );
  d.issues[0].at_seconds = 141;
  assert.ok(!rebuiltMatchSchema.safeParse(d).success);
  d.issues[0].at_seconds = 0;
  d.issues.push({ ...d.issues[0] });
  assert.ok(!rebuiltMatchSchema.safeParse(d).success);
});
test("pit uses numeric capacity or fallback; concise routines; rejects redundant questions", () => {
  const d = pitData();
  d.fuel_capacity = { kind: "approximate_count", amount: 0 };
  d.autonomous_routines = [
    {
      id: "30000000-0000-4000-8000-000000000001",
      start_side: "left",
      scores_fuel: "yes",
      collects_additional_fuel: "yes",
      climb: { result: "achieved", achieved_level: "level_1" },
      reliability_claim: "usually",
    },
  ];
  assert.ok(rebuiltPitSchema.safeParse(d).success);
  for (const field of [
    "shufflingNote",
    "shuttling_capability",
    "intake_source",
    "cycler",
  ])
    assert.ok(!rebuiltPitSchema.safeParse({ ...d, [field]: "yes" }).success);
  assert.ok(
    !rebuiltPitSchema.safeParse({
      ...d,
      preferred_scoring_areas: ["close", "close"],
    }).success,
  );
  assert.ok(
    !rebuiltPitSchema.safeParse({ ...d, traversal: ["trench", "unknown"] })
      .success,
  );
  assert.ok(
    !rebuiltPitSchema.safeParse({
      ...d,
      climbing: { capability: "none", highest_demonstrated_level: "level_3" },
    }).success,
  );
  assert.ok(
    !rebuiltPitSchema.safeParse({
      ...d,
      autonomous_routines: [d.autonomous_routines[0], d.autonomous_routines[0]],
    }).success,
  );
});

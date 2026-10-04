import test from "node:test";
import assert from "node:assert/strict";
import {
  freshDraft,
  fuel,
  advance,
  activity,
  addObservedIssue,
  finalPayload,
  recoverDraft,
  draftKey,
  needsDefense,
  markDns,
  omitTiming,
  type CaptureIdentity,
} from "../src/features/scouting/match/model";
import { deriveActivity } from "../src/games/2026-rebuilt/activity";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const identity: CaptureIdentity = {
  actorId: id(1),
  assignedScoutId: id(1),
  assignmentId: id(2),
  matchId: id(3),
  teamNumber: 42,
};
const fresh = () => freshDraft(identity, 1000, id(4));
const started = () => {
  const d = fresh();
  d.data.auto.execution_result = "successful";
  return advance(d, 20000);
};
test("all FUEL increments are immediate, phase-specific, and undo exactly one tap", () => {
  let d = fresh();
  for (const n of [1, 5, 10, 20] as const) d = fuel(d, n);
  assert.equal(d.data.auto.estimated_fuel_scored, 36);
  d = fuel(d, "undo");
  assert.equal(d.data.auto.estimated_fuel_scored, 16);
  for (let i = 0; i < 5; i++) d = fuel(d, "undo");
  assert.equal(d.data.auto.estimated_fuel_scored, 0);
  d.data.auto.execution_result = "partial";
  d = advance(d, 20000);
  d = fuel(d, 20);
  assert.equal(d.data.teleop.estimated_fuel_scored, 20);
  assert.equal(d.data.auto.estimated_fuel_scored, 0);
  const full = {
    ...d,
    data: {
      ...d.data,
      teleop: { ...d.data.teleop, estimated_fuel_scored: 10000 },
    },
  };
  assert.equal(fuel(full, 1).data.teleop.estimated_fuel_scored, 10000);
});
test("Auto to Teleop to Post has one initial state and validated derived durations", () => {
  assert.throws(() => advance(fresh(), 20000), /execution result/);
  let d = started();
  assert.equal(d.phase, "teleop");
  assert.deepEqual(d.transitions, [{ at_seconds: 0, state: "other_idle" }]);
  d = activity(d, "scoring", 25000);
  d = activity(d, "scoring", 26000);
  d = activity(d, "shuttling_passing", 35000);
  d = activity(d, "defending", 40000);
  d = advance(d, 50000);
  assert.equal(d.phase, "post");
  const data = deriveActivity(d.data.teleop.activity!);
  assert.deepEqual(data.seconds, {
    other_idle: 5,
    scoring: 10,
    shuttling_passing: 5,
    defending: 10,
  });
  assert.equal(d.transitions.length, 4);
  assert.equal(data.duration_seconds, 30);
  assert.equal(needsDefense(d.data), true);
  assert.throws(() => finalPayload(d), /defense effectiveness/);
  d.data.post_match.defense_effectiveness = "average";
  assert.equal(finalPayload(d).post_match.defense_effectiveness, "average");
});
test("issue capture leaves phase and active activity state unchanged; confirmed causes are rejected", () => {
  const d = activity(started(), "shuttling_passing", 25000),
    issue = {
      id: id(8),
      phase: "teleop",
      at_seconds: 6,
      observed: { category: "intake" },
    };
  const next = addObservedIssue(d, issue);
  assert.deepEqual(next.transitions, d.transitions);
  assert.equal(next.phase, d.phase);
  assert.equal(next.data.issues?.length, 1);
  assert.equal(d.data.issues?.length, 0);
  assert.throws(
    () =>
      addObservedIssue(d, {
        ...issue,
        confirmed_cause: {
          category: "intake",
          evidence: "Guess",
          confirmed_by_user_id: id(1),
          confirmed_at: new Date().toISOString(),
        },
      }),
    /confirmed causes/,
  );
});
test("clock reversals, equal transition times, and excessive durations preserve a blocked draft", () => {
  const base = activity(started(), "scoring", 25000);
  for (const now of [24000, 25000, 700000]) {
    const d = activity(base, "defending", now);
    assert.ok(d.timingFault);
    assert.deepEqual(d.transitions, base.transitions);
    assert.throws(() => finalPayload(d));
  }
  assert.ok(advance(base, 25000).timingFault);
  let fault = advance(base, 700000);
  const raw = JSON.stringify(fault);
  fault = omitTiming(fault, 700001);
  assert.equal(fault.data.teleop.activity, null);
  assert.equal(fault.phase, "post");
  assert.equal(finalPayload(fault).teleop.activity, null);
  assert.ok(JSON.parse(raw).timingFault);
});
test("draft recovery binds assignment/scout/team, retains counts, phase, UUID, issues and activity", () => {
  let d = fuel(activity(started(), "defending", 25000), 10);
  d = addObservedIssue(d, {
    id: id(8),
    phase: "teleop",
    at_seconds: 6,
    observed: { category: "disabled" },
    recovered: "unknown",
  });
  assert.deepEqual(recoverDraft(JSON.stringify(d), identity), d);
  assert.throws(() =>
    recoverDraft(JSON.stringify(d), { ...identity, teamNumber: 43 }),
  );
  assert.throws(() => recoverDraft("bad json", identity));
  assert.throws(() =>
    recoverDraft(
      JSON.stringify({
        ...d,
        data: {
          ...d.data,
          teleop: { ...d.data.teleop, estimated_fuel_scored: 99 },
        },
      }),
      identity,
    ),
  );
  assert.notEqual(
    draftKey(identity),
    draftKey({ ...identity, actorId: id(9) }),
  );
  assert.throws(() =>
    recoverDraft(
      JSON.stringify({
        ...d,
        transitions: [...d.transitions, { at_seconds: 2, state: "scoring" }],
      }),
      identity,
    ),
  );
});
test("very uncertain confidence submits; manual defense needs a rating; DNS explicitly clears estimates", () => {
  let d = advance(started(), 30000);
  d.data.post_match.fuel_estimate_confidence = "very_uncertain";
  assert.equal(
    finalPayload(d).post_match.fuel_estimate_confidence,
    "very_uncertain",
  );
  d.data.post_match.defense_observed = true;
  assert.throws(() => finalPayload(d), /effectiveness/);
  d.data.post_match.defense_effectiveness = "strong";
  assert.ok(finalPayload(d));
  d = markDns(d, 31000);
  assert.equal(d.data.auto.estimated_fuel_scored, null);
  assert.equal(d.data.teleop.activity, null);
  assert.equal(finalPayload(d).post_match.observed_role, "inactive");
  assert.deepEqual(
    recoverDraft(JSON.stringify(d), identity),
    JSON.parse(JSON.stringify(d)),
  );
});

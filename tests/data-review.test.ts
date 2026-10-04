import assert from "node:assert/strict";
import test from "node:test";
import {
  discrepancyMagnitude,
  duplicateCandidateGroups,
  FUEL_REVIEW_THRESHOLD,
  needsFuelReview,
  needsSchemaReview,
} from "../src/features/data-review/model";
import { reconcileAlliance2026 } from "../src/games/2026-rebuilt/reconciliation";
import { matchData } from "./fixtures/rebuilt";
import match from "./fixtures/tba-2026-matches.json" with { type: "json" };

test("reconciliation display math is sortable and never rescales observations", () => {
  const submissions = match.alliances.red.team_keys.map((key, index) => {
    const data = matchData();
    data.auto.estimated_fuel_scored = 30 + index;
    data.teleop.estimated_fuel_scored = 100 + index * 10;
    return {
      id: `submission-${index}`,
      eventKey: match.event_key,
      matchKey: match.key,
      teamNumber: Number(key.slice(3)),
      schemaVersion: 2 as const,
      data,
    };
  });
  const before = structuredClone(submissions);
  const result = reconcileAlliance2026(match, "red", submissions);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.auto.estimate, 93);
  assert.equal(result.teleop.estimate, 330);
  assert.equal(result.total.estimate, 423);
  assert.equal(result.total.absoluteDifference, 259);
  assert.equal(
    discrepancyMagnitude([result.auto, result.teleop, result.total]),
    Math.max(
      result.auto.percentageDifference ?? 0,
      result.teleop.percentageDifference ?? 0,
      result.total.percentageDifference ?? 0,
    ),
  );
  assert.deepEqual(
    submissions,
    before,
    "comparison must not mutate/rescale records",
  );
});

test("review threshold and zero-official fallback are centralized", () => {
  assert.equal(FUEL_REVIEW_THRESHOLD.percentage, 25);
  assert.equal(
    needsFuelReview([{ absoluteDifference: 5, percentageDifference: 26 }]),
    true,
  );
  assert.equal(
    needsFuelReview([{ absoluteDifference: 19, percentageDifference: null }]),
    false,
  );
});

test("duplicate candidates remain separate records for review", () => {
  const rows = [
    {
      id: "one",
      client_submission_id: "client-a",
      event_id: "e",
      match_id: "m",
      team_number: 1,
    },
    {
      id: "two",
      client_submission_id: "client-b",
      event_id: "e",
      match_id: "m",
      team_number: 1,
    },
    {
      id: "three",
      client_submission_id: "client-c",
      event_id: "e",
      match_id: "m",
      team_number: 2,
    },
  ];
  const groups = duplicateCandidateGroups(rows);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    groups[0].map((row) => row.client_submission_id),
    ["client-a", "client-b"],
  );
  assert.equal(
    rows.length,
    3,
    "resolution grouping must not overwrite a candidate",
  );
});

test("stored old versions and invalid current payloads require schema review", () => {
  assert.equal(needsSchemaReview(1, 2, true), true);
  assert.equal(needsSchemaReview(2, 2, false), true);
  assert.equal(needsSchemaReview(2, 2, true), false);
});

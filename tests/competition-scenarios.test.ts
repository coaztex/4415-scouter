import test from "node:test";
import assert from "node:assert/strict";
import { rebuiltMatchSchema } from "../src/games/2026-rebuilt/match-schema";
import { aggregateTeam } from "../src/games/2026-rebuilt/aggregate";
import { summarize } from "../src/games/core/statistics";
import { scoutingMetric } from "../src/games/2026-rebuilt/stats";
import { reconcileAlliance2026 } from "../src/games/2026-rebuilt/reconciliation";
import { needsFuelReview } from "../src/features/data-review/model";
import {
  syntheticEventKey,
  syntheticMatchKey,
  syntheticScenarios,
  syntheticTbaMatch,
} from "./fixtures/competition-2026";

test("fictional competition scenarios are distinct valid v2 observations", () => {
  const scenarios = syntheticScenarios();
  assert.equal(scenarios.length, 6);
  assert.equal(new Set(scenarios.map((s) => s.teamNumber)).size, 6);
  for (const scenario of scenarios)
    assert.ok(
      rebuiltMatchSchema.safeParse(scenario.data).success,
      scenario.name,
    );
});

test("scorer, feeder and defender activity/roles remain separate from FUEL", () => {
  const scenarios = syntheticScenarios();
  const aggregate = aggregateTeam(
    scenarios.slice(0, 3).map((scenario, index) => ({
      eventId: syntheticEventKey,
      matchId: `qm${index + 1}`,
      teamNumber: 101,
      data: scenario.data,
    })),
  );
  assert.equal(aggregate.fuel.total.mean, (170 + 120 + 30) / 3);
  assert.equal(aggregate.fuel.teleop.median, 100);
  assert.equal(
    scoutingMetric(aggregate, "fuel_consistency"),
    aggregate.fuel.teleop.standardDeviation,
  );
  assert.equal(aggregate.activity.shuttling_passing.seconds.mean, 40);
  assert.equal(aggregate.activity.defending.seconds.mean, 110 / 3);
  assert.equal(aggregate.roles.counts.passer_feeder, 1);
  assert.equal(aggregate.roles.counts.defender, 1);
  assert.equal(aggregate.defense.effectiveness.counts.strong, 1);
});

test("mean, median and consistency use known zeros and population deviation", () => {
  const summary = summarize([20, 0, null, 10]);
  assert.equal(summary.sampleSize, 3);
  assert.equal(summary.mean, 10);
  assert.equal(summary.median, 10);
  assert.equal(summary.best, 20);
  assert.ok(Math.abs(summary.standardDeviation! - Math.sqrt(200 / 3)) < 1e-10);
});

test("uncertain and DNF FUEL are excluded while reliability counts DNS/DNF", () => {
  const scenarios = syntheticScenarios();
  const aggregate = aggregateTeam(
    scenarios.map((scenario, index) => ({
      eventId: syntheticEventKey,
      matchId: `qm${index + 1}`,
      teamNumber: 101,
      data: scenario.data,
    })),
  );
  assert.equal(aggregate.sampleSize, 6);
  assert.equal(aggregate.fuel.confidentSampleSize, 3);
  assert.equal(aggregate.fuel.veryUncertainSampleSize, 1);
  assert.equal(aggregate.fuel.excludedDnfSampleSize, 1);
  assert.equal(aggregate.fuel.total.mean, (170 + 120 + 30) / 3);
  assert.equal(aggregate.reliability.counts.DNS, 1);
  assert.equal(aggregate.reliability.counts.DNF, 1);
  assert.equal(aggregate.reliability.fullMatchRate, 4 / 6);
  assert.equal(aggregate.auto.successfulRate, 1);
  assert.equal(aggregate.auto.execution.sampleSize, 5);
  assert.deepEqual(summarize([0, null]), {
    sampleSize: 1,
    mean: 0,
    median: 0,
    best: 0,
    standardDeviation: 0,
  });
});

test("deliberate official mismatch flags alliance, preserving every robot estimate", () => {
  const rows = syntheticScenarios()
    .slice(0, 3)
    .map((scenario, index) => ({
      id: `synthetic-submission-${index + 1}`,
      eventKey: syntheticEventKey,
      matchKey: syntheticMatchKey,
      teamNumber: scenario.teamNumber,
      schemaVersion: 2 as const,
      data: scenario.data,
    }));
  const before = JSON.stringify(rows);
  const result = reconcileAlliance2026(syntheticTbaMatch, "red", rows);
  assert.equal(result.status, "ready");
  if (result.status !== "ready") assert.fail();
  assert.deepEqual(result.auto, {
    estimate: 60,
    official: 100,
    absoluteDifference: 40,
    percentageDifference: 40,
  });
  assert.equal(result.teleop.estimate, 260);
  assert.equal(result.teleop.absoluteDifference, 140);
  assert.equal(result.total.estimate, 320);
  assert.equal(result.total.absoluteDifference, 180);
  assert.equal(
    needsFuelReview([result.auto, result.teleop, result.total]),
    true,
  );
  assert.deepEqual(
    result.contributingSubmissionIds,
    rows.map((row) => row.id),
  );
  assert.equal(JSON.stringify(rows), before);
});

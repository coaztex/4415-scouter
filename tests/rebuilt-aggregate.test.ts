import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateTeam,
  aggregateEvent,
} from "../src/games/2026-rebuilt/aggregate";
import { matchData } from "./fixtures/rebuilt";
const row = (data = matchData(), i = 1, teamNumber = 1) => ({
  eventId: "event",
  matchId: String(i),
  teamNumber,
  data,
});
test("confidence filters FUEL only and never turns unknown into zero", () => {
  const a = matchData(),
    b = matchData();
  b.auto.estimated_fuel_scored = 100;
  b.teleop.estimated_fuel_scored = 200;
  b.post_match.fuel_estimate_confidence = "very_uncertain";
  b.post_match.observed_role = "passer_feeder";
  b.teleop.activity = {
    duration_seconds: 100,
    transitions: [{ at_seconds: 0, state: "shuttling_passing" }],
  };
  const input = [row(a), row(b, 2)],
    before = JSON.stringify(input),
    result = aggregateTeam(input);
  assert.equal(result.sampleSize, 2);
  assert.equal(result.fuel.confidentSampleSize, 1);
  assert.equal(result.fuel.total.mean, 0);
  assert.equal(result.fuel.veryUncertainSampleSize, 1);
  assert.equal(result.activity.shuttling_passing.seconds.mean, 50);
  assert.equal(result.roles.counts.passer_feeder, 1);
  assert.equal(
    aggregateTeam(input, { includeVeryUncertainFuel: true }).fuel.total.mean,
    150,
  );
  assert.equal(JSON.stringify(input), before);
  b.auto.estimated_fuel_scored = null;
  const all = aggregateTeam(input, { includeVeryUncertainFuel: true });
  assert.equal(all.fuel.total.sampleSize, 1);
  assert.equal(all.fuel.teleop.mean, 100);
});
test("AUTO, defense, supporting ratings and reliability have explicit denominators", () => {
  const rows = ["successful", "partial", "failed", null].map((value, i) => {
    const d = matchData();
    d.auto.execution_result = value as typeof d.auto.execution_result;
    return row(d, i);
  });
  rows[0].data.auto.collected_additional_fuel = "yes";
  rows[1].data.auto.collected_additional_fuel = "no";
  rows[0].data.post_match.defense_observed = true;
  rows[0].data.post_match.defense_effectiveness = "strong";
  rows[1].data.post_match.driver_control = "rough";
  rows[2].data.post_match.driver_control = "unknown";
  rows[2].data.post_match.reliability = "DNF";
  rows[2].data.teleop.estimated_fuel_scored = 5;
  rows[3].data.teleop.activity = null;
  const m = aggregateTeam(rows);
  assert.equal(m.auto.successfulRate, 1 / 3);
  assert.equal(m.auto.partialRate, 1 / 3);
  assert.equal(m.auto.failedRate, 1 / 3);
  assert.deepEqual(m.auto.additionalFuel, { sampleSize: 2, frequency: 0.5 });
  assert.equal(m.defense.frequency, 1 / 3);
  assert.equal(m.defense.effectiveness.counts.strong, 1);
  assert.equal(m.driverControl.sampleSize, 1);
  assert.equal(m.reliability.fullMatchRate, 0.75);
  assert.equal(m.fuel.excludedDnfSampleSize, 1);
  assert.equal(m.fuel.teleop.mean, 0);
  assert.equal(m.roles.mostCommon, "scorer");
});
test("DNS absence does not add a zero; DNF unknown is missing; empty summaries stay null", () => {
  const dns = matchData();
  dns.post_match.reliability = "DNS";
  dns.post_match.observed_role = "inactive";
  dns.auto.estimated_fuel_scored = null;
  dns.auto.execution_result = null;
  dns.teleop.estimated_fuel_scored = null;
  dns.teleop.activity = null;
  const dnf = matchData();
  dnf.post_match.reliability = "DNF";
  dnf.auto.estimated_fuel_scored = null;
  dnf.teleop.estimated_fuel_scored = null;
  const m = aggregateTeam([row(dns), row(dnf, 2)]);
  assert.equal(m.sampleSize, 2);
  assert.equal(m.fuel.total.sampleSize, 0);
  assert.equal(m.fuel.total.mean, null);
  assert.equal(m.reliability.fullMatchRate, 0);
  const empty = aggregateTeam([]);
  assert.equal(empty.defense.frequency, null);
  assert.equal(empty.roles.mostCommon, null);
  assert.equal(empty.auto.successfulRate, null);
});
test("event aggregate enforces canonical observations and computes descriptive FUEL statistics", () => {
  const a = matchData();
  a.auto.estimated_fuel_scored = 10;
  a.teleop.estimated_fuel_scored = 20;
  const rows = [row(a), row(matchData(), 2)];
  const result = aggregateTeam(rows);
  assert.equal(result.fuel.total.mean, 15);
  assert.equal(result.fuel.total.median, 15);
  assert.equal(result.fuel.total.best, 30);
  assert.equal(result.fuel.total.standardDeviation, 15);
  assert.throws(() => aggregateTeam([rows[0], rows[0]]));
  assert.throws(() =>
    aggregateEvent([rows[0], { ...rows[1], eventId: "other" }]),
  );
  assert.throws(() => aggregateTeam([rows[0], { ...rows[1], teamNumber: 2 }]));
  assert.equal(
    aggregateEvent([rows[0], { ...rows[1], teamNumber: 2 }]).teams.length,
    2,
  );
});

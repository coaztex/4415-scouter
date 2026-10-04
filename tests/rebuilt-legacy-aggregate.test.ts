import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateTeam,
  aggregateEvent,
} from "../src/games/2026-rebuilt/legacy/v1/aggregate";
import { summarize } from "../src/games/core/statistics";
import { matchData } from "./fixtures/rebuilt-v1";
import type { RebuiltMatchData } from "../src/games/2026-rebuilt/legacy/v1/match-schema";

function submission(data: RebuiltMatchData, index: number, teamNumber = 1) {
  return {
    eventId: "fixture-event",
    matchId: `match-${index}`,
    teamNumber,
    data,
  };
}
test("statistics preserve zero, compute even/odd medians and population SD without mutation", () => {
  const values = [20, 0, null, 10];
  const result = summarize(values);
  assert.deepEqual(
    { ...result, standardDeviation: null },
    { sampleSize: 3, mean: 10, median: 10, best: 20, standardDeviation: null },
  );
  assert.ok(Math.abs(result.standardDeviation! - Math.sqrt(200 / 3)) < 1e-10);
  assert.equal(summarize([0, 10]).median, 5);
  assert.deepEqual(summarize([0]), {
    sampleSize: 1,
    mean: 0,
    median: 0,
    best: 0,
    standardDeviation: 0,
  });
  assert.deepEqual(values, [20, 0, null, 10]);
  assert.throws(() => summarize([Infinity]));
});
test("empty and all-missing metrics remain null rather than invented zeros", () => {
  const empty = aggregateTeam([]);
  assert.equal(empty.sampleSize, 0);
  assert.equal(empty.fuel.total.mean, null);
  assert.equal(empty.shuffle.total.frequency, null);
  assert.equal(empty.defense.frequency, null);
  assert.equal(empty.reliability.fullMatchRate, null);
  const data = matchData();
  data.auto.fuelScored = null;
  data.teleop.fuelScored = null;
  data.auto.shuffleCount = null;
  data.teleop.shuffleCount = null;
  data.postMatch = { defense: null, reliability: null };
  const result = aggregateTeam([submission(data, 1)]);
  assert.equal(result.sampleSize, 1);
  assert.equal(result.fuel.total.sampleSize, 0);
  assert.equal(result.reliability.sampleSize, 0);
});
test("partial phases do not invent totals and observed zero still participates", () => {
  const first = matchData();
  first.auto.fuelScored = 10;
  first.teleop.fuelScored = 20;
  const partial = matchData();
  partial.auto.fuelScored = null;
  partial.teleop.fuelScored = 10;
  const rows = [first, matchData(), partial].map((data, i) =>
    submission(data, i),
  );
  const before = JSON.stringify(rows);
  const result = aggregateTeam(rows);
  assert.equal(result.fuel.auto.mean, 5);
  assert.equal(result.fuel.teleop.mean, 10);
  assert.equal(result.fuel.total.mean, 15);
  assert.equal(result.fuel.total.sampleSize, 2);
  assert.equal(result.fuel.total.best, 30);
  assert.equal(result.fuel.total.standardDeviation, 15);
  assert.equal(JSON.stringify(rows), before);
});
test("shuffle frequency uses authoritative counts, not optional event-log length", () => {
  const first = matchData();
  first.auto.shuffleCount = 2;
  first.teleop.shuffleCount = 1;
  const unknown = matchData();
  unknown.auto.shuffleCount = null;
  const result = aggregateTeam(
    [first, matchData(), unknown].map((data, i) => submission(data, i)),
  );
  assert.equal(result.shuffle.auto.sampleSize, 2);
  assert.equal(result.shuffle.auto.mean, 1);
  assert.equal(result.shuffle.total.frequency, 0.5);
  assert.equal(result.shuffle.total.matchesWithShuffle, 1);
  assert.equal(result.shuffle.total.mean, 1.5);
});
test("defense and reliability expose denominators and distinct completion/issue-free rates", () => {
  const rows = ["normal", "minor_issue", "major_issue", "DNF", "DNS", null].map(
    (status, index) => {
      const data = matchData();
      data.postMatch.reliability =
        status as RebuiltMatchData["postMatch"]["reliability"];
      return submission(data, index);
    },
  );
  rows[0].data.postMatch.defense = { amount: "some", effectiveness: "strong" };
  rows[1].data.postMatch.defense = { amount: "heavy", effectiveness: "poor" };
  rows[5].data.postMatch.defense = null;
  const result = aggregateTeam(rows);
  assert.equal(result.defense.sampleSize, 5);
  assert.equal(result.defense.frequency, 2 / 5);
  assert.deepEqual(result.defense.effectiveness.counts, {
    poor: 1,
    okay: 0,
    strong: 1,
  });
  assert.equal(result.defense.effectiveness.strongRate, 0.5);
  assert.equal(result.reliability.fullMatchRate, 3 / 5);
  assert.equal(result.reliability.normalRate, 1 / 5);
  assert.equal(result.reliability.startedCompletionRate, 3 / 4);
  const dns = matchData();
  dns.postMatch.reliability = "DNS";
  assert.equal(
    aggregateTeam([submission(dns, 1)]).reliability.startedCompletionRate,
    null,
  );
});
test("event aggregates pool observations, sort teams, and reject duplicate or mixed inputs", () => {
  const scored = matchData();
  scored.auto.fuelScored = 30;
  const rows = [
    submission(scored, 1, 2),
    submission(matchData(), 1),
    submission(matchData(), 2),
  ];
  const result = aggregateEvent(rows);
  assert.deepEqual(
    result.teams.map((team) => team.teamNumber),
    [1, 2],
  );
  assert.equal(result.overall.fuel.total.mean, 10); // pooled, not mean of team means (15)
  assert.equal(result.teams[1].metrics.fuel.total.mean, 30);
  assert.equal(aggregateEvent([]).eventId, null);
  assert.throws(() => aggregateTeam(rows));
  assert.throws(() => aggregateEvent([rows[0], rows[0]]));
  assert.throws(() =>
    aggregateEvent([rows[0], { ...rows[1], eventId: "other" }]),
  );
  assert.throws(() => aggregateEvent([{ ...rows[0], teamNumber: 0 }]));
  const invalid = matchData();
  invalid.auto.fuelScored = -1;
  assert.throws(() => aggregateTeam([submission(invalid, 1)]));
});

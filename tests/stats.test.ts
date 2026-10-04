import test from "node:test";
import assert from "node:assert/strict";
import { matchData } from "./fixtures/rebuilt";
import {
  build2026Stats,
  recentIssueChange,
  scoutingMetric,
  scoutingMetricSample,
} from "../src/games/2026-rebuilt/stats";
import {
  buildStatsRows,
  formatMetric,
  metricsByTab,
  querySchema,
  rankedRows,
  tabLabels,
  withAvailableExternalDefault,
} from "../src/features/stats/model";
import {
  fuelDistribution,
  percentile,
} from "../src/features/stats/distribution";
import {
  emptyScouting,
  type TeamDirectoryRow,
} from "../src/features/teams/model";

const eventId = "event";
const observed = (
  data: ReturnType<typeof matchData>,
  index: number,
  teamNumber = 1,
) => ({
  eventId,
  matchId: `qm${index}`,
  matchOrder: index,
  teamNumber,
  data,
});

test("field analytics preserve zero, filter uncertain FUEL, and derive timed activity and reliability", () => {
  const zero = matchData();
  zero.teleop.activity = {
    duration_seconds: 140,
    transitions: [{ at_seconds: 0, state: "scoring" }],
  };
  zero.auto.collected_additional_fuel = "yes";
  const passing = matchData();
  passing.teleop.estimated_fuel_scored = 10;
  passing.teleop.activity = {
    duration_seconds: 140,
    transitions: [{ at_seconds: 0, state: "shuttling_passing" }],
  };
  passing.post_match.observed_role = "passer_feeder";
  passing.post_match.reliability = "minor_issue";
  passing.auto.execution_result = "partial";
  passing.auto.collected_additional_fuel = "no";
  const defending = matchData();
  defending.teleop.estimated_fuel_scored = 20;
  defending.teleop.activity = {
    duration_seconds: 140,
    transitions: [{ at_seconds: 0, state: "defending" }],
  };
  defending.post_match.observed_role = "defender";
  defending.post_match.defense_observed = true;
  defending.post_match.defense_effectiveness = "strong";
  defending.post_match.reliability = "DNF";
  defending.auto.execution_result = "failed";
  const uncertain = matchData();
  uncertain.teleop.estimated_fuel_scored = 100;
  uncertain.teleop.activity = {
    duration_seconds: 140,
    transitions: [{ at_seconds: 0, state: "scoring" }],
  };
  uncertain.post_match.fuel_estimate_confidence = "very_uncertain";
  const dns = matchData();
  dns.auto.estimated_fuel_scored = null;
  dns.teleop.estimated_fuel_scored = null;
  dns.teleop.activity = null;
  dns.auto.execution_result = null;
  dns.post_match.reliability = "DNS";
  dns.post_match.observed_role = "inactive";
  const rows = [zero, passing, defending, uncertain, dns].map((data, index) =>
    observed(data, index + 1),
  );
  const result = build2026Stats(rows);
  const m = result.teamMetrics.get(1)!;
  assert.equal(m.sampleSize, 5);
  assert.equal(m.fuel.teleop.sampleSize, 2);
  assert.equal(m.fuel.confidentSampleSize, 2);
  assert.equal(m.fuel.excludedDnfSampleSize, 1);
  assert.equal(m.fuel.teleop.mean, 5);
  assert.equal(m.fuel.teleop.median, 5);
  assert.equal(m.fuel.teleop.best, 10);
  assert.equal(m.fuel.teleop.standardDeviation, 5);
  assert.equal(m.activity.scoring.seconds.mean, 70);
  assert.equal(m.activity.shuttling_passing.seconds.mean, 35);
  assert.equal(m.activity.defending.seconds.mean, 35);
  assert.equal(m.roles.counts.passer_feeder, 1);
  assert.equal(m.roles.counts.defender, 1);
  assert.equal(m.auto.successfulRate, 0.5);
  assert.equal(m.auto.additionalFuel.frequency, 0.5);
  assert.equal(m.defense.frequency, 1 / 4);
  assert.equal(m.defense.effectiveness.counts.strong, 1);
  assert.equal(m.reliability.fullMatchRate, 3 / 5);
  assert.equal(m.reliability.counts.DNS, 1);
  assert.equal(m.reliability.counts.DNF, 1);
  assert.equal(scoutingMetric(m, "passing_share"), 0.25);
  assert.equal(scoutingMetricSample(m, "passing_share"), 4);
  assert.equal(result.autoStarts.unknown, 4);
  const included = build2026Stats(rows, {
    includeVeryUncertainFuel: true,
  }).teamMetrics.get(1)!;
  assert.equal(included.fuel.teleop.sampleSize, 3);
  assert.equal(included.fuel.teleop.mean, 110 / 3);
  assert.equal(included.fuel.teleop.median, 10);
  assert.equal(included.fuel.confidentSampleSize, 2);
});

test("rankings distinguish zero from absent data and require an explicit sample threshold", () => {
  const base = (teamNumber: number): TeamDirectoryRow => ({
    teamNumber,
    nickname: null,
    city: null,
    state: null,
    pitStatus: "not_scouted",
    pitMechanism: "unknown",
    pitReported: false,
    pitOtherType: null,
    rank: null,
    wins: null,
    losses: null,
    ties: null,
    statbotics: null,
    tba: null,
    scouting: emptyScouting(),
    observations: [],
  });
  const zero = matchData();
  const single = {
    ...base(1),
    observations: [
      {
        id: "one",
        matchId: "qm1",
        matchKey: "event_qm1",
        matchNumber: 1,
        compLevel: "qm",
        completedAt: null,
        data: zero,
      },
    ],
  };
  const rows = buildStatsRows(eventId, [single, base(2)], false).rows;
  const metric = metricsByTab.fuel[0];
  const withOne = querySchema.parse({ tab: "fuel", min: "1" });
  assert.deepEqual(
    rankedRows(rows, metric, withOne).map((row) => row.teamNumber),
    [1],
  );
  assert.equal(formatMetric(0, metric), "0");
  assert.equal(formatMetric(null, metric), "—");
  assert.equal(
    rankedRows(rows, metric, querySchema.parse({ tab: "fuel", min: "2" }))
      .length,
    0,
  );
  const external = metricsByTab.external[0];
  assert.deepEqual(
    rankedRows(
      rows,
      external,
      querySchema.parse({ tab: "external", dir: "asc" }),
    ).map((row) => row.teamNumber),
    [1, 2],
  );
});

test("recent issue trend needs two three-match windows and does not mutate inputs", () => {
  const rows = Array.from({ length: 6 }, (_, index) => {
    const data = matchData();
    if (index >= 3) data.post_match.reliability = "major_issue";
    return observed(data, index + 1);
  });
  assert.equal(recentIssueChange(rows.slice(0, 5)), null);
  assert.equal(recentIssueChange(rows), 1);
  assert.equal(rows[0].matchOrder, 1);
});

test("percentiles describe eligible team medians and suppress tiny distributions", () => {
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([10], 0.5), 10);
  assert.equal(percentile([40, 10, 30, 20, 50], 0.25), 20);
  assert.equal(percentile([40, 10, 30, 20, 50], 0.5), 30);
  assert.equal(percentile([40, 10, 30, 20, 50], 0.75), 40);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9.1);
  const rows = [10, 20, 30, 40, 50].map((value, index) => {
    const metrics = emptyScouting();
    metrics.fuel.teleop.sampleSize = index === 0 ? 1 : 2;
    metrics.fuel.teleop.median = value;
    return { teamNumber: index + 1, metrics } as ReturnType<
      typeof buildStatsRows
    >["rows"][number];
  });
  const result = fuelDistribution(rows);
  assert.equal(result.teamCount, 4);
  assert.equal(result.median, 35);
  assert.equal(result.topDecile, null);
  assert.equal(fuelDistribution([]).teamCount, 0);
});

test("team search and sorting keep missing external data last, not zero", () => {
  const make = (teamNumber: number, nickname: string, epa: number | null) =>
    ({
      teamNumber,
      nickname,
      metrics: emptyScouting(),
      statbotics: epa === null ? null : { total: epa },
    }) as ReturnType<typeof buildStatsRows>["rows"][number];
  const rows = [
    make(1, "Alpha", 0),
    make(2, "Beta", null),
    make(3, "Gamma", 5),
  ];
  const metric = metricsByTab.external[0];
  assert.equal(metric.source, "Statbotics");
  assert.equal(
    metricsByTab.external.find((m) => m.key === "opr")?.source,
    "TBA",
  );
  assert.deepEqual(
    rankedRows(rows, metric, querySchema.parse({ tab: "external" })).map(
      (r) => r.teamNumber,
    ),
    [3, 1, 2],
  );
  assert.deepEqual(
    rankedRows(
      rows,
      metric,
      querySchema.parse({ tab: "external", dir: "asc" }),
    ).map((r) => r.teamNumber),
    [1, 3, 2],
  );
  assert.deepEqual(
    rankedRows(
      rows,
      metric,
      querySchema.parse({ tab: "external", q: "gam" }),
    ).map((r) => r.teamNumber),
    [3],
  );
  const cachedTba = [
    { ...rows[0], statbotics: null, tba: { opr: 42 } },
  ] as typeof rows;
  assert.equal(
    withAvailableExternalDefault(
      querySchema.parse({ tab: "external" }),
      cachedTba,
    ).metric,
    "opr",
  );
  assert.equal(
    withAvailableExternalDefault(
      querySchema.parse({ tab: "external", metric: "epa" }),
      cachedTba,
    ).metric,
    "epa",
  );
});

test("Stats presents shuffling and Shuttler without a separate passing metric", () => {
  assert.equal(tabLabels.activity, "Activity");
  assert.equal(tabLabels.fuel, "FUEL");
  assert(
    metricsByTab.activity.some(
      (metric) => metric.label === "Shuffling time share",
    ),
  );
  assert(
    metricsByTab.activity.some(
      (metric) => metric.label === "Shuttler observed-role frequency",
    ),
  );
  assert(
    metricsByTab.activity.every(
      (metric) => !/passing|Passer-Feeder/i.test(metric.label),
    ),
  );
  assert.equal(querySchema.parse({ tab: "scoring" }).tab, "fuel");
  assert.equal(querySchema.parse({ tab: "support" }).tab, "activity");
  assert.equal(querySchema.parse({ tab: "defense" }).tab, "activity");
});

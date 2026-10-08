import test from "node:test";
import assert from "node:assert/strict";
import { matchData } from "./fixtures/rebuilt";
import { aggregateTeam } from "../src/games/2026-rebuilt/aggregate";
import {
  correlatedWarnings,
  defaultState,
  filterByMechanisms,
  manualOrder,
  metrics,
  moveTeam,
  percentile,
  pickTeam,
  profileIds,
  profileLabels,
  profileMetrics,
  scoreTeams,
  stateSchema,
  type PickTeam,
} from "../src/features/picklist/model";
import {
  snapshotEvidence,
  snapshotSchema,
} from "../src/features/picklist/snapshot";
import {
  compareRobotWeight,
  emptyPitSpecFilters,
  filterByPitSpecs,
  weightRange,
} from "../src/features/picklist/filters";

function team(
  number: number,
  samples: ReturnType<typeof matchData>[],
): PickTeam {
  return pickTeam({
    teamNumber: number,
    nickname: `Team ${number}`,
    city: null,
    state: null,
    pitStatus: "not_scouted",
    pitMechanism: "unknown",
    pitReported: false,
    pitOtherType: null,
    pitRobotWeightLbs: null,
    pitDrivetrain: "unknown",
    rank: null,
    wins: null,
    losses: null,
    ties: null,
    tba: null,
    statbotics: null,
    scouting: aggregateTeam(
      samples.map((data, i) => ({
        eventId: "event",
        teamNumber: number,
        matchId: `qm${i + 1}`,
        data,
      })),
    ),
    observations: samples.map((data, i) => ({
      id: `s${number}-${i}`,
      matchId: `qm${i + 1}`,
      matchKey: `2026test_qm${i + 1}`,
      matchNumber: i + 1,
      compLevel: "qm",
      completedAt: null,
      data,
    })),
  });
}
test("picklist view model and snapshots carry normalized pit specifications with legacy defaults", () => {
  const reported: PickTeam = {
    ...team(1, []),
    robotWeightLbs: 112.4,
    drivetrain: "swerve",
    mechanism: "turret",
  };
  const snapshot = snapshotEvidence(
    [reported],
    defaultState(),
    null,
    "offense",
  );
  assert.equal(snapshot.teams[0].robotWeightLbs, 112.4);
  assert.equal(snapshot.teams[0].drivetrain, "swerve");
  assert.equal(snapshot.teams[0].mechanism, "turret");
  assert.equal(team(2, []).robotWeightLbs, null);
  const legacyEvidence = { ...snapshot.teams[0] } as Record<string, unknown>;
  delete legacyEvidence.robotWeightLbs;
  delete legacyEvidence.drivetrain;
  assert.equal(
    snapshotSchema.parse({ ...snapshot, teams: [legacyEvidence] }).teams[0]
      .robotWeightLbs,
    null,
  );
  assert.equal(
    snapshotSchema.parse({ ...snapshot, teams: [legacyEvidence] }).teams[0]
      .drivetrain,
    "unknown",
  );
});
function fuel(amount: number) {
  const d = matchData();
  d.teleop.estimated_fuel_scored = amount;
  return d;
}
const repeated = (amount: number, n = 3) =>
  Array.from({ length: n }, () => fuel(amount));
test("percentiles normalize units, handle ties and equal/single cohorts", () => {
  assert.equal(percentile(100, [0, 50, 100]), 100);
  assert.equal(percentile(0.5, [0, 0.5, 1]), 50);
  assert.equal(percentile(10, [10, 10, 20]), 25);
  assert.equal(percentile(5, [5, 5, 5]), 50);
  assert.equal(percentile(5, [5]), 50);
  assert.equal(percentile(0.8, [0.8, 0.8000000000000002]), 50);
  assert.throws(() => percentile(0, []));
  assert.throws(() => percentile(NaN, [NaN]));
});
test("weighted scoring exposes exact normalized contributions independent of raw units", () => {
  const a = team(1, repeated(100));
  const b = team(2, repeated(0));
  a.scouting.reliability.fullMatchRate = 0.5;
  b.scouting.reliability.fullMatchRate = 1;
  const scores = scoreTeams([a, b], {
    weights: { fuel: 25, full_match: 75 },
    minSamples: 3,
    minCoverage: 1,
  });
  assert.equal(scores[0].score, 25);
  assert.equal(scores[1].score, 75);
  assert.equal(scores[0].contributions[0].points, 25);
  assert.equal(scores[0].contributions[1].effectiveWeight, 0.75);
  assert.equal(scores[0].contributions[0].sample, 3);
});
test("missing metrics are omitted with coverage gating; a measured zero is included", () => {
  const a = team(1, repeated(0));
  const b = team(2, repeated(10));
  const profile = {
    weights: { fuel: 75, copr_fuel: 25 },
    minSamples: 3,
    minCoverage: 0.7,
  };
  const scores = scoreTeams([a, b], profile);
  assert.equal(scores[0].score, 0);
  assert.equal(scores[0].coverage, 0.75);
  assert.equal(
    scores[0].contributions.find((c) => c.id === "fuel")?.effectiveWeight,
    1,
  );
  assert.equal(
    scores[0].contributions.find((c) => c.id === "copr_fuel")?.normalized,
    null,
  );
  assert.equal(
    scores[0].contributions.find((c) => c.id === "copr_fuel")?.sample,
    null,
  );
  assert.equal(
    scoreTeams([a, b], { ...profile, minCoverage: 0.8 })[0].score,
    null,
  );
  assert.equal(scoreTeams([team(3, [])], profile)[0].score, null);
  assert.equal(
    scoreTeams([a], { ...profile, weights: {} })[0].reason,
    "All metrics disabled",
  );
});
test("a flashy one-match result is unranked under default sample policy", () => {
  const scores = scoreTeams(
    [team(1, repeated(1000, 1)), team(2, repeated(10))],
    defaultState().profiles.offense,
  );
  assert.equal(scores[0].score, null);
  assert.match(scores[0].contributions[0].treatment, /Below 3/);
  assert.equal(scores[1].score, 50); // only eligible peer; neutral
});
test("very uncertain and DNF FUEL cannot alter a score; other role evidence survives", () => {
  const uncertain = fuel(9999);
  uncertain.post_match.fuel_estimate_confidence = "very_uncertain";
  uncertain.post_match.observed_role = "passer_feeder";
  const dnf = fuel(9999);
  dnf.post_match.reliability = "DNF";
  const a = team(1, [...repeated(20), uncertain, dnf]),
    b = team(2, repeated(10));
  const score = scoreTeams([a, b], defaultState().profiles.offense)[0];
  assert.equal(score.score, 100);
  assert.equal(score.contributions[0].raw, 20);
  assert.equal(score.contributions[0].sample, 3);
  assert.equal(a.scouting.roles.counts.passer_feeder, 1);
  assert.equal(a.scouting.roles.sampleSize, 5);
  assert.equal(a.recentUncertain, 1);
  assert.equal(a.recentConcern, true);
});
test("correlated metrics can be fully disabled and never hide inside another metric", () => {
  const a = team(1, repeated(20)),
    b = team(2, repeated(10));
  a.tba = {
    opr: null,
    dpr: null,
    ccwm: null,
    components: {
      auto_fuel: null,
      teleop_fuel: null,
      total_fuel: 0,
      auto_tower_points: null,
      endgame_tower_points: null,
      total_tower_points: null,
    },
  };
  b.tba = { ...a.tba, components: { ...a.tba.components, total_fuel: 100 } };
  const p = {
    weights: { fuel: 50, copr_fuel: 50 },
    minSamples: 3,
    minCoverage: 1,
  };
  assert.equal(scoreTeams([a, b], p)[0].score, 50);
  assert.equal(correlatedWarnings(p).length, 1);
  const disabled = { ...p, weights: { fuel: 50, copr_fuel: 0 } };
  const result = scoreTeams([a, b], disabled)[0];
  assert.equal(result.score, 100);
  assert.equal(result.contributions.length, 1);
  assert.equal(correlatedWarnings(disabled).length, 0);
});
test("profile inputs use observed passing, defense and subjective ratings; reliability is separate", () => {
  const d = matchData();
  d.post_match.observed_role = "passer_feeder";
  d.teleop.activity = {
    duration_seconds: 100,
    transitions: [
      { at_seconds: 0, state: "shuttling_passing" },
      { at_seconds: 80, state: "defending" },
    ],
  };
  d.post_match.defense_observed = true;
  d.post_match.defense_effectiveness = "strong";
  const t = team(1, [d, d, d]);
  const read = (id: string) => metrics.find((m) => m.id === id)!.read(t);
  assert.ok(Math.abs(read("passing_share").value! - 0.8) < 1e-9);
  assert.equal(read("passer_role").value, 1);
  assert.equal(read("defense_frequency").value, 1);
  assert.ok(Math.abs(read("defense_share").value! - 0.2) < 1e-9);
  assert.equal(read("defense_effectiveness").sample, 3);
  assert.match(
    metrics.find((m) => m.id === "defense_effectiveness")!.label,
    /subjective/,
  );
  assert.deepEqual(profileMetrics.reliability, [
    "full_match",
    "availability",
    "issue_free",
  ]);
  assert.equal(profileLabels.support, "Support / Shuttling-Passing");
});
test("Complement needs user configuration and has no assumed needs", () => {
  const state = defaultState();
  assert.equal(state.strategy.needs, "");
  assert.deepEqual(state.profiles.complement.weights, {});
  const teams = [team(1, repeated(20))];
  assert.equal(
    scoreTeams(
      teams,
      { ...state.profiles.complement, weights: { fuel: 100 } },
      false,
    )[0].score,
    null,
  );
  assert.equal(
    scoreTeams(
      teams,
      { ...state.profiles.complement, weights: { fuel: 100 } },
      true,
    )[0].score,
    50,
  );
});
test("manual order survives changed scores, filters and newly added teams", () => {
  const state = defaultState();
  state.manualOrder = [2, 1];
  const a = team(1, repeated(10)),
    b = team(2, repeated(20));
  assert.deepEqual(manualOrder([1, 2], state.manualOrder), [2, 1]);
  scoreTeams([a, b], { weights: { fuel: 0 }, minSamples: 3, minCoverage: 1 });
  assert.deepEqual(state.manualOrder, [2, 1]);
  assert.deepEqual(manualOrder([1, 2, 3], state.manualOrder), [2, 1, 3]);
  assert.deepEqual(moveTeam(state.manualOrder, 1, 0), [1, 2]);
  assert.deepEqual(state.manualOrder, [2, 1]);
});

test("mechanism filtering refines displayed candidates without changing scores", () => {
  const drum = team(1, repeated(30)),
    turret = team(2, repeated(20)),
    unknown = team(3, repeated(10));
  drum.mechanism = "drum";
  turret.mechanism = "turret";
  const candidates = [drum, turret, unknown];
  const fullScores = scoreTeams(candidates, defaultState().profiles.offense);
  assert.deepEqual(
    filterByMechanisms(candidates, ["drum", "turret"]).map((t) => t.teamNumber),
    [1, 2],
  );
  assert.deepEqual(
    filterByMechanisms(candidates, ["unknown"]).map((t) => t.teamNumber),
    [3],
  );
  assert.deepEqual(
    filterByMechanisms(candidates, []).map((t) => t.teamNumber),
    [1, 2, 3],
  );
  assert.deepEqual(
    scoreTeams(candidates, defaultState().profiles.offense),
    fullScores,
  );
  assert.equal(fullScores.find((score) => score.teamNumber === 2)?.score, 50);
});
test("configuration requires exclusion reasons and snapshots preserve all profile evidence", () => {
  const state = defaultState();
  state.controls[2] = { favorite: false, excluded: true, note: "" };
  assert.equal(stateSchema.safeParse(state).success, false);
  state.controls[2].note = "Unavailable robot";
  const frozen = snapshotEvidence(
    [team(1, repeated(10)), team(2, repeated(20)), team(3, repeated(30))],
    state,
    1,
    "offense",
  );
  assert.equal(frozen.teams.length, 2);
  assert.equal(Object.keys(frozen.scores).length, 6);
  state.profiles.offense.weights.fuel = 0;
  assert.equal(frozen.scores.offense[0].contributions[0].weight, 100);
  assert.equal(frozen.scores.offense[0].score, 0);
  const earlierSnapshot = JSON.parse(JSON.stringify(frozen));
  delete earlierSnapshot.teams[0].mechanism;
  delete earlierSnapshot.teams[0].pitReported;
  const restored = snapshotSchema.parse(earlierSnapshot);
  assert.equal(restored.teams[0].mechanism, "unknown");
  assert.equal(restored.teams[0].pitReported, false);
});

const specs = [
  {
    teamNumber: 1,
    robotWeightLbs: 110,
    drivetrain: "swerve",
    mechanism: "drum",
  },
  {
    teamNumber: 2,
    robotWeightLbs: 112.4,
    drivetrain: "swerve",
    mechanism: "turret",
  },
  {
    teamNumber: 3,
    robotWeightLbs: 120,
    drivetrain: "tank",
    mechanism: "turret",
  },
  {
    teamNumber: 4,
    robotWeightLbs: null,
    drivetrain: "unknown",
    mechanism: "unknown",
  },
  {
    teamNumber: 5,
    robotWeightLbs: null,
    drivetrain: "swerve",
    mechanism: "other",
  },
] satisfies Pick<
  PickTeam,
  "teamNumber" | "robotWeightLbs" | "drivetrain" | "mechanism"
>[];
const numbers = (rows: { teamNumber: number }[]) =>
  rows.map((row) => row.teamNumber);

test("pit filters combine categories with AND and selections within each category with OR", () => {
  const filters = emptyPitSpecFilters();
  assert.deepEqual(numbers(filterByPitSpecs(specs, filters)), [1, 2, 3, 4, 5]);
  assert.deepEqual(
    numbers(filterByPitSpecs(specs, { ...filters, drivetrains: ["swerve"] })),
    [1, 2, 5],
  );
  assert.deepEqual(
    numbers(filterByPitSpecs(specs, { ...filters, shooters: ["turret"] })),
    [2, 3],
  );
  assert.deepEqual(
    numbers(
      filterByPitSpecs(specs, {
        ...filters,
        drivetrains: ["swerve", "tank"],
        shooters: ["drum", "turret"],
      }),
    ),
    [1, 2, 3],
  );
  assert.deepEqual(
    numbers(
      filterByPitSpecs(specs, {
        ...filters,
        drivetrains: ["swerve"],
        shooters: ["drum", "turret"],
        maxWeight: "115",
      }),
    ),
    [1, 2],
  );
  assert.deepEqual(
    numbers(
      filterByPitSpecs(specs, {
        ...filters,
        drivetrains: ["swerve"],
        shooters: ["turret"],
        maxWeight: "115",
      }),
    ),
    [2],
  );
  assert.deepEqual(
    numbers(
      filterByPitSpecs(specs, {
        ...filters,
        drivetrains: ["unknown"],
        shooters: ["unknown"],
      }),
    ),
    [4],
  );
});

test("weight limits are optional, inclusive and decimal; unknown never satisfies an active range", () => {
  const filters = emptyPitSpecFilters();
  assert.deepEqual(weightRange(filters), { min: null, max: null, error: null });
  assert.deepEqual(
    numbers(filterByPitSpecs(specs, { ...filters, minWeight: "112.4" })),
    [2, 3],
  );
  assert.deepEqual(
    numbers(filterByPitSpecs(specs, { ...filters, maxWeight: "112.4" })),
    [1, 2],
  );
  assert.deepEqual(
    numbers(
      filterByPitSpecs(specs, {
        ...filters,
        minWeight: "112.4",
        maxWeight: "112.4",
      }),
    ),
    [2],
  );
  assert.deepEqual(
    numbers(filterByPitSpecs(specs, { ...filters, minWeight: "0" })),
    [1, 2, 3],
  );
  assert.deepEqual(
    numbers(filterByPitSpecs(specs, { ...filters, maxWeight: "0" })),
    [],
  );
  assert.deepEqual(
    numbers(filterByPitSpecs(specs, { ...filters, maxWeight: "9999" })),
    [1, 2, 3],
  );
  for (const limits of [
    { minWeight: "-1" },
    { maxWeight: "Infinity" },
    { minWeight: "abc" },
    { minWeight: "120", maxWeight: "110" },
  ]) {
    const invalid = { ...filters, ...limits };
    assert.ok(weightRange(invalid).error);
    assert.deepEqual(filterByPitSpecs(specs, invalid), []);
  }
  assert.equal(specs[3].robotWeightLbs, null);
});

test("weight sort is numeric, unknown last in either direction and does not mutate saved order", () => {
  const order = [5, 3, 2, 1, 4];
  const sorted = (direction: "weight_asc" | "weight_desc") =>
    [...specs].sort(
      (a, b) =>
        compareRobotWeight(a.robotWeightLbs, b.robotWeightLbs, direction) ||
        a.teamNumber - b.teamNumber,
    );
  assert.deepEqual(numbers(sorted("weight_asc")), [1, 2, 3, 4, 5]);
  assert.deepEqual(numbers(sorted("weight_desc")), [3, 2, 1, 4, 5]);
  assert.equal(compareRobotWeight(112.4, 112.4, "weight_desc"), 0);
  assert.equal(compareRobotWeight(null, null, "weight_asc"), 0);
  assert.deepEqual(order, [5, 3, 2, 1, 4]);
});

test("pit specifications, filtering and weight sorting cannot become profile scoring inputs", () => {
  const candidates = [
    team(1, repeated(30)),
    team(2, repeated(20)),
    team(3, repeated(10)),
  ];
  const state = defaultState();
  state.strategy.needs = "Add a scorer";
  state.profiles.complement.weights = { fuel: 100 };
  const saved = JSON.stringify(state);
  const initial = profileIds.map((id) =>
    scoreTeams(candidates, state.profiles[id]),
  );
  candidates[0].robotWeightLbs = 130;
  candidates[0].drivetrain = "tank";
  candidates[0].mechanism = "drum";
  candidates[1].robotWeightLbs = 112.4;
  candidates[1].drivetrain = "swerve";
  candidates[1].mechanism = "turret";
  const filtered = filterByPitSpecs(candidates, {
    ...emptyPitSpecFilters(),
    maxWeight: "115",
    drivetrains: ["swerve"],
    shooters: ["turret"],
  });
  assert.deepEqual(numbers(filtered), [2]);
  assert.deepEqual(
    profileIds.map((id) => scoreTeams(candidates, state.profiles[id])),
    initial,
  );
  assert.equal(initial[0].find((row) => row.teamNumber === 2)?.score, 50);
  assert.equal(JSON.stringify(state), saved);
  assert.deepEqual(
    numbers(filterByPitSpecs(candidates, emptyPitSpecFilters())),
    [1, 2, 3],
  );
});

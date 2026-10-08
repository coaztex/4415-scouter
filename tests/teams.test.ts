import test from "node:test";
import assert from "node:assert/strict";
import { matchData } from "./fixtures/rebuilt";
import {
  buildScouting,
  directoryRows,
  emptyScouting,
  formatNumber,
  roleLabels,
  type TeamDirectoryRow,
} from "../src/features/teams/model";
const eventId = "00000000-0000-4000-8000-000000000001",
  matchId = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = (teamNumber: number): TeamDirectoryRow => ({
  teamNumber,
  nickname: null,
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
  statbotics: null,
  tba: null,
  scouting: emptyScouting(),
  observations: [],
});
test("directory search and sort preserve zero while missing values always sort last", () => {
  const zero = {
    ...base(2),
    nickname: "Zero Bots",
    statbotics: {
      total: 0,
      auto: null,
      teleop: null,
      endgame: null,
      components: {
        auto_fuel: null,
        auto_tower: null,
        transition_fuel: null,
        first_shift_fuel: null,
        second_shift_fuel: null,
        endgame_fuel: null,
        endgame_tower: null,
        teleop_fuel: null,
        total_fuel: null,
        total_tower: null,
      },
    },
  };
  const missing = { ...base(1), nickname: "Missing Bots" },
    positive = {
      ...base(3),
      nickname: "Third",
      statbotics: { ...zero.statbotics!, total: 10 },
    };
  assert.deepEqual(
    directoryRows([missing, positive, zero], {
      sort: "epa",
      dir: "asc",
      q: "",
      pit: "all",
    }).rows.map((r) => r.teamNumber),
    [2, 3, 1],
  );
  assert.deepEqual(
    directoryRows([missing, positive, zero], {
      q: "zero",
      sort: "team",
      dir: "asc",
      pit: "all",
    }).rows.map((r) => r.teamNumber),
    [2],
  );
  assert.equal(formatNumber(null), "—");
  assert.equal(formatNumber(0), "0");
});

test("directory mechanism filter includes only exact pit classifications", () => {
  const rows: TeamDirectoryRow[] = [
    { ...base(1), pitMechanism: "drum", pitReported: true },
    { ...base(2), pitMechanism: "turret", pitReported: true },
    {
      ...base(3),
      pitMechanism: "other",
      pitReported: true,
      pitOtherType: "Flywheel",
    },
    base(4),
  ];
  const numbers = (mechanism: string) =>
    directoryRows(rows, { mechanism }).rows.map((row) => row.teamNumber);
  assert.deepEqual(numbers("all"), [1, 2, 3, 4]);
  assert.deepEqual(numbers("drum"), [1]);
  assert.deepEqual(numbers("turret"), [2]);
  assert.deepEqual(numbers("other"), [3]);
  assert.deepEqual(numbers("unknown"), [4]);
});
test("shared analytics excludes very uncertain FUEL but keeps the match record", () => {
  const certain = matchData(),
    uncertain = matchData();
  certain.auto.estimated_fuel_scored = 5;
  certain.teleop.estimated_fuel_scored = 15;
  uncertain.auto.estimated_fuel_scored = 100;
  uncertain.teleop.estimated_fuel_scored = 200;
  uncertain.post_match.fuel_estimate_confidence = "very_uncertain";
  uncertain.post_match.observed_role = "passer_feeder";
  const matches = [
    {
      id: matchId(1),
      tba_match_key: "2026test_qm1",
      match_number: 1,
      comp_level: "qm",
    },
    {
      id: matchId(2),
      tba_match_key: "2026test_qm2",
      match_number: 2,
      comp_level: "qm",
    },
  ];
  const result = buildScouting(
    eventId,
    [
      {
        id: matchId(11),
        match_id: matchId(1),
        team_number: 7,
        game_data: certain,
        completed_at: "2026-01-01T00:00:00Z",
      },
      {
        id: matchId(12),
        match_id: matchId(2),
        team_number: 7,
        game_data: uncertain,
        completed_at: "2026-01-01T00:01:00Z",
      },
    ],
    matches,
  );
  const metrics = result.metrics.get(7)!;
  assert.equal(metrics.sampleSize, 2);
  assert.equal(metrics.fuel.confidentSampleSize, 1);
  assert.equal(metrics.fuel.total.mean, 20);
  assert.equal(result.observations.get(7)?.length, 2);
  assert.equal(
    result.observations.get(7)?.[1].data.post_match.fuel_estimate_confidence,
    "very_uncertain",
  );
  assert.deepEqual(Object.values(roleLabels), [
    "Scorer",
    "Passer-Feeder",
    "Defender",
    "Mixed",
    "Inactive",
  ]);
  assert.ok(!Object.values(roleLabels).includes("Cycler" as never));
});
test("duplicate robot/match records use one deterministic latest canonical observation", () => {
  const older = matchData(),
    newer = matchData();
  older.auto.estimated_fuel_scored = 1;
  older.teleop.estimated_fuel_scored = 1;
  newer.auto.estimated_fuel_scored = 4;
  newer.teleop.estimated_fuel_scored = 6;
  const match = {
    id: matchId(3),
    tba_match_key: "2026test_qm3",
    match_number: 3,
    comp_level: "qm",
  };
  const result = buildScouting(
    eventId,
    [
      {
        id: matchId(20),
        match_id: match.id,
        team_number: 9,
        game_data: older,
        completed_at: "2026-01-01T00:00:00Z",
      },
      {
        id: matchId(21),
        match_id: match.id,
        team_number: 9,
        game_data: newer,
        completed_at: "2026-01-01T00:01:00Z",
      },
    ],
    [match],
  );
  assert.equal(result.metrics.get(9)?.sampleSize, 1);
  assert.equal(result.metrics.get(9)?.fuel.total.mean, 10);
  assert.equal(result.observations.get(9)?.[0].id, matchId(21));
});

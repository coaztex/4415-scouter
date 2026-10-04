import test from "node:test";
import assert from "node:assert/strict";
import { matchData, pitData } from "./fixtures/rebuilt";
import { buildScouting } from "../src/features/teams/model";
import type { TeamDirectoryRow } from "../src/features/teams/model";
import {
  autoEvidence,
  defaultMatch,
  prepSummary,
  sharedStartSides,
  upcomingMatches,
  type PrepMatch,
} from "../src/features/match-prep/model";

const eventId = "00000000-0000-4000-8000-000000000001";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const match = (n: number, result_metadata: unknown = null): PrepMatch => ({
  id: id(n),
  tba_match_key: `2026test_qm${n}`,
  comp_level: "qm",
  set_number: 1,
  match_number: n,
  scheduled_time: null,
  predicted_time: null,
  actual_time: null,
  result_metadata,
});
test("defaults to our next unplayed match and excludes scored matches without actual time", () => {
  const matches = [
    match(3),
    match(1, { red_score: 42, blue_score: 35 }),
    match(2),
  ];
  const stations = [
    { match_id: id(2), team_number: 25, alliance: "red" as const, station: 1 },
    { match_id: id(3), team_number: 25, alliance: "blue" as const, station: 2 },
  ];
  assert.deepEqual(
    upcomingMatches(matches).map((m) => m.match_number),
    [2, 3],
  );
  assert.equal(defaultMatch(matches, stations, 25)?.match_number, 2);
  assert.equal(defaultMatch(matches, stations, null), null);
});
test("observed role and FUEL confidence remain evidence based", () => {
  const certain = matchData();
  certain.post_match.observed_role = "passer_feeder";
  certain.auto.estimated_fuel_scored = 10;
  certain.teleop.estimated_fuel_scored = 20;
  const uncertain = matchData();
  uncertain.post_match.observed_role = "defender";
  uncertain.post_match.fuel_estimate_confidence = "very_uncertain";
  uncertain.auto.estimated_fuel_scored = 100;
  uncertain.teleop.estimated_fuel_scored = 100;
  const rows = [certain, uncertain].map((data, i) => ({
    id: id(10 + i),
    match_id: id(i + 1),
    team_number: 25,
    game_data: data,
    completed_at: `2026-04-0${i + 1}T00:00:00Z`,
  }));
  const matches = [match(1), match(2)].map((m) => ({
    id: m.id,
    tba_match_key: m.tba_match_key,
    match_number: m.match_number,
    set_number: 1,
    comp_level: "qm",
  }));
  const scouting = buildScouting(eventId, rows, matches);
  const row = {
    teamNumber: 25,
    scouting: scouting.metrics.get(25)!,
    observations: scouting.observations.get(25)!,
  } as TeamDirectoryRow;
  const summary = prepSummary(row);
  assert.equal(row.scouting.fuel.total.median, 30);
  assert.equal(row.scouting.fuel.total.sampleSize, 1);
  assert.equal(summary.recentUncertain, 1);
  assert.equal(summary.leadRole, "defender"); // tied roles: most recent wins
  assert.deepEqual(summary.roles, ["Passer-Feeder 1", "Defender 1"]);
  assert.ok(summary.claims.includes("Limited FUEL sample"));
  assert.ok(!summary.claims.includes("High-output scorer"));
  const pit = pitData();
  pit.autonomous_routines = [
    {
      id: id(30),
      start_side: "left",
      scores_fuel: "yes",
      collects_additional_fuel: "unknown",
      reliability_claim: "consistent",
    },
  ];
  const auto = autoEvidence(pit, row.observations);
  assert.equal(auto.observed, 2);
  assert.deepEqual(auto.sides, ["left"]);
  assert.deepEqual(
    sharedStartSides([
      { teamNumber: 25, sides: auto.sides },
      { teamNumber: 50, sides: ["left"] },
    ]),
    ["left: 25 & 50"],
  );
});

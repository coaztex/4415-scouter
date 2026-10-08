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
  selectPrepMatch,
  prepMatchStatus,
  matchLabel,
  type PrepMatch,
} from "../src/features/match-prep/model";
import { getMatchStations } from "../src/features/events/match-stations";
import { readEventCachePages } from "../src/features/events/server/cache-pages";

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

test("explicit upcoming or historical selection overrides the real next match and survives reload", () => {
  const matches = [
    match(1, { red_score: 0, blue_score: 0 }),
    match(3),
    match(2),
  ];
  const stations = [
    { match_id: id(2), team_number: 25, alliance: "red" as const, station: 2 },
  ];
  assert.equal(selectPrepMatch(matches, stations, 25).selected?.id, id(2));
  for (const key of [matches[0].tba_match_key, matches[1].tba_match_key]) {
    const selected = selectPrepMatch(matches, stations, 25, key);
    assert.equal(selected.selected?.tba_match_key, key);
    assert.equal(selected.invalidSelection, false);
    assert.deepEqual(selectPrepMatch(matches, stations, 25, key), selected);
  }
  assert.equal(prepMatchStatus(matches[0]), "Completed");
  assert.equal(prepMatchStatus(matches[1]), "Upcoming");
  assert.equal(
    prepMatchStatus({ ...match(4), actual_time: "2026-04-01T12:00:00Z" }),
    "Started · result pending",
  );
  assert.equal(matchLabel(match(42)), "Q42");
  assert.equal(matchLabel({ ...match(1), comp_level: "f" }), "F1");
  assert.equal(
    matchLabel({ ...match(1), comp_level: "sf", set_number: 2 }),
    "SF2",
  );
});

test("no upcoming match leaves manual browsing available; a changed event rejects stale selection", () => {
  const completed = [match(1, { red_score: 100, blue_score: 50 })];
  const stations = [
    { match_id: id(1), team_number: 25, alliance: "red" as const, station: 1 },
  ];
  assert.equal(selectPrepMatch(completed, stations, 25).selected, null);
  assert.equal(
    selectPrepMatch(completed, stations, 25, completed[0].tba_match_key)
      .selected?.id,
    id(1),
  );
  assert.equal(selectPrepMatch(completed, stations, null).selected, null);
  assert.equal(selectPrepMatch([], [], 25).selected, null);
  const otherEvent = [{ ...match(2), tba_match_key: "2026other_qm2" }];
  const stale = selectPrepMatch(otherEvent, [], 25, completed[0].tba_match_key);
  assert.equal(stale.invalidSelection, true);
  assert.equal(stale.selected, null);
});

test("canonical station helper preserves R1/R2/R3/B1/B2/B3 regardless of team or insertion order", () => {
  const rows = [
    { alliance: "blue", station: 3, team_number: 300 },
    { alliance: "red", station: 2, team_number: 50 },
    { alliance: "blue", station: 1, team_number: 900 },
    { alliance: "red", station: 3, team_number: 1000 },
    { alliance: "red", station: 1, team_number: 700 },
    { alliance: "blue", station: 2, team_number: 20 },
  ] as const;
  const before = JSON.stringify(rows);
  const lineup = getMatchStations(rows),
    flat = [...lineup.red, ...lineup.blue];
  assert.deepEqual(
    flat.map((s) => s.stationLabel),
    ["R1", "R2", "R3", "B1", "B2", "B3"],
  );
  assert.deepEqual(
    flat.map((s) => s.team_number),
    [700, 50, 1000, 900, 20, 300],
  );
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(getMatchStations([]), { red: [], blue: [] });
});

test("cached schedule reader includes later pages instead of truncating stations", async () => {
  const rows = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const ranges: number[] = [];
  const read = await readEventCachePages(async (from, to) => {
    ranges.push(from);
    return { data: rows.slice(from, to + 1), error: null };
  });
  assert.equal(read.length, 1203);
  assert.deepEqual(ranges, [0, 500, 1000]);
  await assert.rejects(
    readEventCachePages(async () => ({ data: null, error: "unavailable" })),
    /cache unavailable/,
  );
});

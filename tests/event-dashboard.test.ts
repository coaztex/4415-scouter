import test from "node:test";
import assert from "node:assert/strict";
import {
  dashboardMatches,
  type DashboardMatch,
} from "../src/features/events/dashboard";

function match(
  number: number,
  played: boolean,
  teams: number[],
): DashboardMatch {
  return {
    id: String(number),
    tba_match_key: `2026test_qm${number}`,
    comp_level: "qm",
    set_number: 1,
    match_number: number,
    scheduled_time: null,
    actual_time: null,
    winning_alliance: played ? "red" : null,
    result_metadata: played ? { red_score: 120, blue_score: 80 } : null,
    stations: teams.map((team_number, index) => ({
      team_number,
      alliance: index % 2 ? "blue" : "red",
    })),
  };
}

test("active overview features our next unplayed match and keeps recent results distinct", () => {
  const result = dashboardMatches(
    [
      match(4, false, [4415]),
      match(2, true, [33]),
      match(3, true, [44]),
      match(1, true, [55]),
    ],
    4415,
    true,
  );
  assert.equal(result.featured?.id, "4");
  assert.equal(result.kind, "our-next");
  assert.deepEqual(
    result.recent.map((row) => row.id),
    ["3", "2", "1"],
  );
  assert.equal(result.completedCount, 3);
});

test("overview falls back to the latest scored match without an upcoming team match", () => {
  const result = dashboardMatches(
    [match(1, true, [4415]), match(2, true, [22]), match(3, false, [33])],
    4415,
    true,
  );
  assert.equal(result.featured?.id, "2");
  assert.equal(result.kind, "latest");
  assert.deepEqual(
    result.recent.map((row) => row.id),
    ["1"],
  );
});

test("archived and empty schedules do not imply a next team match", () => {
  const archived = dashboardMatches([match(1, false, [4415])], 4415, false);
  assert.equal(archived.kind, "upcoming");
  assert.equal(archived.featured?.id, "1");
  assert.equal(dashboardMatches([], 4415, true).featured, null);
});

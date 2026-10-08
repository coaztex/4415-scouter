import test from "node:test";
import assert from "node:assert/strict";
import { createRequire, Module } from "node:module";
import {
  emptyScouting,
  type TeamDirectoryRow,
} from "../src/features/teams/model";

const load = createRequire(`${process.cwd()}/tests/match-prep-query.test.ts`);
const calls: { table: string; field: string; value: unknown }[] = [];
const matches = [1, 2, 3].map((n) => ({
  id: `match-${n}`,
  event_id: "event",
  tba_match_key: `2026test_qm${n}`,
  comp_level: "qm",
  set_number: 1,
  match_number: n,
  scheduled_time: null,
  predicted_time: null,
  actual_time: null,
  result_metadata: n === 1 ? { red_score: 0, blue_score: 0 } : null,
}));
const teams = [700, 50, 1000, 900, 20, 300];
const positions = [4, 1, 3, 0, 5, 2];
const stations = matches.flatMap((m) =>
  positions.map((i) => ({
    event_id: "event",
    match_id: m.id,
    team_number: teams[i],
    alliance: i < 3 ? "red" : "blue",
    station: (i % 3) + 1,
  })),
);
const tables: Record<string, Record<string, unknown>[]> = {
  events: [
    { id: "event", our_team_number: 700 },
    { id: "other", our_team_number: null },
  ],
  matches: [
    ...matches,
    {
      ...matches[0],
      id: "other-match",
      event_id: "other",
      tba_match_key: "2026other_qm1",
    },
  ],
  match_teams: stations,
  pit_scouting_submissions: [],
  match_prep_notes: [
    {
      match_id: "match-1",
      note: "Review cached match",
      updated_at: "2026-10-06T12:00:00Z",
    },
  ],
};
function from(table: string) {
  let rows = tables[table] ?? [];
  const builder = {
    select() {
      return builder;
    },
    eq(field: string, value: unknown) {
      calls.push({ table, field, value });
      rows = rows.filter((r) => r[field] === value);
      return builder;
    },
    in(field: string, values: unknown[]) {
      rows = rows.filter((r) => values.includes(r[field]));
      return builder;
    },
    order() {
      return builder;
    },
    range(start: number, end: number) {
      rows = rows.slice(start, end + 1);
      return builder;
    },
    limit(limit: number) {
      rows = rows.slice(0, limit);
      return builder;
    },
    async single() {
      return { data: rows[0], error: null };
    },
    async maybeSingle() {
      return { data: rows[0] ?? null, error: null };
    },
    then(
      resolve: (value: {
        data: Record<string, unknown>[];
        error: null;
      }) => unknown,
    ) {
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    },
  };
  return builder;
}
function stub(path: string, exports: object) {
  const resolved = load.resolve(path),
    stubModule = new Module(resolved);
  stubModule.exports = exports;
  stubModule.loaded = true;
  load.cache[resolved] = stubModule;
}
stub("../src/lib/auth/server", {
  async requireRole(role: string) {
    assert.equal(role, "strategy");
    return { db: { from } };
  },
});
stub("next/navigation", {
  redirect(url: string) {
    throw new Error(`redirect:${url}`);
  },
});
stub("../src/features/teams/server/queries", {
  async getTeamDirectory(key: string) {
    return {
      event: {
        id: key === "2026other" ? "other" : "event",
        tba_key: key,
        status: "active",
        timezone: "UTC",
      },
      rows: teams.map(
        (teamNumber) =>
          ({
            teamNumber,
            nickname: "Cached team",
            rank: 5,
            scouting: emptyScouting(),
            observations: [],
            statbotics: { total: 42 },
            tba: { components: { total_fuel: 30 } },
          }) as unknown as TeamDirectoryRow,
      ),
    };
  },
});
const { getMatchPrep } = load(
  "../src/features/match-prep/server/queries",
) as typeof import("../src/features/match-prep/server/queries");

test("real Match Prep query defaults to our next match and includes completed matches in selector", async () => {
  const prep = await getMatchPrep("2026test");
  assert.equal(prep.selected?.tba_match_key, "2026test_qm2");
  assert.deepEqual(
    prep.matches.map((m) => m.tba_match_key),
    ["2026test_qm1", "2026test_qm2", "2026test_qm3"],
  );
  assert.deepEqual(
    prep.lineup.map((s) => s.stationLabel),
    ["R1", "R2", "R3", "B1", "B2", "B3"],
  );
  assert.deepEqual(
    prep.teams.map((t) => t.station.team_number),
    teams,
  );
});
test("manual upcoming and completed selection share cached evidence, with no fabricated internal observations", async () => {
  const upcoming = await getMatchPrep("2026test", "2026test_qm3");
  assert.equal(upcoming.selected?.id, "match-3");
  const prep = await getMatchPrep("2026test", "2026test_qm1");
  assert.equal(prep.selectedIsPlayed, true);
  assert.equal(prep.teams.length, 6);
  assert.equal(prep.note?.note, "Review cached match");
  for (const team of prep.teams) {
    assert.equal(team.row?.scouting.fuel.total.median, null);
    assert.equal(team.row?.scouting.sampleSize, 0);
    assert.equal(team.row?.statbotics?.total, 42);
    assert.equal(team.row?.tba?.components.total_fuel, 30);
    assert.equal(team.pit, null);
  }
  assert.equal(
    (await getMatchPrep("2026test", "2026test_qm1")).selected?.id,
    prep.selected?.id,
  );
});
test("changing events scopes cached reads and redirects an invalid match selection to the new event", async () => {
  await assert.rejects(
    getMatchPrep("2026other", "2026test_qm1"),
    /redirect:\/events\/2026other\/match-prep$/,
  );
  const prep = await getMatchPrep("2026other");
  assert.equal(prep.selected, null);
  assert.equal(prep.matches.length, 1);
  assert.equal(prep.matches[0].tba_match_key, "2026other_qm1");
  assert.ok(
    calls.some(
      (c) =>
        c.table === "matches" && c.field === "event_id" && c.value === "other",
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.table === "match_teams" &&
        c.field === "event_id" &&
        c.value === "other",
    ),
  );
});

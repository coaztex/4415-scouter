import { test } from "node:test";
import assert from "node:assert/strict";
import match from "./fixtures/tba-2026-matches.json";
import coprs from "./fixtures/tba-2026-coprs.json";
import statbotics from "./fixtures/statbotics-2026-mock.json";
import {
  parseOfficialAlliance2026,
  parseCopr2026,
} from "../src/games/2026-rebuilt/official";
import {
  reconcileAlliance2026,
  fuelDifference,
} from "../src/games/2026-rebuilt/reconciliation";
import { normalizeTeamEvent } from "../src/lib/statbotics/schemas";
import { TbaClient } from "../src/lib/tba/client";
import { fetchSnapshot } from "../src/features/events/server/tba-sync";
import { getGameModule } from "../src/games/registry";
import { parseGameData } from "../src/games/core/module";
import { matchData } from "./fixtures/rebuilt";
import {
  matchData as oldMatch,
  pitData as oldPit,
} from "./fixtures/rebuilt-v1";

test("recorded TBA breakdown uses FUEL counts, not alliance total points", () => {
  const r = parseOfficialAlliance2026(match.score_breakdown.red)!;
  assert.deepEqual(r.fuel, { auto: 130, teleop: 552, total: 682 });
  assert.equal(r.tower.totalPoints, 0);
  assert.deepEqual(r.tower.autoRobots, ["None", "None", "None"]);
  assert.equal(
    parseOfficialAlliance2026({ hubScore: { autoCount: 0, extra: 1 } })?.fuel
      .teleop,
    null,
  );
  assert.equal(
    parseOfficialAlliance2026({ hubScore: { autoCount: 0 } })?.fuel.auto,
    0,
  );
  assert.equal(
    parseOfficialAlliance2026({ hubScore: { autoCount: "0" } }),
    null,
  );
  assert.equal(parseOfficialAlliance2026(null), null);
});
test("COPR exact component names, negatives, missing and extra components", () => {
  const values = Object.fromEntries(
    Object.entries(coprs).map(([key, map]) => [key, map.frc4414]),
  );
  const parsed = parseCopr2026(values);
  assert.equal(parsed.auto_fuel, coprs["Hub Auto Fuel Count"].frc4414);
  assert.equal(parsed.teleop_fuel, coprs["Hub Teleop Fuel Count"].frc4414);
  assert.equal(parsed.total_fuel, coprs["Hub Total Fuel Count"].frc4414);
  assert.equal(
    parseCopr2026({ "Hub Auto Fuel Count": -1, future: 99 }).auto_fuel,
    -1,
  );
  assert.equal(parseCopr2026({ autoFuel: 42 }).auto_fuel, null);
});
test("existing TBA client and snapshot carry breakdowns and COPRs once for a played event", async () => {
  const paths: string[] = [];
  const client = new TbaClient({
    key: "synthetic",
    retries: 0,
    fetcher: async (url) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      if (path.endsWith("/matches")) return Response.json([match]);
      if (path.endsWith("/teams"))
        return Response.json(
          [
            ...match.alliances.red.team_keys,
            ...match.alliances.blue.team_keys,
          ].map((key) => ({ key, team_number: Number(key.slice(3)) })),
        );
      if (path.endsWith("/coprs"))
        return Response.json({ ...coprs, "Future component": { frc4414: 17 } });
      if (
        path.endsWith("/rankings") ||
        path.endsWith("/oprs") ||
        path.endsWith("/alliances")
      )
        return Response.json(null);
      return Response.json({
        key: match.event_key,
        name: "Recorded fixture",
        year: 2026,
      });
    },
  });
  const snapshot = await fetchSnapshot(client, match.event_key, "2026-rebuilt");
  assert.deepEqual(snapshot.matches[0].score_breakdown, match.score_breakdown);
  assert.equal(snapshot.coprs?.["Future component"].frc4414, 17);
  assert.equal(paths.filter((p) => p.endsWith("/coprs")).length, 1);
});
test("Statbotics 2026 source-shaped mock exposes exact components, never invented values or predictions", () => {
  const n = normalizeTeamEvent(statbotics);
  assert.equal(n.epa_total, 120);
  assert.equal(n.epa_auto, 25);
  assert.equal(n.epa_teleop, 70);
  assert.equal(n.epa_endgame, 25);
  assert.equal(n.components_2026?.teleop_fuel, 85);
  assert.equal(n.components_2026?.endgame_tower, 10);
  assert.equal(n.source_updated_at, null);
  assert.equal(n.payload.epa?.breakdown?.future_component, 3);
  assert.ok(!("record" in n.payload));
  const missing = normalizeTeamEvent({
    team: 1,
    event: "2026fixture",
    epa: { breakdown: { auto_fuel: 0 } },
  });
  assert.equal(missing.components_2026?.auto_fuel, 0);
  assert.equal(missing.components_2026?.total_fuel, null);
  assert.equal(
    normalizeTeamEvent({ team: 1, event: "2027fixture", epa: statbotics.epa })
      .components_2026,
    null,
  );
  assert.throws(() =>
    normalizeTeamEvent({
      team: 1,
      event: "2026fixture",
      epa: { breakdown: { auto_fuel: "1" } },
    }),
  );
});
test("alliance reconciliation reports deviations without altering individual records", () => {
  const rows = match.alliances.red.team_keys.map((key, i) => {
    const data = matchData();
    data.auto.estimated_fuel_scored = 40;
    data.teleop.estimated_fuel_scored = 180;
    if (i === 1) data.post_match.fuel_estimate_confidence = "very_uncertain";
    return {
      id: String(i),
      eventKey: match.event_key,
      matchKey: match.key,
      teamNumber: Number(key.slice(3)),
      schemaVersion: 2 as const,
      data,
    };
  });
  const before = JSON.stringify(rows),
    r = reconcileAlliance2026(match, "red", rows);
  assert.equal(r.status, "ready");
  if (r.status !== "ready") assert.fail();
  assert.equal(r.auto.absoluteDifference, 10);
  assert.equal(r.teleop.absoluteDifference, 12);
  assert.equal(r.total.absoluteDifference, 22);
  assert.equal(r.auto.percentageDifference, (100 * 10) / 130);
  assert.deepEqual(r.contributingSubmissionIds, ["0", "1", "2"]);
  assert.ok(r.hasVeryUncertainFuel);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(
    reconcileAlliance2026(match, "red", rows.slice(0, 2)).status,
    "incomplete",
  );
  assert.throws(() =>
    reconcileAlliance2026(match, "red", [rows[0], rows[0], rows[2]]),
  );
  assert.throws(() =>
    reconcileAlliance2026(match, "red", [
      { ...rows[0], matchKey: "wrong" },
      ...rows.slice(1),
    ]),
  );
  assert.equal(
    reconcileAlliance2026({ ...match, score_breakdown: null }, "red", rows)
      .status,
    "unavailable",
  );
  rows[0].data.auto.estimated_fuel_scored = null;
  const partial = reconcileAlliance2026(match, "red", rows);
  assert.equal(
    partial.status === "ready" ? partial.auto.absoluteDifference : 99,
    null,
  );
  assert.deepEqual(fuelDifference(0, 0), {
    estimate: 0,
    official: 0,
    absoluteDifference: 0,
    percentageDifference: null,
  });
  assert.equal(fuelDifference(5, 0).percentageDifference, null);
});
test("legacy registry reads old semantics and latest module rejects legacy payloads", () => {
  const v1 = getGameModule("2026-rebuilt", 1),
    v2 = getGameModule("2026-rebuilt");
  const envelope = {
    game_slug: "2026-rebuilt",
    schema_version: 1,
    game_data: oldMatch(),
  };
  assert.deepEqual(parseGameData(v1, envelope, "match"), oldMatch());
  assert.deepEqual(
    parseGameData(v1, { ...envelope, game_data: oldPit() }, "pit"),
    oldPit(),
  );
  assert.throws(() => parseGameData(v2, envelope, "match"));
  assert.throws(() => v2.parseMatch(oldMatch()));
});

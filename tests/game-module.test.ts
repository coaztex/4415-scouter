import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGameData } from "../src/games/core/module";
import { getGameModule, listGameModules } from "../src/games/registry";
import { rebuilt2026 } from "../src/games/2026-rebuilt";
import { formatMetric } from "../src/games/core/format";
import { matchData, pitData } from "./fixtures/rebuilt";

test("registry selects a module/version and fails closed for unsupported seasons", () => {
  assert.equal(getGameModule("2026-rebuilt"), rebuilt2026);
  assert.equal(getGameModule("2026-rebuilt", 2), rebuilt2026);
  assert.equal(getGameModule("2026-rebuilt", 1).schemaVersion, 1);
  assert.throws(() => getGameModule("2027-future"));
  assert.throws(() => getGameModule("2026-rebuilt", 3));
  assert.throws(() => getGameModule("2026-rebuilt", NaN));
  assert.deepEqual(listGameModules(), [
    {
      slug: "2026-rebuilt",
      year: 2026,
      displayName: "REBUILT",
      schemaVersion: 2,
    },
  ]);
});
test("game envelope validates schema version, slug, and payload", () => {
  const envelope = {
    game_slug: "2026-rebuilt",
    schema_version: 2,
    game_data: matchData(),
  };
  assert.deepEqual(parseGameData(rebuilt2026, envelope, "match"), matchData());
  assert.deepEqual(
    parseGameData(rebuilt2026, { ...envelope, game_data: pitData() }, "pit"),
    pitData(),
  );
  const oldPit: Record<string, unknown> = { ...pitData() };
  delete oldPit.robot_weight_lbs;
  assert.equal(
    (
      parseGameData(
        rebuilt2026,
        { ...envelope, game_data: oldPit },
        "pit",
      ) as ReturnType<typeof pitData>
    ).robot_weight_lbs,
    null,
  );
  assert.throws(() =>
    parseGameData(rebuilt2026, { ...envelope, schema_version: 3 }, "match"),
  );
  assert.throws(() =>
    parseGameData(rebuilt2026, { ...envelope, game_slug: "2027-new" }, "match"),
  );
  assert.throws(() =>
    parseGameData(rebuilt2026, { ...envelope, game_data: [] }, "match"),
  );
});
test("metric formatting preserves zero and represents absence separately", () => {
  assert.equal(formatMetric(null, "decimal"), "—");
  assert.equal(formatMetric(0, "integer"), "0");
  assert.equal(formatMetric(0, "percent"), "0%");
  assert.equal(formatMetric(0.25, "percent"), "25%");
  assert.throws(() => formatMetric(NaN, "decimal"));
});
test("presentation IDs and feature config refer to numeric aggregate fields", () => {
  const metrics = rebuilt2026.aggregateTeam([]);
  const ids = new Set(rebuilt2026.metrics.map((metric) => metric.id));
  assert.equal(ids.size, rebuilt2026.metrics.length);
  for (const metric of rebuilt2026.metrics) {
    let value: unknown = metrics;
    for (const key of metric.id.split(".")) {
      assert.ok(value !== null && typeof value === "object" && key in value);
      value = Reflect.get(value, key);
    }
    assert.ok(value === null || typeof value === "number");
  }
  for (const id of [
    ...rebuilt2026.features.matchPrep.metricIds,
    ...rebuilt2026.features.picklist.metricIds,
    rebuilt2026.features.picklist.defaultSortMetric,
  ])
    assert.ok(ids.has(id));
});

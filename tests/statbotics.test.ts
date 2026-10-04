import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTeamEvent } from "../src/lib/statbotics/schemas";
import {
  StatboticsClient,
  StatboticsError,
} from "../src/lib/statbotics/client";
import {
  syncStatboticsForEvent,
  type StatboticsRepository,
} from "../src/features/events/server/statbotics-sync";

const event = { id: "synthetic", tba_key: "2026fixture" };
const row = {
  team: 1,
  event: event.tba_key,
  time: 1234,
  epa: {
    total_points: 0,
    breakdown: { auto_points: 0, teleop_points: 12, custom_game_metric: 7 },
  },
  record: { total: { wins: 0 } },
};
test("Statbotics normalizes zero, absent phase data, and evolving source fields", () => {
  const result = normalizeTeamEvent(row);
  assert.equal(result.epa_total, 0);
  assert.equal(result.epa_auto, 0);
  assert.equal(result.epa_teleop, 12);
  assert.equal(result.epa_endgame, null);
  assert.equal(result.source_updated_at, null);
  assert.equal(result.payload.epa?.breakdown?.custom_game_metric, 7);
  assert.equal(
    normalizeTeamEvent({ team: 1, event: event.tba_key }).epa_total,
    null,
  );
  assert.equal(
    normalizeTeamEvent({ ...row, epa: { total_points: { mean: 3 } } })
      .epa_total,
    3,
  );
  assert.equal(
    normalizeTeamEvent({ ...row, updated_at: "2026-09-23T00:00:00Z" })
      .source_updated_at,
    "2026-09-23T00:00:00Z",
  );
  assert.throws(() =>
    normalizeTeamEvent({ ...row, epa: { total_points: "3" } }),
  );
});
test("Statbotics uses one public event request, validates identities and rejects duplicates", async () => {
  const client = new StatboticsClient(async (url, init) => {
    assert.equal(
      String(url),
      "https://api.statbotics.io/v3/team_events?event=2026fixture&limit=1000",
    );
    assert.deepEqual(init?.headers, { Accept: "application/json" });
    assert.ok(init?.signal);
    return Response.json([row]);
  });
  assert.equal((await client.teamEvents(event.tba_key))[0].epa_total, 0);
  for (const rows of [
    [{ ...row, event: "2026wrong" }],
    [row, row],
    [{ ...row, team: -1 }],
  ]) {
    await assert.rejects(
      new StatboticsClient(async () => Response.json(rows)).teamEvents(
        event.tba_key,
      ),
      StatboticsError,
    );
  }
});
test("bounded transient retries and no retries for malformed/permanent responses", async () => {
  for (const [status, expected] of [
    [503, 3],
    [401, 1],
    [404, 1],
  ]) {
    let count = 0;
    const client = new StatboticsClient(
      async () => {
        count++;
        return new Response("untrusted body", { status });
      },
      async () => {},
    );
    await assert.rejects(client.teamEvents(event.tba_key), StatboticsError);
    assert.equal(count, expected);
  }
  let count = 0;
  await assert.rejects(
    new StatboticsClient(async () => {
      count++;
      return Response.json({ error: "unavailable" });
    }).teamEvents(event.tba_key),
  );
  assert.equal(count, 1);
});
test("sync records safe failure without throwing or changing existing metrics; retry can succeed", async () => {
  let committed = 0,
    failed = 0;
  const repository: StatboticsRepository = {
    async commit(_event, _attempt, rows) {
      committed++;
      assert.equal(rows[0].epa_total, 0);
    },
    async failed(_event, _attempt, message) {
      failed++;
      assert.ok(!message.includes("private diagnostics"));
    },
  };
  const bad = new StatboticsClient(
    async () => {
      throw new Error("private diagnostics");
    },
    async () => {},
  );
  assert.equal(
    (await syncStatboticsForEvent(event, repository, bad)).ok,
    false,
  );
  assert.equal(committed, 0);
  assert.equal(failed, 1);
  assert.equal(
    (
      await syncStatboticsForEvent(
        event,
        repository,
        new StatboticsClient(async () => Response.json([row])),
      )
    ).ok,
    true,
  );
  assert.equal(committed, 1);
  assert.equal(
    (
      await syncStatboticsForEvent(
        event,
        {
          async commit() {
            throw Error();
          },
          async failed() {
            throw Error();
          },
        },
        new StatboticsClient(async () => Response.json([])),
      )
    ).ok,
    false,
  );
});

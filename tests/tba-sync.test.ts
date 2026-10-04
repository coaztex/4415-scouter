import { test } from "node:test";
import assert from "node:assert/strict";
import { TbaClient } from "../src/lib/tba/client";
import {
  previewEvent,
  syncTbaEvent,
  type SyncSnapshot,
} from "../src/features/events/server/tba-sync";
import { isAtLeastRole } from "../src/lib/auth/roles";

function mockClient(paths: string[], broken = false) {
  return new TbaClient({
    key: "synthetic",
    retries: 0,
    fetcher: async (url) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      if (path.endsWith("/teams"))
        return Response.json([{ key: "frc1", team_number: 1 }]);
      if (path.endsWith("/matches"))
        return broken ? new Response(null, { status: 503 }) : Response.json([]);
      if (path.endsWith("/rankings") || path.endsWith("/oprs"))
        return Response.json(null);
      return Response.json({
        key: "2026fixture",
        year: 2026,
        name: "Synthetic fixture",
      });
    },
  });
}
test("preview validates metadata before teams and does not write or fetch unrelated endpoints", async () => {
  const paths: string[] = [];
  const result = await previewEvent(mockClient(paths), "2026fixture");
  assert.equal(result.teamCount, 1);
  assert.deepEqual(paths, [
    "/api/v3/event/2026fixture",
    "/api/v3/event/2026fixture/teams",
  ]);
});
test("sync commits one complete snapshot and skips unused endpoints", async () => {
  const paths: string[] = [];
  const snapshots: SyncSnapshot[] = [];
  const result = await syncTbaEvent(
    mockClient(paths),
    {
      commit: async (snapshot) => {
        snapshots.push(snapshot);
        return "event-id";
      },
      failed: async () => assert.fail("unexpected failure"),
    },
    "2026fixture",
    "2026-rebuilt",
  );
  assert.equal(result.eventId, "event-id");
  assert.equal(snapshots.length, 1);
  assert.equal(paths.length, 5);
  assert.equal(snapshots[0].oprs, null);
  assert.equal(snapshots[0].alliances, null);
  assert.equal(
    paths.some((path) => /media|statuses|coprs|alliances/.test(path)),
    false,
  );
});
test("partial provider failure never commits; failure state contains safe diagnostics", async () => {
  let failed = false;
  await assert.rejects(
    syncTbaEvent(
      mockClient([], true),
      {
        commit: async () => {
          assert.fail("partial snapshot committed");
        },
        failed: async (_key, _at, error) => {
          failed = true;
          assert.equal(error.includes("synthetic"), false);
        },
      },
      "2026fixture",
      "2026-rebuilt",
    ),
  );
  assert.equal(failed, true);
});
test("role hierarchy never grants admin to a scout/strategist", () => {
  assert.equal(isAtLeastRole("scout", "admin"), false);
  assert.equal(isAtLeastRole("strategy", "admin"), false);
  assert.equal(isAtLeastRole("admin", "admin"), true);
  assert.equal(isAtLeastRole("admin", "scout"), true);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeNexusInspection,
  inspectionLabel,
} from "../src/lib/nexus/inspection";
import {
  syncNexusInspection,
  type InspectionRepository,
  type InspectionSyncWrite,
  type NexusInspectionCache,
} from "../src/features/events/server/nexus-inspection-sync";
import { syncNexusForEvent } from "../src/features/events/server/nexus-repository";
import { nexusAssignments, nexusFullMap } from "./fixtures/nexus";
import { normalizeNexusPitMap } from "../src/lib/nexus/normalize";
import { NexusError } from "../src/lib/nexus/client";

const event = { id: "synthetic", tba_key: "2026cass", nexus_event_key: null };
const now = new Date("2026-10-08T22:00:00Z");
const snapshot = {
  "101": { inspected: true, status: "complete" },
  "202": { inspected: false, status: "queued", queuePosition: 1 },
  "303": { inspected: true, status: "reinspection", queuePosition: 2 },
};

function repository() {
  let cache: NexusInspectionCache | null = null;
  const writes: InspectionSyncWrite[] = [];
  const repo: InspectionRepository = {
    read: async () => cache,
    commit: async (write) => {
      writes.push(write);
      cache = {
        sourceEventKey:
          write.snapshot === null
            ? (cache?.sourceEventKey ?? write.sourceEventKey)
            : write.sourceEventKey,
        snapshot: write.snapshot ?? cache?.snapshot ?? null,
        fetchedAt: write.snapshot
          ? write.attemptedAt
          : (cache?.fetchedAt ?? null),
        lastAttemptAt: write.attemptedAt,
        lastAttemptKey: write.sourceEventKey,
        status: write.status,
        lastError: write.message,
      };
      return true;
    },
  };
  return { repo, writes, value: () => cache };
}

test("inspection normalization preserves reinspection, queue position and unknown future statuses", () => {
  assert.deepEqual(normalizeNexusInspection(snapshot), snapshot);
  assert.equal(inspectionLabel(snapshot["303"]), "Reinspection · queue #2");
  assert.equal(inspectionLabel({ status: "new-status" }), "new-status");
  assert.equal(inspectionLabel({}), "Unknown");
  assert.throws(() =>
    normalizeNexusInspection({ "101": { inspected: "yes" } }),
  );
  assert.throws(() =>
    normalizeNexusInspection({ "101": { queuePosition: -1 } }),
  );
  assert.throws(() =>
    normalizeNexusInspection({ frc101: { inspected: true } }),
  );
});

test("inspection refreshes after five minutes and forced refresh bypasses cache", async () => {
  const state = repository();
  let calls = 0;
  const client = {
    inspection: async (key: string) => {
      assert.equal(key, "2026cass");
      calls++;
      return snapshot;
    },
  };
  await syncNexusInspection(event, state.repo, client, { now });
  await syncNexusInspection(event, state.repo, client, { now });
  assert.equal(calls, 1);
  await syncNexusInspection(event, state.repo, client, {
    now: new Date(now.getTime() + 300_000),
  });
  assert.equal(calls, 2);
  await syncNexusInspection(event, state.repo, client, { now, force: true });
  assert.equal(calls, 3);
});

test("missing, malformed and failed inspection responses preserve the prior snapshot", async (t) => {
  t.mock.method(console, "error", () => {});
  for (const client of [
    { inspection: async () => null },
    { inspection: async () => ({ "101": { inspected: "bad" } }) },
    {
      inspection: async () => {
        throw new NexusError("http", 503);
      },
    },
  ]) {
    const state = repository();
    await syncNexusInspection(
      event,
      state.repo,
      { inspection: async () => snapshot },
      { now },
    );
    const result = await syncNexusInspection(event, state.repo, client, {
      now: new Date(now.getTime() + 1000),
      force: true,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(state.value()?.snapshot, snapshot);
    assert.equal(state.value()?.fetchedAt, now.toISOString());
    assert.equal(state.writes.at(-1)?.snapshot, null);
  }
});

test("Nexus orchestration fetches addresses and inspection for the exact key even without geometry", async (t) => {
  t.mock.method(console, "error", () => {});
  const old = process.env.NEXUS_API_KEY;
  process.env.NEXUS_API_KEY = "test-key";
  try {
    const urls: string[] = [],
      writes: { name: string; payload: unknown }[] = [];
    let active = 0,
      maxActive = 0;
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request) => {
        const url = String(input);
        urls.push(url);
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        assert.ok(url.startsWith("https://frc.nexus/api/v1/event/2026cass/"));
        return url.endsWith("/pits")
          ? Response.json(nexusAssignments)
          : url.endsWith("/inspection")
            ? Response.json(snapshot)
            : new Response('"No map."', { status: 404 });
      },
    );
    const db = {
      from: (name: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: name === "events" ? event : null,
              error: null,
            }),
          }),
        }),
      }),
      rpc: async (name: string, payload: unknown) => {
        writes.push({ name, payload });
        return { data: true, error: null };
      },
    } as unknown as Parameters<typeof syncNexusForEvent>[0];
    const result = await syncNexusForEvent(db, event.id, true);
    assert.equal(result.ok, true);
    assert.equal(urls.length, 3);
    assert.equal(maxActive, 2);
    assert.match(result.message, /no graphical pit map/);
    assert.match(result.message, /inspection synced for 2026cass: 3 teams/);
    assert.deepEqual(
      writes.map((write) => write.name),
      ["store_nexus_pit_map", "store_nexus_inspection"],
    );
  } finally {
    if (old === undefined) delete process.env.NEXUS_API_KEY;
    else process.env.NEXUS_API_KEY = old;
  }
});

test("inspection still refreshes while a successful map remains cached", async (t) => {
  const old = process.env.NEXUS_API_KEY;
  process.env.NEXUS_API_KEY = "test-key";
  try {
    const urls: string[] = [];
    t.mock.method(
      globalThis,
      "fetch",
      async (input: string | URL | Request) => {
        urls.push(String(input));
        return Response.json(snapshot);
      },
    );
    const at = new Date().toISOString();
    const cachedMap = {
      event_id: event.id,
      source: "nexus",
      source_event_key: "2026cass",
      layout: normalizeNexusPitMap(nexusAssignments, nexusFullMap).layout,
      fetched_at: at,
      status: "succeeded",
      last_attempt_at: at,
      last_attempt_key: "2026cass",
      last_error: null,
    };
    const db = {
      from: (name: string) => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                name === "events"
                  ? event
                  : name === "event_pit_maps"
                    ? cachedMap
                    : null,
              error: null,
            }),
          }),
        }),
      }),
      rpc: async () => ({ data: true, error: null }),
    } as unknown as Parameters<typeof syncNexusForEvent>[0];
    await syncNexusForEvent(db, event.id);
    assert.deepEqual(urls, [
      "https://frc.nexus/api/v1/event/2026cass/inspection",
    ]);
  } finally {
    if (old === undefined) delete process.env.NEXUS_API_KEY;
    else process.env.NEXUS_API_KEY = old;
  }
});

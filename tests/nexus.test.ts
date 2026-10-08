import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NexusClient, NexusError } from "../src/lib/nexus/client";
import {
  normalizeNexusAssignments,
  normalizeNexusPitMap,
} from "../src/lib/nexus/normalize";
import { nexusEventKey } from "../src/lib/nexus/schemas";
import { getOptionalNexusEnvironment } from "../src/lib/server/env";
import {
  cachedEventPitMap,
  readPitMapCache,
  type PitMapCache,
} from "../src/features/pit-map/server/cache";
import {
  hasPitGeometry,
  pitAssignmentsByTeam,
  withPitAssignments,
} from "../src/features/pit-map/model";
import {
  syncPitMapForEvent,
  type NexusRepository,
  type PitMapSyncWrite,
} from "../src/features/events/server/nexus-sync";
import {
  nexusAssignments,
  nexusAssignmentArray,
  nexusWrappedAssignments,
  nexusFullMap,
  nexusMalformedOptionalMap,
  nexusMissingMap,
} from "./fixtures/nexus";
const event = {
  id: "10000000-0000-4000-8000-000000000001",
  tba_key: "2026test",
};
const now = new Date("2026-10-05T12:00:00Z");
const normalized = normalizeNexusPitMap(nexusAssignments, nexusFullMap).layout;
function repository(initial: PitMapCache | null = null) {
  let stored = initial;
  const writes: PitMapSyncWrite[] = [];
  const repo: NexusRepository = {
    async read() {
      return stored;
    },
    async commit(write) {
      writes.push(write);
      stored = {
        eventId: write.eventId,
        source: "nexus",
        sourceEventKey: write.layout
          ? write.sourceEventKey
          : (stored?.sourceEventKey ?? write.sourceEventKey),
        layout: write.layout ?? stored?.layout ?? null,
        fetchedAt: write.layout
          ? write.attemptedAt
          : (stored?.fetchedAt ?? null),
        status: write.status,
        lastAttemptAt: write.attemptedAt,
        lastAttemptKey: write.sourceEventKey,
        lastError: write.message,
      };
      return true;
    },
  };
  return { repo, writes, value: () => stored };
}
const client =
  (pits: unknown = nexusAssignments, map: unknown = nexusFullMap) =>
  () => ({ pits: async () => pits, map: async () => map });

test("Nexus assignment shapes normalize once, omit bad/ambiguous entries, and preserve missing teams", () => {
  const expected = [
    { teamNumber: 101, pitLabel: "A1" },
    { teamNumber: 202, pitLabel: "A2" },
  ];
  for (const input of [
    nexusAssignments,
    nexusAssignmentArray,
    nexusWrappedAssignments,
  ])
    assert.deepEqual(normalizeNexusAssignments(input).assignments, expected);
  const dirty = normalizeNexusAssignments([
    ...nexusAssignmentArray,
    { teamNumber: 101, pitLabel: "Z9" },
    { teamNumber: -1, pitLabel: "B1" },
    null,
  ]);
  assert.deepEqual(dirty.assignments, [expected[1]]);
  assert.ok(dirty.warnings.length);
  assert.equal(pitAssignmentsByTeam(normalized).get(303), undefined);
  assert.throws(() => normalizeNexusAssignments({ pits: "invalid" }));
});

test("full map geometry is provider-independent and optional malformed objects are omitted", () => {
  assert.equal(normalized.width, 800);
  assert.deepEqual(normalized.pits[0], {
    id: "A1",
    pitLabel: "A1",
    teamNumber: 101,
    x: 10,
    y: 20,
    width: 80,
    height: 80,
  });
  assert.equal(normalized.pits[2].teamNumber, null);
  assert.equal(normalized.walls.length, 1);
  assert.equal(normalized.areas[0].label, "Pit admin");
  assert.equal(normalized.labels[0].text, "Exit");
  assert.deepEqual(
    normalized.arrows.map((r) => r.angle),
    [90, 0],
  );
  const malformed = normalizeNexusPitMap(
    nexusAssignments,
    nexusMalformedOptionalMap,
  );
  assert.equal(malformed.layout.walls.length, 1);
  assert.equal(malformed.layout.areas.length, 0);
  assert.equal(malformed.layout.labels.length, 0);
  assert.ok(malformed.warnings.length);
  assert.equal(
    normalizeNexusPitMap(null, nexusFullMap).layout.assignments.length,
    2,
  );
  const conflicting = normalizeNexusPitMap(
    { "404": "A1" },
    nexusFullMap,
  ).layout;
  assert.equal(conflicting.pits[0].teamNumber, 404);
  assert.ok(!conflicting.assignments.some((row) => row.teamNumber === 101));
});

test("assignment-only data has no invented geometry and absent data stays optional", () => {
  const assignmentsOnly = normalizeNexusPitMap(
    nexusAssignments,
    nexusMissingMap,
  ).layout;
  assert.equal(hasPitGeometry(assignmentsOnly), false);
  assert.equal(assignmentsOnly.width, null);
  assert.deepEqual(assignmentsOnly.pits, []);
  assert.equal(pitAssignmentsByTeam(assignmentsOnly).get(101), "A1");
  assert.deepEqual(normalizeNexusPitMap(null, null).layout.assignments, []);
});

test("Nexus credentials are optional/server-only and sent only to the fixed host header", async () => {
  const old = { ...process.env };
  try {
    delete process.env.NEXUS_API_KEY;
    process.env.NEXT_PUBLIC_NEXUS_API_KEY = "ignored-public-value";
    assert.equal(getOptionalNexusEnvironment(), null);
    process.env.NEXUS_API_KEY = "synthetic-test-secret";
    assert.equal(getOptionalNexusEnvironment()?.key, "synthetic-test-secret");
  } finally {
    process.env = old;
  }
  assert.match(
    readFileSync("src/lib/nexus/client.ts", "utf8"),
    /^import "server-only"/,
  );
  const requests: string[] = [];
  const api = new NexusClient({
    key: "synthetic-test-secret",
    fetcher: async (url, options) => {
      requests.push(String(url));
      assert.equal(new URL(String(url)).origin, "https://frc.nexus");
      assert.equal(
        new Headers(options?.headers).get("Nexus-Api-Key"),
        "synthetic-test-secret",
      );
      assert.equal(options?.redirect, "error");
      assert.equal(options?.cache, "no-store");
      assert.ok(!String(url).includes("secret"));
      return new Response(null, { status: 404 });
    },
  });
  assert.equal(await api.map("demo1234"), null);
  assert.equal(await api.pits("demo1234"), null);
  assert.equal(requests.length, 2);
  await assert.rejects(api.map("../private"));
  assert.equal(requests.length, 2);
});

test("Nexus transport retries transient failures finitely, rejects oversized/bad bodies, and sanitizes errors", async () => {
  let requests = 0;
  const api = new NexusClient({
    key: "private-test-value",
    sleep: async () => {},
    fetcher: async () => {
      requests++;
      return new Response("private-test-value", { status: 503 });
    },
  });
  await assert.rejects(
    api.map("2026test"),
    (error: unknown) =>
      error instanceof NexusError &&
      !error.message.includes("private-test-value"),
  );
  assert.equal(requests, 3);
  for (const response of [
    new Response("not JSON"),
    new Response("{}", { headers: { "Content-Length": "2000001" } }),
    new Response("{}", { status: 403 }),
  ]) {
    let count = 0;
    await assert.rejects(
      new NexusClient({
        key: "private-test-value",
        fetcher: async () => {
          count++;
          return response;
        },
      }).pits("2026test"),
    );
    assert.equal(count, 1);
  }
});

test("pit map sync uses event override, retains a fresh/negative cache and permits forced admin refresh", async () => {
  const state = repository();
  const keys: string[] = [];
  const resources = () => ({
    pits: async (key: string) => {
      keys.push(key);
      return nexusAssignments;
    },
    map: async (key: string) => {
      keys.push(key);
      return nexusFullMap;
    },
  });
  const override = { ...event, nexus_event_key: "demo_alt" };
  assert.equal(nexusEventKey(override), "demo_alt");
  assert.equal(
    (await syncPitMapForEvent(override, state.repo, resources, { now })).status,
    "succeeded",
  );
  assert.deepEqual(keys, ["demo_alt", "demo_alt"]);
  assert.equal(
    (
      await syncPitMapForEvent(
        override,
        state.repo,
        () => {
          throw Error("Must not fetch");
        },
        { now },
      )
    ).status,
    "cached",
  );
  await syncPitMapForEvent(override, state.repo, resources, {
    now,
    force: true,
  });
  assert.equal(keys.length, 4);
  const missing = repository();
  assert.equal(
    (await syncPitMapForEvent(event, missing.repo, client(null, null), { now }))
      .status,
    "unavailable",
  );
  assert.equal(
    (
      await syncPitMapForEvent(
        event,
        missing.repo,
        () => {
          throw Error("No retry loop");
        },
        { now },
      )
    ).status,
    "cached",
  );
  assert.equal(missing.writes.length, 1);
  assert.equal(
    (await syncPitMapForEvent(event, repository().repo, () => null, { now }))
      .status,
    "unconfigured",
  );
});

test("partial/failing Nexus resources preserve useful cache and never throw through scouting", async () => {
  const state = repository();
  const initial = await syncPitMapForEvent(
    event,
    state.repo,
    client(nexusAssignments, null),
    { now },
  );
  assert.equal(initial.status, "partial");
  assert.match(initial.message, /no graphical pit map/);
  assert.equal(state.value()?.layout?.assignments.length, 2);
  await syncPitMapForEvent(event, state.repo, client(), { now, force: true });
  const failing = () => ({
    pits: async () => {
      throw new NexusError("network");
    },
    map: async () => {
      throw new NexusError("http", 500);
    },
  });
  const failure = await syncPitMapForEvent(event, state.repo, failing, {
    now: new Date(now.getTime() + 1000),
    force: true,
  });
  assert.equal(failure.status, "failed");
  assert.equal(state.value()?.fetchedAt, now.toISOString());
  assert.equal(state.value()?.layout?.pits.length, 3);
  assert.equal(state.writes.at(-1)?.layout, null);
  const brokenMap = () => ({
    pits: async () => ({ "101": "A2" }),
    map: async () => {
      throw new NexusError("network");
    },
  });
  await syncPitMapForEvent(event, state.repo, brokenMap, { now, force: true });
  assert.equal(state.value()?.layout?.pits[1].teamNumber, 101);
  assert.equal(state.value()?.layout?.width, 800);
  const unavailableDb: NexusRepository = {
    read: async () => null,
    commit: async () => {
      throw Error("database down");
    },
  };
  assert.equal(
    (await syncPitMapForEvent(event, unavailableDb, client(), { now })).ok,
    false,
  );
});

test("cache expiry, changed overrides and failed-attempt backoff allow bounded subsequent sync", async () => {
  const state = repository();
  await syncPitMapForEvent(event, state.repo, client(), { now });
  const expired = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  await syncPitMapForEvent(event, state.repo, client(), { now: expired });
  assert.equal(state.writes.length, 2);
  await syncPitMapForEvent(
    { ...event, nexus_event_key: "demo_new" },
    state.repo,
    client(),
    { now: expired },
  );
  assert.equal(state.writes.length, 3);
  assert.equal(state.value()?.sourceEventKey, "demo_new");
  const failing = () => ({
    pits: async () => {
      throw new NexusError("network");
    },
    map: async () => {
      throw new NexusError("network");
    },
  });
  await syncPitMapForEvent(event, state.repo, failing, { now: expired });
  const count = state.writes.length;
  const result = await syncPitMapForEvent(
    event,
    state.repo,
    () => {
      throw Error("No early retry");
    },
    { now: new Date(expired.getTime() + 30 * 60 * 1000) },
  );
  assert.equal(result.status, "cached");
  assert.equal(state.writes.length, count);
  await syncPitMapForEvent(event, state.repo, client(), {
    now: new Date(expired.getTime() + 60 * 60 * 1000),
  });
  assert.equal(state.writes.length, count + 1);
  const manual = repository({ ...state.value()!, source: "manual" });
  assert.equal(
    (
      await syncPitMapForEvent(
        event,
        manual.repo,
        () => {
          throw Error("Keep manual layout");
        },
        { now },
      )
    ).status,
    "cached",
  );
  await syncPitMapForEvent(event, manual.repo, client(), { now, force: true });
  assert.equal(manual.writes.length, 1);
});

test("optional cache read returns null for DB errors and rejects unreadable layout without a provider call", async () => {
  const db = (result: unknown) =>
    ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => result }) }),
      }),
    }) as unknown as Parameters<typeof readPitMapCache>[0];
  assert.equal(
    await readPitMapCache(
      db({ data: null, error: { code: "42P01" } }),
      event.id,
    ),
    null,
  );
  assert.equal(
    await readPitMapCache(db({ data: null, error: null }), event.id),
    null,
  );
  const row = {
    event_id: event.id,
    source: "nexus",
    source_event_key: event.tba_key,
    layout: { bad: true },
    fetched_at: now.toISOString(),
    status: "succeeded",
    last_attempt_at: now.toISOString(),
    last_attempt_key: event.tba_key,
    last_error: null,
  };
  assert.equal(
    cachedEventPitMap(
      await readPitMapCache(db({ data: row, error: null }), event.id),
    ),
    null,
  );
  const map = cachedEventPitMap(
    await readPitMapCache(
      db({ data: { ...row, layout: normalized }, error: null }),
      event.id,
    ),
  );
  assert.equal(map?.eventId, event.id);
  assert.equal(map?.pits[0].teamNumber, 101);
  const geometryOnly = {
    ...nexusFullMap,
    pits: Object.fromEntries(
      Object.entries(nexusFullMap.pits).map(([key, pit]) => [
        key,
        { position: pit.position, size: pit.size },
      ]),
    ),
  };
  const joined = normalizeNexusPitMap(nexusAssignments, geometryOnly).layout;
  assert.deepEqual(
    joined.pits.map((p) => p.teamNumber),
    [101, 202, null],
  );
  const legacyLayout = {
    ...joined,
    pits: joined.pits.map((p) => ({ ...p, teamNumber: null })),
  };
  const repaired = await readPitMapCache(
    db({ data: { ...row, layout: legacyLayout }, error: null }),
    event.id,
  );
  assert.equal(cachedEventPitMap(repaired)?.pits[0].teamNumber, 101);
  assert.equal(repaired?.layout?.pits[1].teamNumber, 202);
  assert.equal(legacyLayout.pits[0].teamNumber, null);
  assert.deepEqual(repaired?.layout?.walls, joined.walls);
  assert.deepEqual(repaired?.layout?.areas, joined.areas);
  const idOnly = {
    ...legacyLayout,
    pits: legacyLayout.pits.map((pit) => ({ ...pit, pitLabel: null })),
  };
  assert.equal(
    withPitAssignments(idOnly, joined.assignments).pits[0].teamNumber,
    101,
  );
  const ambiguous = withPitAssignments(idOnly, [
    { teamNumber: 101, pitLabel: "A1" },
    { teamNumber: 999, pitLabel: "A1" },
  ]);
  assert.equal(ambiguous.pits[0].teamNumber, null);
});

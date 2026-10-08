import test from "node:test";
import assert from "node:assert/strict";
import { pitMapStatus } from "../src/features/pit-map/status";
import {
  fitMap,
  pitBounds,
  mapViewBounds,
  fitMapBounds,
  panMap,
  pinchMap,
  zoomMap,
} from "../src/features/pit-map/viewport";
import {
  connectPitPresence,
  pitPresenceSnapshot,
  type PitPresenceSnapshot,
} from "../src/features/pit-map/presence";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { emptyPitMapLayout } from "../src/features/pit-map/model";

test("Pits bounds include all rectangles with 7.5 percent padding and preserve nonzero coordinates", () => {
  const pits = [
    {
      id: "A1",
      pitLabel: "A1",
      teamNumber: 101,
      x: 100,
      y: 200,
      width: 80,
      height: 100,
    },
    {
      id: "A2",
      pitLabel: "A2",
      teamNumber: null,
      x: 200,
      y: 250,
      width: 100,
      height: 50,
    },
  ];
  const bounds = pitBounds(pits)!;
  assert.equal(bounds.x, 85);
  assert.equal(bounds.y, 192.5);
  assert.ok(Math.abs(bounds.width - 230) < 1e-10);
  assert.ok(Math.abs(bounds.height - 115) < 1e-10);
  const view = fitMapBounds(bounds, 320, 300);
  assert.ok(view.scale > 1);
  assert.ok(
    Math.abs((bounds.x + bounds.width / 2) * view.scale + view.x - 160) < 1e-10,
  );
  assert.ok(
    Math.abs((bounds.y + bounds.height / 2) * view.scale + view.y - 150) <
      1e-10,
  );
  const map = { ...emptyPitMapLayout(), width: 8000, height: 6000, pits };
  assert.deepEqual(mapViewBounds(map, "pits"), bounds);
  assert.deepEqual(mapViewBounds(map, "venue"), {
    x: 0,
    y: 0,
    width: 8000,
    height: 6000,
  });
  assert.ok(
    fitMapBounds(mapViewBounds(map, "venue")!, 320, 300).scale <
      view.scale / 10,
  );
  assert.equal(pits[0].x, 100); // Bounds never translate/crop source coordinates.
  assert.equal(pitBounds([]), null);
  assert.deepEqual(
    mapViewBounds({ ...map, pits: [] }, "pits"),
    mapViewBounds(map, "venue"),
  );
  assert.equal(mapViewBounds(emptyPitMapLayout(), "pits"), null);
});

test("live activity overrides completion and only actual roster teams are interactive", () => {
  const known = new Set([101, 202, 303]),
    complete = new Set([202]),
    active = new Set([202, 303]);
  assert.equal(pitMapStatus(101, known, complete, active), "not_scouted");
  assert.equal(pitMapStatus(202, known, complete, new Set()), "complete");
  assert.equal(pitMapStatus(202, known, complete, active), "in_progress");
  assert.equal(pitMapStatus(303, known, complete, active), "in_progress");
  assert.equal(pitMapStatus(null, known, complete, active), "unassigned");
  assert.equal(pitMapStatus(404, known, complete, active), "unassigned");
});

test("fit, pan and pinch keep map anchors stable and zoom bounded on phone and desktop", () => {
  const fit = fitMap(1000, 600, 320, 300);
  assert.ok(fit.scale > 0 && fit.scale < 1);
  assert.ok(fit.x >= 16 && fit.y >= 16);
  const anchor = { x: 140, y: 120 };
  const zoom = zoomMap(fit, 2, anchor, fit.scale);
  assert.equal(
    (anchor.x - zoom.x) / zoom.scale,
    (anchor.x - fit.x) / fit.scale,
  );
  assert.equal(
    (anchor.y - zoom.y) / zoom.scale,
    (anchor.y - fit.y) / fit.scale,
  );
  assert.equal(zoomMap(fit, 1e9, anchor, fit.scale).scale, fit.scale * 20);
  assert.equal(zoomMap(fit, 1e-9, anchor, fit.scale).scale, fit.scale * 0.75);
  assert.deepEqual(panMap(fit, { x: 20, y: -10 }), {
    ...fit,
    x: fit.x + 20,
    y: fit.y - 10,
  });
  const pinch = pinchMap(
    fit,
    [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ],
    [
      { x: 60, y: 120 },
      { x: 260, y: 120 },
    ],
    fit.scale,
  );
  assert.equal(pinch.scale, fit.scale * 2);
  assert.ok(Number.isFinite(pinch.x));
  assert.ok(fitMap(1000, 600, 1400, 700).scale > fit.scale);
});

function transport() {
  let subscribed: (status: string) => void = () => {},
    sync: () => void = () => {};
  let state = {};
  const tracked: unknown[] = [],
    updates: PitPresenceSnapshot[] = [];
  let untracked = 0,
    removed = 0,
    created = 0;
  const channel = {
    on(_type: string, _filter: unknown, callback: () => void) {
      sync = callback;
      return channel;
    },
    subscribe(callback: (status: string) => void) {
      subscribed = callback;
      return channel;
    },
    presenceState() {
      return state;
    },
    async track(value: unknown) {
      tracked.push(value);
      return "ok";
    },
    async untrack() {
      untracked++;
      return "ok";
    },
    teardown() {},
  };
  const client = {
    channel(topic: string, options: unknown) {
      assert.equal(topic, "pit-presence:event");
      assert.deepEqual(options, {
        config: { private: true, presence: { key: "own" } },
      });
      created++;
      return channel;
    },
    async removeChannel() {
      removed++;
      return "ok";
    },
  } as unknown as Parameters<typeof connectPitPresence>[0];
  return {
    client,
    updates,
    tracked,
    status: (s: string) => subscribed(s),
    sync: (value: unknown) => {
      state = value as object;
      sync();
    },
    counts: () => ({ untracked, removed, created }),
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("presence joins a private event channel, warns only about other sessions, and clears disconnects", async () => {
  const t = transport(),
    connection = connectPitPresence(
      t.client,
      "event",
      101,
      (v) => t.updates.push(v),
      "own",
    );
  await flush();
  t.status("SUBSCRIBED");
  await flush();
  assert.deepEqual(t.tracked, [{ teamNumber: 101 }]);
  t.sync({
    own: [{ teamNumber: 101 }],
    other: [{ teamNumber: 101 }, { teamNumber: 202 }, { teamNumber: -1 }],
    invalid: [{ teamNumber: "303" }],
  });
  assert.deepEqual(t.updates.at(-1), {
    activeTeams: [101, 202],
    otherTeams: [101, 202],
    available: true,
  });
  const ownOnly = pitPresenceSnapshot(
    { own: [{ teamNumber: 101 }] } as unknown as ReturnType<
      RealtimeChannel["presenceState"]
    >,
    "own",
  );
  assert.deepEqual(ownOnly.otherTeams, []);
  connection.visibility(false);
  await flush();
  assert.equal(t.counts().untracked, 1);
  connection.visibility(true);
  await flush();
  assert.equal(t.tracked.length, 2);
  t.status("CHANNEL_ERROR");
  assert.deepEqual(t.updates.at(-1), {
    activeTeams: [],
    otherTeams: [],
    available: false,
  });
  t.status("SUBSCRIBED");
  await flush();
  assert.equal(t.tracked.length, 3);
  connection.dispose();
  connection.dispose();
  await flush();
  assert.equal(t.counts().removed, 1);
  const count = t.tracked.length;
  t.status("SUBSCRIBED");
  await flush();
  assert.equal(t.tracked.length, count);
});

test("route cleanup finishes before same-topic rejoin; observers never publish fake activity", async () => {
  const t = transport(),
    first = connectPitPresence(t.client, "event", null, () => {}, "own");
  await flush();
  t.status("SUBSCRIBED");
  assert.equal(t.tracked.length, 0);
  first.dispose();
  const second = connectPitPresence(t.client, "event", 202, () => {}, "own");
  await flush();
  assert.equal(t.counts().removed, 1);
  assert.equal(t.counts().created, 2);
  t.status("SUBSCRIBED");
  await flush();
  assert.deepEqual(t.tracked, [{ teamNumber: 202 }]);
  second.dispose();
  await flush();
  const third = connectPitPresence(t.client, "event", 303, () => {}, "own");
  third.dispose();
  await flush();
  assert.equal(t.counts().created, 2); // Unmounted before the asynchronous join.
});

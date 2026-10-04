import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  parseTbaNotification,
  verifyTbaHmac,
} from "../src/features/events/server/tba-webhook";
import {
  shouldCheckLiveRefresh,
  tbaAutoRefreshSeconds,
} from "../src/features/events/server/live-refresh";
import {
  liveChangeEvents,
  liveChangeFilter,
} from "../src/features/events/live-update-policy";

test("webhook HMAC authenticates exact raw bytes and rejects malformed signatures", () => {
  const body = Buffer.from('{"message_type":"ping"}');
  const signature = createHmac("sha256", "test-secret")
    .update(body)
    .digest("hex");
  assert.equal(verifyTbaHmac(body, signature, "test-secret"), true);
  assert.equal(
    verifyTbaHmac(
      Buffer.from('{ "message_type":"ping"}'),
      signature,
      "test-secret",
    ),
    false,
  );
  assert.equal(verifyTbaHmac(body, null, "test-secret"), false);
  assert.equal(verifyTbaHmac(body, "garbage", "test-secret"), false);
  assert.equal(verifyTbaHmac(body, signature, "wrong-secret"), false);
});

test("only cache-relevant TBA messages request event refresh", () => {
  assert.deepEqual(
    parseTbaNotification({
      message_type: "match_score",
      message_data: {
        match: { event_key: "2026cascmp" },
      },
    }),
    { type: "refresh", eventKey: "2026cascmp" },
  );
  assert.deepEqual(
    parseTbaNotification({
      message_type: "schedule_updated",
      message_data: {
        event_key: "2026cascmp",
      },
    }),
    { type: "refresh", eventKey: "2026cascmp" },
  );
  assert.deepEqual(
    parseTbaNotification({
      message_type: "alliance_selection",
      message_data: {
        event_key: "2026cascmp",
      },
    }),
    { type: "refresh", eventKey: "2026cascmp" },
  );
  assert.deepEqual(
    parseTbaNotification({
      message_type: "match_video",
      message_data: {
        event_key: "2026cascmp",
      },
    }),
    { type: "ignored" },
  );
  assert.deepEqual(
    parseTbaNotification({
      message_type: "match_score",
      message_data: {
        event_key: "../../bad",
      },
    }),
    { type: "ignored" },
  );
});

test("automatic refresh checks only stale active competition events", () => {
  const now = new Date("2026-09-28T18:00:00Z");
  const event = {
    status: "active",
    start_date: "2026-09-28",
    end_date: "2026-09-29",
    last_tba_sync_at: "2026-09-28T17:54:00Z",
  };
  assert.equal(shouldCheckLiveRefresh(event, now, 300), true);
  assert.equal(
    shouldCheckLiveRefresh(
      { ...event, last_tba_sync_at: "2026-09-28T17:59:00Z" },
      now,
      300,
    ),
    false,
  );
  assert.equal(
    shouldCheckLiveRefresh({ ...event, status: "archived" }, now),
    false,
  );
  assert.equal(
    shouldCheckLiveRefresh({ ...event, start_date: null }, now),
    false,
  );
  assert.equal(
    shouldCheckLiveRefresh({ ...event, end_date: "2026-09-25" }, now),
    false,
  );
  assert.equal(
    shouldCheckLiveRefresh({ ...event, last_tba_sync_at: null }, now),
    true,
  );
});

test("refresh interval accepts bounded configuration and defaults safely", () => {
  const original = process.env.TBA_REFRESH_INTERVAL_SECONDS;
  try {
    process.env.TBA_REFRESH_INTERVAL_SECONDS = "600";
    assert.equal(tbaAutoRefreshSeconds(), 600);
    process.env.TBA_REFRESH_INTERVAL_SECONDS = "1";
    assert.equal(tbaAutoRefreshSeconds(), 300);
    delete process.env.TBA_REFRESH_INTERVAL_SECONDS;
    assert.equal(tbaAutoRefreshSeconds(), 300);
  } finally {
    if (original === undefined) delete process.env.TBA_REFRESH_INTERVAL_SECONDS;
    else process.env.TBA_REFRESH_INTERVAL_SECONDS = original;
  }
});

test("scouting coverage uses one event-scoped safe signal", () => {
  const eventId = "00000000-0000-4000-8000-000000000031";
  assert.deepEqual(liveChangeEvents("scouting_coverage_signal"), [
    "INSERT",
    "UPDATE",
  ]);
  assert.equal(
    liveChangeFilter(eventId, "scouting_coverage_signal"),
    `event_id=eq.${eventId}`,
  );
  assert.equal(liveChangeFilter(eventId, "events"), `id=eq.${eventId}`);
});

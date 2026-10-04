import test from "node:test";
import assert from "node:assert/strict";
import {
  makeLargeEvent,
  LARGE_FIXTURE_EVENT_KEY,
  LARGE_FIXTURE_TIMEZONE,
} from "../scripts/fixtures/large-event";
import { assertLocalStatus } from "../scripts/synthetic-event";
import { aggregateEvent } from "../src/games/2026-rebuilt/aggregate";
import { reconcileAlliance2026 } from "../src/games/2026-rebuilt/reconciliation";
import { eventTime } from "../src/features/events/timezone";

test("large event is deterministic, realistic in scale, and visibly synthetic", () => {
  const a = makeLargeEvent(2026);
  const b = makeLargeEvent(2026);
  assert.deepEqual(a, b);
  assert.notEqual(a.eventId, makeLargeEvent(2027).eventId);
  assert.match(a.event.name, /^SYNTHETIC/);
  assert.equal(a.teams.length, 60);
  assert.equal(a.matches.length, 83);
  assert.equal(a.matches.filter((m) => m.comp_level === "qm").length, 72);
  assert.deepEqual(
    new Set(a.matches.map((m) => m.comp_level)),
    new Set(["qm", "qf", "sf", "ef", "f"]),
  );
  assert.equal(a.submissions.length, 295);
  assert.equal(a.avatarTeams.length, 12);
  assert.ok(a.external.length > 70 && a.external.length < 120);
});

test("schedule, details, pit, and coverage cases coexist", () => {
  const a = makeLargeEvent();
  const completed = a.matches.filter(
    (m) => m.actual_time && m.result_metadata.red_score >= 0,
  );
  assert.equal(completed.length, 50);
  assert.ok(a.matches.some((m) => m.actual_time === null));
  assert.ok(
    completed.some(
      (m) => m.result_metadata.red_score === m.result_metadata.blue_score,
    ),
  );
  assert.ok(completed.some((m) => m.raw_tba_payload.videos));
  assert.ok(completed.some((m) => !m.raw_tba_payload.videos));
  assert.ok(completed.some((m) => m.raw_tba_payload.score_breakdown));
  assert.ok(completed.some((m) => !m.raw_tba_payload.score_breakdown));
  assert.deepEqual(
    new Set(a.members.map((m) => m.pit_status)),
    new Set(["completed", "in_progress", "not_scouted", "needs_review"]),
  );
  assert.deepEqual(
    new Set(a.pitReports.map((p) => p.game_data.primary_scoring_mechanism)),
    new Set(["drum", "turret", "other", "unknown"]),
  );
  assert.ok(a.assignments.some((s) => s.status === "missed"));
  assert.ok(a.assignments.some((s) => s.status === "in_progress"));
  const q47 = a.matches.find((m) => m.key.endsWith("_qm47"))!;
  assert.equal(a.assignments.filter((s) => s.match_id === q47.id).length, 5);
  const q66 = a.matches.find((m) => m.key.endsWith("_qm66"))!;
  assert.equal(a.assignments.filter((s) => s.match_id === q66.id).length, 5);
  const breaks = a.assignments.filter((s) => s.assignment_type === "break");
  assert.equal(breaks.length, 144);
  assert.ok(
    Array.from(
      { length: 8 },
      (_, scout) => breaks.filter((s) => s.scoutIndex === scout).length,
    ).every((n) => n >= 16),
  );
  const workloads = Array.from(
    { length: 8 },
    (_, scout) =>
      a.assignments.filter(
        (s) => s.assignment_type === "match" && s.scoutIndex === scout,
      ).length,
  );
  assert.ok(Math.max(...workloads) - Math.min(...workloads) <= 5);
});

test("hundreds of observations create distributions without conflating reliability and FUEL", () => {
  const a = makeLargeEvent();
  const records = a.submissions.map((s) => ({
    eventId: a.eventId,
    matchId: s.match_id,
    teamNumber: s.team_number,
    data: s.game_data,
  }));
  const stats = aggregateEvent(records);
  assert.equal(stats.teams.length, 60);
  assert.ok(stats.teams.every((t) => t.metrics.sampleSize >= 4));
  assert.ok(
    stats.teams.some(
      (t) =>
        t.metrics.fuel.teleop.mean !== stats.teams[0].metrics.fuel.teleop.mean,
    ),
  );
  assert.ok(
    a.submissions.some((s) => s.game_data.post_match.reliability === "DNS"),
  );
  assert.ok(
    a.submissions.some((s) => s.game_data.post_match.reliability === "DNF"),
  );
  assert.ok(
    a.submissions.some(
      (s) => s.game_data.post_match.reliability === "major_issue",
    ),
  );
  assert.ok(
    a.submissions.some(
      (s) =>
        s.game_data.post_match.fuel_estimate_confidence === "very_uncertain",
    ),
  );
  assert.ok(
    a.submissions.some(
      (s) => s.game_data.post_match.observed_role === "passer_feeder",
    ),
  );
  const passingDurations = new Set(
    a.submissions.flatMap((s) =>
      s.game_data.teleop.activity?.transitions[0]?.state === "shuttling_passing"
        ? [s.game_data.teleop.activity.transitions[1]?.at_seconds]
        : [],
    ),
  );
  assert.ok(passingDurations.size >= 3);
  assert.ok(
    a.submissions.some(
      (s) => s.game_data.post_match.observed_role === "defender",
    ),
  );
  assert.ok(a.submissions.some((s) => s.game_data.teleop.activity === null));
  assert.ok(
    a.submissions.filter((s) => s.game_data.post_match.climb !== "none")
      .length < 10,
  );
  const inclusive = aggregateEvent(records, { includeVeryUncertainFuel: true });
  assert.ok(
    inclusive.overall.fuel.teleop.sampleSize >
      stats.overall.fuel.teleop.sampleSize,
  );
});

test("official discrepancy is inspectable without changing scout values", () => {
  const a = makeLargeEvent();
  const match = a.matches.find((m) => m.key.endsWith("_qm7"))!;
  const red = a.submissions.filter(
    (s) =>
      s.match_id === match.id &&
      match.roster.slice(0, 3).includes(s.team_number),
  );
  const original = red.map((s) => s.game_data.teleop.estimated_fuel_scored);
  const result = reconcileAlliance2026(
    match.raw_tba_payload,
    "red",
    red.map((s) => ({
      id: s.id,
      eventKey: LARGE_FIXTURE_EVENT_KEY,
      matchKey: match.key,
      teamNumber: s.team_number,
      schemaVersion: 2 as const,
      data: s.game_data,
    })),
  );
  assert.equal(result.status, "ready");
  if (result.status === "ready")
    assert.ok(result.teleop.absoluteDifference! > 100);
  assert.deepEqual(
    red.map((s) => s.game_data.teleop.estimated_fuel_scored),
    original,
  );
});

test("event timestamps display in its configured IANA timezone", () => {
  const a = makeLargeEvent();
  assert.equal(a.event.timezone, LARGE_FIXTURE_TIMEZONE);
  assert.match(
    eventTime(a.matches[0].scheduled_time, a.event.timezone)!,
    /8:00 AM PDT/,
  );
  assert.match(
    eventTime(a.matches[36].scheduled_time, a.event.timezone)!,
    /Oct 3, 2026/,
  );
});

test("fixture operations reject remote service endpoints", () => {
  const local = {
    API_URL: "http://127.0.0.1:54321",
    DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    SERVICE_ROLE_KEY: "local-only",
    PUBLISHABLE_KEY: "local-only",
  };
  assert.deepEqual(assertLocalStatus(local), local);
  assert.throws(() =>
    assertLocalStatus({ ...local, API_URL: "https://project.supabase.co" }),
  );
  assert.throws(() =>
    assertLocalStatus({
      ...local,
      DB_URL: "postgresql://postgres:p@db.example.com/postgres",
    }),
  );
  assert.throws(() =>
    assertLocalStatus({
      ...local,
      DB_URL: "postgresql://app:p@127.0.0.1:54322/postgres",
    }),
  );
});

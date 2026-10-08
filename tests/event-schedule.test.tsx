import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  coverageIndex,
  groups,
  isPlayed,
  matchGroup,
  matchScores,
  matchDetailsHref,
  matchPrepHref,
  officialMatchLabel,
  readableMatchLabel,
  orderedMatches,
  robotCoverage,
  deriveSchedulePosition,
  scheduleFreshness,
  resultLabel,
  matchTimeLabel,
  currentEvidenceExpiresAt,
  type OfficialMatch,
} from "../src/features/event-schedule/model";
import { eventTime, isEventTimezone } from "../src/features/events/timezone";
import { MatchCard } from "../src/features/event-schedule/components/match-card";
import { rebuiltBreakdownRows } from "../src/games/2026-rebuilt/score-breakdown";
import type { Json } from "../src/types/database";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const match = (
  overrides: Omit<Partial<OfficialMatch>, "result_metadata"> & {
    result_metadata?: Json;
  } = {},
) => ({
  id: id(1),
  tba_match_key: "2026test_qm1",
  comp_level: "qm",
  set_number: 1,
  match_number: 1,
  scheduled_time: "2026-01-02T18:00:00Z",
  actual_time: null,
  winning_alliance: null,
  result_metadata: null as Json,
  ...overrides,
});

test("event schedule groups and orders official matches", () => {
  assert.deepEqual(groups, ["all", "qual", "playoff", "final"]);
  assert.equal(matchGroup("qm"), "qual");
  assert.equal(matchGroup("qf"), "playoff");
  assert.equal(matchGroup("f"), "final");
  const ordered = orderedMatches([
    match({
      id: id(3),
      tba_match_key: "2026test_f1m1",
      comp_level: "f",
      match_number: 1,
    }),
    match({
      id: id(2),
      tba_match_key: "2026test_qf1m1",
      comp_level: "qf",
      match_number: 1,
    }),
    match({ id: id(1), tba_match_key: "2026test_qm4", match_number: 4 }),
  ]);
  assert.deepEqual(
    ordered.map((row) => row.tba_match_key),
    ["2026test_qm4", "2026test_qf1m1", "2026test_f1m1"],
  );
  assert.equal(officialMatchLabel(ordered[0]), "Q4");
  assert.equal(officialMatchLabel(ordered[1]), "QF1");
  assert.equal(officialMatchLabel(ordered[2]), "F1");
});

test("readable match names preserve phase and multi-match set numbers", () => {
  assert.equal(
    readableMatchLabel(match({ match_number: 7 })),
    "Qualification 7",
  );
  assert.equal(
    readableMatchLabel(match({ comp_level: "ef", set_number: 2 })),
    "Eighth-Final 2",
  );
  assert.equal(
    readableMatchLabel(match({ comp_level: "qf", set_number: 3 })),
    "Quarter-Final 3",
  );
  assert.equal(
    readableMatchLabel(match({ comp_level: "sf", set_number: 2 })),
    "Semi-Final 2",
  );
  assert.equal(
    readableMatchLabel(
      match({ comp_level: "sf", set_number: 2, match_number: 3 }),
    ),
    "Semi-Final 2 · Match 3",
  );
  assert.equal(
    readableMatchLabel(match({ comp_level: "f", match_number: 1 })),
    "Final 1",
  );
});

test("event-local time formatting uses IANA zones and keeps missing times explicit", () => {
  assert.equal(isEventTimezone("America/Los_Angeles"), true);
  assert.equal(isEventTimezone("PST"), false);
  assert.match(
    eventTime("2026-01-02T18:00:00Z", "America/Los_Angeles")!,
    /10:00 AM/,
  );
  assert.equal(eventTime(null, "America/Los_Angeles"), null);
});

test("scores distinguish played, upcoming, ties, and unavailable results", () => {
  const upcoming = match();
  assert.equal(isPlayed(upcoming), false);
  assert.deepEqual(matchScores(upcoming), { red: null, blue: null });
  const played = match({
    actual_time: "2026-01-02T18:30:00Z",
    result_metadata: { red_score: 0, blue_score: 0 },
    winning_alliance: null,
  });
  assert.equal(isPlayed(played), true);
  assert.deepEqual(matchScores(played), { red: 0, blue: 0 });
  const started = match({
    actual_time: "2026-01-02T18:30:00Z",
    result_metadata: { red_score: -1, blue_score: -1 },
  });
  assert.equal(isPlayed(started), false);
  assert.equal(resultLabel(started), "Started · result pending");
  assert.match(matchTimeLabel(started, "UTC"), /^Started /);
});

test("schedule position uses posted results and selects the next unplayed match", () => {
  const rows = [
    match({
      id: id(45),
      tba_match_key: "2026test_qm45",
      match_number: 45,
      result_metadata: { red_score: 90, blue_score: 88 },
    }),
    match({
      id: id(46),
      tba_match_key: "2026test_qm46",
      match_number: 46,
      result_metadata: { red_score: 0, blue_score: 12 },
    }),
    match({
      id: id(47),
      tba_match_key: "2026test_qm47",
      match_number: 47,
      scheduled_time: "2026-01-02T18:01:00Z",
    }),
    match({
      id: id(48),
      tba_match_key: "2026test_qm48",
      match_number: 48,
      scheduled_time: "2026-01-02T18:10:00Z",
    }),
  ];
  const position = deriveSchedulePosition(
    rows,
    "2026-01-02T18:00:00Z",
    Date.parse("2026-01-02T18:00:18Z"),
  );
  assert.equal(position.lastCompleted?.match_number, 46);
  assert.equal(position.next?.match_number, 47);
  assert.equal(position.current, null);
  assert.equal(position.targetId, id(47));
  assert.equal(
    deriveSchedulePosition(rows.slice(0, 2), null, Date.now()).targetId,
    id(46),
  );
});

test("CURRENT requires a fresh cache and recent official start, never schedule time alone", () => {
  const now = Date.parse("2026-01-02T18:00:30Z");
  const rows = [match({ actual_time: "2026-01-02T18:00:00Z" })];
  assert.equal(
    deriveSchedulePosition(rows, "2026-01-02T18:00:20Z", now).current?.id,
    id(1),
  );
  assert.equal(
    currentEvidenceExpiresAt(rows[0], "2026-01-02T18:00:20Z"),
    Date.parse("2026-01-02T18:01:20Z"),
  );
  const stale = deriveSchedulePosition(rows, "2026-01-02T17:58:00Z", now);
  assert.equal(stale.current, null);
  assert.equal(stale.startedPending?.id, id(1));
  assert.equal(deriveSchedulePosition(rows, null, now).current, null);
  assert.equal(
    deriveSchedulePosition([match()], "2026-01-02T18:00:20Z", now).current,
    null,
  );
  assert.equal(
    deriveSchedulePosition(rows, "2026-01-02T18:00:20Z", now + 150_000).current,
    null,
  );
});

test("freshness uses cache age and active-event policy without false precision", () => {
  const now = Date.parse("2026-01-02T18:00:18Z");
  assert.deepEqual(
    scheduleFreshness("2026-01-02T18:00:00Z", now, true, false),
    { label: "Updated 18s ago", stale: false },
  );
  assert.deepEqual(
    scheduleFreshness("2026-01-02T17:54:00Z", now, true, false),
    { label: "Data may be stale · Updated 6m ago", stale: true },
  );
  assert.equal(
    scheduleFreshness("2026-01-02T17:54:00Z", now, true, true).label,
    "Syncing… · data may be stale",
  );
  assert.equal(
    scheduleFreshness(null, now, true, false).label,
    "Data may be stale",
  );
});

test("coverage is exact to a robot-match and missing data is not classified", () => {
  const index = coverageIndex([
    {
      match_id: id(1),
      team_number: 3476,
      completed_count: 1,
      in_progress: false,
    },
    {
      match_id: id(1),
      team_number: 4415,
      completed_count: 0,
      in_progress: true,
    },
  ]);
  assert.equal(robotCoverage(index, id(1), 3476).state, "complete");
  assert.equal(robotCoverage(index, id(1), 4415).state, "in_progress");
  assert.equal(robotCoverage(index, id(1), 9999).state, "missing");
  assert.equal(robotCoverage(null, id(1), 3476).state, "unavailable");
});

test("team pills link to Team pages while the match-card link targets Match Details", () => {
  const card = renderToStaticMarkup(
    <MatchCard
      eventKey="2026test"
      timezone="UTC"
      match={{
        ...match(),
        stations: [
          {
            match_id: id(1),
            team_number: 3476,
            alliance: "red",
            station: 1,
            stationLabel: "R1",
            coverage: { state: "missing", count: 0 },
          },
          {
            match_id: id(1),
            team_number: 4415,
            alliance: "blue",
            station: 1,
            stationLabel: "B1",
            coverage: { state: "complete", count: 1 },
          },
        ],
      }}
    />,
  );
  assert.match(card, /\/events\/2026test\/matches\/2026test_qm1/);
  assert.match(card, /\/events\/2026test\/teams\/3476/);
  assert.match(card, /Team 3476 — scouting missing/);
  assert.match(card, /Team 4415 — scouting complete/);
});

test("strategy deep links preserve event and match", () => {
  assert.equal(
    matchDetailsHref("2026test", "2026test_qm1"),
    "/events/2026test/matches/2026test_qm1",
  );
  assert.equal(
    matchPrepHref("2026test", "2026test_qm1"),
    "/events/2026test/match-prep?match=2026test_qm1",
  );
});

test("2026 breakdown maps validated official fields and falls back for unknown payloads", () => {
  const rows = rebuiltBreakdownRows({
    red: {
      hubScore: {
        autoCount: 0,
        teleopCount: 20,
        totalCount: 20,
        autoPoints: 0,
        teleopPoints: 20,
        totalPoints: 20,
      },
      totalAutoPoints: 0,
      totalTeleopPoints: 20,
      totalPoints: 20,
    },
    blue: {},
  });
  assert.equal(
    rows.find(
      (row) => row.section === "Totals" && row.label === "FUEL scored (count)",
    )?.red,
    20,
  );
  assert.deepEqual(rebuiltBreakdownRows({ futureField: 1 }), []);
});

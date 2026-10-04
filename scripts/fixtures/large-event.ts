import { createHash } from "node:crypto";
import { rebuiltMatchSchema } from "../../src/games/2026-rebuilt/match-schema";
import { rebuiltPitSchema } from "../../src/games/2026-rebuilt/pit-schema";
import { matchData, pitData } from "../../tests/fixtures/rebuilt";

export const LARGE_FIXTURE_MARKER = "frc26-large-synthetic-v1";
export const LARGE_FIXTURE_EVENT_KEY = "2026syntheticlarge";
export const LARGE_FIXTURE_TIMEZONE = "America/Los_Angeles";
export const LARGE_FIXTURE_TEAM_START = 90001;
export const LARGE_FIXTURE_TEAM_COUNT = 60;
export const LARGE_FIXTURE_SCOUT_COUNT = 8;

function uuid(seed: number, label: string) {
  const bytes = createHash("sha256")
    .update(`${LARGE_FIXTURE_MARKER}:${seed}:${label}`)
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}
function shuffle<T>(items: readonly T[], next: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function iso(value: number) {
  return new Date(value).toISOString();
}
const minute = 60_000;
const adjectives = [
  "Amber",
  "Cobalt",
  "Copper",
  "Crimson",
  "Delta",
  "Echo",
  "Frost",
  "Golden",
  "Indigo",
  "Jade",
  "Kestrel",
  "Lunar",
];
const nouns = ["Circuit", "Comets", "Forge", "Orbit", "Pulse"];
const cities = ["Mesa", "Reno", "Eugene", "Fresno", "Salem", "Tacoma"];
const states = ["AZ", "NV", "OR", "CA", "OR", "WA"];

export function makeLargeEvent(seed = 2026) {
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0x7fff_ffff)
    throw new Error("Seed must be a positive 31-bit integer.");
  const next = random(seed);
  const eventId = uuid(seed, "event");
  const numbers = Array.from(
    { length: LARGE_FIXTURE_TEAM_COUNT },
    (_, i) => LARGE_FIXTURE_TEAM_START + i,
  );
  const teams = numbers.map((team_number, i) => ({
    team_number,
    tba_team_key: `frc${team_number}`,
    nickname: `${adjectives[i % adjectives.length]} ${nouns[Math.floor(i / adjectives.length)]}`,
    name: `Synthetic ${adjectives[i % adjectives.length]} ${nouns[Math.floor(i / adjectives.length)]}`,
    city: cities[i % cities.length],
    state: states[i % states.length],
    country: "USA",
    rookie_year: 2000 + (i % 25),
    source_metadata: { fixture: LARGE_FIXTURE_MARKER, seed },
  }));
  const members = numbers.map((team_number, i) => {
    const pit_status =
      i < 36
        ? "completed"
        : i < 44
          ? "in_progress"
          : i < 54
            ? "not_scouted"
            : "needs_review";
    return {
      event_id: eventId,
      team_number,
      pit_status,
      pit_claimed_at:
        pit_status === "in_progress" ? "2026-10-03T17:00:00Z" : null,
      scoutIndex: i % LARGE_FIXTURE_SCOUT_COUNT,
    };
  });
  const pitReports = members.flatMap((member, i) => {
    if (
      member.pit_status !== "completed" &&
      member.pit_status !== "needs_review"
    )
      return [];
    const data = pitData();
    data.drivetrain = i % 6 === 0 ? "tank" : "swerve";
    data.primary_scoring_mechanism = (
      ["drum", "turret", "other", "unknown"] as const
    )[i % 4];
    if (data.primary_scoring_mechanism === "other")
      data.other_shooter_type = "Synthetic dual-wheel shooter";
    data.fuel_capacity =
      i % 3 === 0
        ? { kind: "approximate_count", amount: 40 + (i % 8) * 10 }
        : { kind: "band", band: i % 2 ? "medium" : "high" };
    data.climbing =
      i % 17 === 0
        ? { capability: "yes", highest_demonstrated_level: "level_1" }
        : { capability: "unknown" };
    const game_data = rebuiltPitSchema.parse(data);
    return [
      {
        id: uuid(seed, `pit:${member.team_number}`),
        client_submission_id: uuid(seed, `pit-client:${member.team_number}`),
        event_id: eventId,
        team_number: member.team_number,
        scoutIndex: member.scoutIndex,
        game_slug: "2026-rebuilt",
        schema_version: 2,
        game_data,
        status: "final",
        started_at: "2026-10-02T15:00:00Z",
        completed_at: "2026-10-02T15:12:00Z",
      },
    ];
  });

  const matches: Array<
    Record<string, unknown> & {
      id: string;
      key: string;
      comp_level: string;
      match_number: number;
      set_number: number;
      roster: number[];
      scheduled_time: string;
      actual_time: string | null;
      result_metadata: { red_score: number; blue_score: number };
      raw_tba_payload: Record<string, unknown>;
    }
  > = [];
  const assignments: Array<{
    id: string;
    event_id: string;
    match_id: string | null;
    break_match_id: string | null;
    team_number: number | null;
    assignment_type: "match" | "break";
    status: "assigned" | "in_progress" | "missed";
    sequence: number;
    scoutIndex: number;
  }> = [];
  const submissions: Array<{
    id: string;
    client_submission_id: string;
    event_id: string;
    match_id: string;
    team_number: number;
    assignment_id: string;
    scoutIndex: number;
    game_slug: string;
    schema_version: number;
    game_data: ReturnType<typeof matchData>;
    issues: unknown[];
    note: string | null;
    status: "final";
    started_at: string;
    completed_at: string;
  }> = [];
  const stations: Array<{
    match_id: string;
    event_id: string;
    team_number: number;
    alliance: "red" | "blue";
    station: number;
  }> = [];
  let rosterDeck: number[] = [];
  for (let index = 0; index < 83; index++) {
    const qual = index < 72;
    const q = index + 1;
    let comp_level = "qm",
      set_number = 1,
      match_number = q;
    if (!qual) {
      const playoff = index - 72;
      comp_level =
        playoff < 4 ? "qf" : playoff < 6 ? "sf" : playoff < 8 ? "ef" : "f";
      set_number =
        comp_level === "f"
          ? 1
          : playoff < 4
            ? playoff + 1
            : playoff < 6
              ? playoff - 3
              : playoff - 5;
      match_number = comp_level === "f" ? playoff - 7 : 1;
    }
    const key = qual
      ? `${LARGE_FIXTURE_EVENT_KEY}_qm${q}`
      : `${LARGE_FIXTURE_EVENT_KEY}_${comp_level}${set_number}m${match_number}`;
    const id = uuid(seed, `match:${key}`);
    if (rosterDeck.length < 6) rosterDeck = shuffle(numbers, next);
    let roster = rosterDeck.splice(0, 6);
    if (q === 52) {
      roster = [
        numbers[0],
        ...roster.filter((n) => n !== numbers[0]).slice(0, 5),
      ];
      if (roster.length < 6) roster.push(numbers[1]);
    }
    const scheduledMs = qual
      ? Date.parse(q <= 36 ? "2026-10-02T15:00:00Z" : "2026-10-03T15:00:00Z") +
        ((q - 1) % 36) * 11 * minute
      : Date.parse("2026-10-04T16:00:00Z") + (index - 72) * 22 * minute;
    const completed = qual && q <= 50;
    const startedPending = q === 51;
    const actual_time =
      completed || startedPending ? iso(scheduledMs + 3 * minute) : null;
    for (let slot = 0; slot < 6; slot++) {
      stations.push({
        match_id: id,
        event_id: eventId,
        team_number: roster[slot],
        alliance: slot < 3 ? "red" : "blue",
        station: (slot % 3) + 1,
      });
    }
    if (qual) {
      const breakStart = (Math.floor(index / 2) % 4) * 2;
      const resting = [breakStart, breakStart + 1];
      const active = Array.from(
        { length: LARGE_FIXTURE_SCOUT_COUNT },
        (_, i) => i,
      ).filter((i) => !resting.includes(i));
      const insufficient = q >= 66;
      for (let slot = 0; slot < (insufficient ? 5 : 6); slot++) {
        if (q === 47 && slot === 0) continue; // genuinely uncovered slot
        const scoutIndex = active[slot];
        const missed =
          completed &&
          ((q === 8 && slot === 2) ||
            (q === 17 && slot === 5) ||
            (q === 45 && slot < 2));
        const assignmentId = uuid(seed, `assignment:${key}:${slot}`);
        assignments.push({
          id: assignmentId,
          event_id: eventId,
          match_id: id,
          break_match_id: null,
          team_number: roster[slot],
          assignment_type: "match",
          status: missed
            ? "missed"
            : q === 51 && slot === 1
              ? "in_progress"
              : "assigned",
          sequence: q,
          scoutIndex,
        });
        if (!completed || missed) continue;
        const teamIndex = roster[slot] - LARGE_FIXTURE_TEAM_START;
        const observedIndex = index * 6 + slot;
        const data = matchData();
        const strength = 10 + ((teamIndex * 7) % 65);
        data.auto.estimated_fuel_scored = Math.max(
          0,
          Math.round(strength * 0.42 + (next() - 0.5) * 12),
        );
        data.teleop.estimated_fuel_scored = Math.max(
          0,
          Math.round(strength * 1.6 + (next() - 0.5) * 35),
        );
        data.auto.start_position = (["left", "center", "right"] as const)[
          slot % 3
        ];
        data.auto.execution_result =
          observedIndex % 13 === 0
            ? "partial"
            : observedIndex % 29 === 0
              ? "failed"
              : "successful";
        data.auto.collected_additional_fuel =
          observedIndex % 4 === 0
            ? "yes"
            : observedIndex % 4 === 1
              ? "no"
              : "unknown";
        const passing = observedIndex % 5 === 0;
        const defending = observedIndex % 11 === 0;
        const partialDisable = observedIndex % 47 === 0;
        const dnf = observedIndex % 53 === 0 && !partialDisable;
        const dns = observedIndex % 97 === 0 && !partialDisable && !dnf;
        data.teleop.activity = {
          duration_seconds: dnf ? 60 : 140,
          transitions: dnf
            ? [
                { at_seconds: 0, state: "scoring" },
                { at_seconds: 45, state: "other_idle" },
              ]
            : passing
              ? [
                  { at_seconds: 0, state: "shuttling_passing" },
                  {
                    at_seconds: 20 + (observedIndex % 4) * 20,
                    state: "scoring",
                  },
                ]
              : defending
                ? [
                    { at_seconds: 0, state: "defending" },
                    {
                      at_seconds: 35 + (observedIndex % 3) * 25,
                      state: "scoring",
                    },
                  ]
                : partialDisable
                  ? [
                      { at_seconds: 0, state: "scoring" },
                      { at_seconds: 50, state: "other_idle" },
                      { at_seconds: 85, state: "scoring" },
                    ]
                  : [
                      { at_seconds: 0, state: "scoring" },
                      { at_seconds: 105, state: "other_idle" },
                    ],
        };
        data.post_match.observed_role = passing
          ? "passer_feeder"
          : defending
            ? "defender"
            : "scorer";
        data.post_match.defense_observed = defending;
        if (defending)
          data.post_match.defense_effectiveness =
            observedIndex % 2 ? "average" : "strong";
        data.post_match.reliability = dnf
          ? "DNF"
          : partialDisable
            ? "major_issue"
            : observedIndex % 19 === 0
              ? "minor_issue"
              : "normal";
        data.post_match.fuel_estimate_confidence =
          observedIndex % 23 === 0
            ? "very_uncertain"
            : observedIndex % 7 === 0
              ? "rough"
              : "good";
        if (observedIndex % 8 === 0) delete data.post_match.driver_control;
        if (observedIndex % 15 === 0) data.teleop.activity = null;
        if (observedIndex % 83 === 0)
          data.auto.climb = { result: "achieved", achieved_level: "level_1" };
        if (observedIndex % 71 === 0) data.post_match.climb = "level_1";
        if (partialDisable)
          data.issues = [
            {
              id: uuid(seed, `issue:${key}:${slot}`),
              phase: "teleop",
              at_seconds: 50,
              observed: {
                category: "disabled",
                description: "Stopped moving for part of teleop",
              },
              recovered: "yes",
            },
          ];
        if (dns) {
          data.auto.estimated_fuel_scored = null;
          data.auto.execution_result = null;
          data.auto.collected_additional_fuel = "unknown";
          data.auto.climb = { result: "none" };
          data.teleop.estimated_fuel_scored = null;
          data.teleop.activity = null;
          data.post_match.observed_role = "inactive";
          data.post_match.reliability = "DNS";
          data.post_match.defense_observed = false;
          delete data.post_match.defense_effectiveness;
          data.post_match.climb = "none";
        }
        const game_data = rebuiltMatchSchema.parse(data);
        submissions.push({
          id: uuid(seed, `submission:${key}:${slot}`),
          client_submission_id: uuid(seed, `client:${key}:${slot}`),
          event_id: eventId,
          match_id: id,
          team_number: roster[slot],
          assignment_id: assignmentId,
          scoutIndex,
          game_slug: "2026-rebuilt",
          schema_version: 2,
          game_data,
          issues: game_data.issues ?? [],
          note: partialDisable
            ? "Synthetic fixture: partial disable, recovered."
            : null,
          status: "final",
          started_at: actual_time!,
          completed_at: iso(Date.parse(actual_time!) + 3 * minute),
        });
      }
      for (const scoutIndex of resting)
        assignments.push({
          id: uuid(seed, `break:${key}:${scoutIndex}`),
          event_id: eventId,
          match_id: null,
          break_match_id: id,
          team_number: null,
          assignment_type: "break",
          status: "assigned",
          sequence: q,
          scoutIndex,
        });
    }
    const fuel = (alliance: "red" | "blue", phase: "auto" | "teleop") => {
      const selected = submissions.filter(
        (s) =>
          s.match_id === id &&
          (alliance === "red" ? roster.slice(0, 3) : roster.slice(3)).includes(
            s.team_number,
          ),
      );
      const total = selected.reduce(
        (sum, s) => sum + (s.game_data[phase].estimated_fuel_scored ?? 0),
        0,
      );
      return Math.max(0, total + Math.round((next() - 0.5) * 28));
    };
    const redAuto = q === 7 ? 100 : fuel("red", "auto");
    const redTeleop = q === 7 ? 400 : fuel("red", "teleop");
    const blueAuto = fuel("blue", "auto"),
      blueTeleop = fuel("blue", "teleop");
    let redScore = completed ? redAuto + redTeleop + 12 : -1;
    const blueScore = completed ? blueAuto + blueTeleop + 10 : -1;
    if (q === 13) redScore = blueScore; // tie case
    const winner =
      !completed || redScore === blueScore
        ? null
        : redScore > blueScore
          ? "red"
          : "blue";
    const breakdown =
      completed && q % 9 !== 5
        ? {
            red: {
              hubScore: {
                autoCount: redAuto,
                teleopCount: redTeleop,
                totalCount: redAuto + redTeleop,
              },
              autoTowerPoints: 0,
              endGameTowerPoints: 0,
              totalTowerPoints: 0,
            },
            blue: {
              hubScore: {
                autoCount: blueAuto,
                teleopCount: blueTeleop,
                totalCount: blueAuto + blueTeleop,
              },
              autoTowerPoints: 0,
              endGameTowerPoints: 0,
              totalTowerPoints: 0,
            },
          }
        : null;
    const videos =
      completed && q % 6 === 0
        ? [{ type: "youtube", key: `synthetic-${key}` }]
        : null;
    const raw_tba_payload = {
      key,
      event_key: LARGE_FIXTURE_EVENT_KEY,
      comp_level,
      set_number,
      match_number,
      alliances: {
        red: {
          team_keys: roster.slice(0, 3).map((n) => `frc${n}`),
          score: redScore,
        },
        blue: {
          team_keys: roster.slice(3).map((n) => `frc${n}`),
          score: blueScore,
        },
      },
      winning_alliance: winner ?? "",
      score_breakdown: breakdown,
      videos,
      post_result_time: completed
        ? Math.floor((scheduledMs + 15 * minute) / 1000)
        : null,
    };
    matches.push({
      id,
      event_id: eventId,
      key,
      tba_match_key: key,
      comp_level,
      set_number,
      match_number,
      scheduled_time: iso(scheduledMs),
      predicted_time: iso(scheduledMs + minute),
      actual_time,
      winning_alliance: winner,
      result_metadata: { red_score: redScore, blue_score: blueScore },
      raw_tba_payload,
      roster,
    });
  }
  const external = numbers.flatMap((team_number, i) => {
    const rows: Record<string, unknown>[] = [];
    const epa = 25 + ((i * 11) % 115);
    if (i % 4 !== 0)
      rows.push({
        event_id: eventId,
        team_number,
        source: "statbotics",
        metric_version: "synthetic-2026",
        epa_total: epa,
        epa_auto: epa * 0.22,
        epa_teleop: epa * 0.65,
        epa_endgame: epa * 0.13,
        payload: {
          epa: {
            total_points: epa,
            breakdown: {
              auto_points: epa * 0.22,
              teleop_points: epa * 0.65,
              endgame_points: epa * 0.13,
              auto_fuel: epa * 0.18,
              teleop_fuel: epa * 0.54,
              total_fuel: epa * 0.72,
            },
          },
        },
      });
    if (i % 5 !== 0)
      rows.push({
        event_id: eventId,
        team_number,
        source: "tba",
        metric_version: "synthetic-2026",
        opr: epa * 0.92,
        dpr: epa * 0.27,
        ccwm: epa * 0.65,
        payload: {
          coprs: {
            "Hub Auto Fuel Count": epa * 0.18,
            "Hub Teleop Fuel Count": epa * 0.54,
            "Hub Total Fuel Count": epa * 0.72,
          },
        },
      });
    return rows;
  });
  const rankings = numbers
    .filter((_, i) => i % 7 !== 0)
    .map((team_number, i) => ({
      event_id: eventId,
      team_number,
      rank: i + 1,
      wins: Math.max(0, 8 - Math.floor(i / 8)),
      losses: Math.floor(i / 8),
      ties: i % 13 === 0 ? 1 : 0,
      ranking_score: 18 - i * 0.2,
    }));
  return {
    seed,
    eventId,
    event: {
      id: eventId,
      tba_key: LARGE_FIXTURE_EVENT_KEY,
      year: 2026,
      name: "SYNTHETIC Cascadia Test Event",
      short_name: "SYNTHETIC TEST",
      city: "Fictional Bay",
      state: "CA",
      country: "USA",
      start_date: "2026-10-02",
      end_date: "2026-10-04",
      status: "active",
      game_slug: "2026-rebuilt",
      timezone: LARGE_FIXTURE_TIMEZONE,
      timezone_source: "admin",
      our_team_number: numbers[0],
      last_tba_sync_at: "2026-10-03T19:00:00Z",
      last_statbotics_sync_at: "2026-10-03T19:00:00Z",
      source_metadata: { fixture: LARGE_FIXTURE_MARKER, seed },
    },
    teams,
    members,
    pitReports,
    matches,
    stations,
    assignments,
    submissions,
    external,
    rankings,
    avatarTeams: numbers.filter((_, i) => i % 5 === 0),
    prepMatchKey: `${LARGE_FIXTURE_EVENT_KEY}_qm52`,
  };
}

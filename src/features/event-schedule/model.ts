import { z } from "zod";
import { eventTime } from "@/features/events/timezone";
export type { MatchStation } from "@/features/events/match-stations";

export type OfficialMatch = {
  id: string;
  tba_match_key: string;
  comp_level: string;
  set_number: number;
  match_number: number;
  scheduled_time: string | null;
  actual_time: string | null;
  winning_alliance: "red" | "blue" | null;
  result_metadata: unknown;
};
export const groups = ["all", "qual", "playoff", "final"] as const;
export type MatchGroup = (typeof groups)[number];
export const groupLabels: Record<MatchGroup, string> = {
  all: "All",
  qual: "Qual",
  playoff: "Playoff",
  final: "Final",
};
export function matchGroup(level: string): Exclude<MatchGroup, "all"> {
  return level === "qm" ? "qual" : level === "f" ? "final" : "playoff";
}
export function orderedMatches<
  T extends Pick<
    OfficialMatch,
    "comp_level" | "set_number" | "match_number" | "tba_match_key"
  >,
>(matches: readonly T[]) {
  const level = (value: string) =>
    ({ qm: 0, ef: 1, qf: 2, sf: 3, f: 4 })[value] ?? 5;
  return [...matches].sort(
    (a, b) =>
      level(a.comp_level) - level(b.comp_level) ||
      a.set_number - b.set_number ||
      a.match_number - b.match_number ||
      a.tba_match_key.localeCompare(b.tba_match_key),
  );
}
export function officialMatchLabel(
  match: Pick<OfficialMatch, "comp_level" | "set_number" | "match_number">,
  long = false,
) {
  if (match.comp_level === "qm")
    return `${long ? "Qual " : "Q"}${match.match_number}`;
  if (match.comp_level === "f")
    return `${long ? "Final " : "F"}${match.set_number > 1 ? `${match.set_number}·` : ""}${match.match_number}`;
  // Double-elimination sets normally contain a single match. Retain the match
  // suffix for multi-match playoff sets so labels never collide.
  return `${match.comp_level.toUpperCase()}${match.set_number}${match.match_number > 1 ? `·${match.match_number}` : ""}`;
}
export function readableMatchLabel(match: OfficialMatch) {
  if (match.comp_level === "qm") return `Qualification ${match.match_number}`;
  if (match.comp_level === "f")
    return `Final ${match.set_number > 1 ? `${match.set_number} · Match ` : ""}${match.match_number}`;

  const phase =
    { ef: "Eighth-Final", qf: "Quarter-Final", sf: "Semi-Final" }[
      match.comp_level
    ] ?? `Match ${match.comp_level.toUpperCase()}`;
  return `${phase} ${match.set_number}${match.match_number > 1 ? ` · Match ${match.match_number}` : ""}`;
}
export function matchScores(match: Pick<OfficialMatch, "result_metadata">) {
  const raw = z
    .object({ red_score: z.number().int(), blue_score: z.number().int() })
    .safeParse(match.result_metadata);
  return {
    red: raw.success && raw.data.red_score >= 0 ? raw.data.red_score : null,
    blue: raw.success && raw.data.blue_score >= 0 ? raw.data.blue_score : null,
  };
}
export function isPlayed(match: Pick<OfficialMatch, "result_metadata">) {
  const scores = matchScores(match);
  // TBA actual_time is a start signal; it does not establish a posted result.
  return scores.red !== null && scores.blue !== null;
}
export function hasOfficialStart(match: OfficialMatch) {
  return Boolean(
    match.actual_time && Number.isFinite(Date.parse(match.actual_time)),
  );
}
export function resultLabel(match: OfficialMatch) {
  if (!isPlayed(match))
    return hasOfficialStart(match) ? "Started · result pending" : "Upcoming";
  const scores = matchScores(match);
  if (scores.red === null || scores.blue === null)
    return "Played · score unavailable";
  if (match.winning_alliance)
    return `${match.winning_alliance === "red" ? "Red" : "Blue"} wins`;
  if (scores.red === scores.blue) return "Tie";
  return `${scores.red > scores.blue ? "Red" : "Blue"} wins`;
}
export function matchTimeLabel(match: OfficialMatch, timezone: string) {
  const actual = eventTime(match.actual_time, timezone);
  if (isPlayed(match) && actual) return `Played ${actual}`;
  if (actual) return `Started ${actual} · result pending`;
  const scheduled = eventTime(match.scheduled_time, timezone);
  return scheduled ? `Scheduled ${scheduled}` : "Time unavailable";
}

export function deriveSchedulePosition<T extends OfficialMatch>(
  matches: readonly T[],
  lastSync: string | null,
  now: number,
) {
  const ordered = orderedMatches(matches);
  const lastCompletedIndex = ordered.findLastIndex(isPlayed);
  const lastCompleted = ordered[lastCompletedIndex] ?? null;
  const nextIndex = ordered.findIndex(
    (match, index) => index > lastCompletedIndex && !isPlayed(match),
  );
  const next = ordered[nextIndex] ?? null;
  const syncAge = lastSync
    ? now - Date.parse(lastSync)
    : Number.POSITIVE_INFINITY;
  const startAge = next?.actual_time
    ? now - Date.parse(next.actual_time)
    : Number.POSITIVE_INFINITY;
  // A recent official start and a fresh cache are both required. Schedule or
  // predicted time alone never identifies a robot as currently on the field.
  const current =
    next &&
    Number.isFinite(syncAge) &&
    syncAge >= 0 &&
    syncAge <= 60_000 &&
    Number.isFinite(startAge) &&
    startAge >= 0 &&
    startAge <= 120_000
      ? next
      : null;
  const startedPending =
    next && hasOfficialStart(next) && !current ? next : null;
  const following =
    current || startedPending
      ? (ordered.find(
          (match, index) => index > nextIndex && !isPlayed(match),
        ) ?? null)
      : null;
  return {
    lastCompleted,
    current,
    startedPending,
    next,
    following,
    targetId:
      current?.id ?? next?.id ?? lastCompleted?.id ?? ordered[0]?.id ?? null,
  };
}

export function currentEvidenceExpiresAt(
  match: OfficialMatch,
  lastSync: string | null,
) {
  if (!match.actual_time || !lastSync) return null;
  const start = Date.parse(match.actual_time);
  const synced = Date.parse(lastSync);
  return Number.isFinite(start) && Number.isFinite(synced)
    ? Math.min(start + 120_000, synced + 60_000)
    : null;
}

export function scheduleFreshness(
  lastSync: string | null,
  now: number,
  liveWindow: boolean,
  syncing: boolean,
  staleAfterMs = 300_000,
) {
  const age = lastSync ? now - Date.parse(lastSync) : Number.POSITIVE_INFINITY;
  const stale =
    !Number.isFinite(age) ||
    age < -60_000 ||
    (liveWindow && age >= staleAfterMs);
  if (syncing)
    return {
      label: stale ? "Syncing… · data may be stale" : "Syncing…",
      stale,
    };
  if (!lastSync || !Number.isFinite(age) || age < -60_000)
    return { label: "Data may be stale", stale: true };
  const elapsed = Math.max(0, Math.floor(age / 1000));
  const ago =
    elapsed < 60
      ? `${elapsed}s`
      : elapsed < 3600
        ? `${Math.floor(elapsed / 60)}m`
        : elapsed < 86400
          ? `${Math.floor(elapsed / 3600)}h`
          : `${Math.floor(elapsed / 86400)}d`;
  return {
    label: `${stale ? "Data may be stale · " : ""}Updated ${ago} ago`,
    stale,
  };
}
export function matchDetailsHref(eventKey: string, matchKey: string) {
  return `/events/${encodeURIComponent(eventKey)}/matches/${encodeURIComponent(matchKey)}`;
}
export function matchPrepHref(eventKey: string, matchKey: string) {
  return `/events/${encodeURIComponent(eventKey)}/match-prep?match=${encodeURIComponent(matchKey)}`;
}
export const coverageSchema = z.array(
  z.object({
    match_id: z.uuid(),
    team_number: z.number().int().positive(),
    completed_count: z.number().int().nonnegative(),
    in_progress: z.boolean(),
  }),
);
export type CoverageRow = z.infer<typeof coverageSchema>[number];
export type ScoutingState =
  "complete" | "in_progress" | "missing" | "unavailable";
export const coverageLabels: Record<ScoutingState, string> = {
  complete: "scouting complete",
  in_progress: "scouting in progress",
  missing: "scouting missing",
  unavailable: "scouting status unavailable",
};
export function coverageKey(matchId: string, teamNumber: number) {
  return `${matchId}:${teamNumber}`;
}
export function coverageIndex(rows: CoverageRow[] | null) {
  return rows === null
    ? null
    : new Map(
        rows.map((row) => [coverageKey(row.match_id, row.team_number), row]),
      );
}
export function robotCoverage(
  index: ReturnType<typeof coverageIndex>,
  matchId: string,
  teamNumber: number,
) {
  const row = index?.get(coverageKey(matchId, teamNumber));
  const state: ScoutingState =
    index === null
      ? "unavailable"
      : (row?.completed_count ?? 0) > 0
        ? "complete"
        : row?.in_progress
          ? "in_progress"
          : "missing";
  return { state, count: index === null ? null : (row?.completed_count ?? 0) };
}
export type RobotCoverage = ReturnType<typeof robotCoverage>;
export function youtubeVideoId(raw: unknown) {
  const result = z
    .object({
      videos: z
        .array(z.object({ type: z.string(), key: z.string() }))
        .nullish(),
    })
    .safeParse(raw);
  return result.success
    ? (result.data.videos?.find(
        (video) =>
          video.type === "youtube" && /^[A-Za-z0-9_-]{11}$/.test(video.key),
      )?.key ?? null)
    : null;
}

import "server-only";
import { notFound } from "next/navigation";
import { getEvent, eventContext } from "@/features/events/server/queries";
import { getGameModule } from "@/games/registry";
import { createServiceClient } from "@/lib/supabase/service";
import { getMatchStations } from "@/features/events/match-stations";
import { readEventCachePages as pages } from "@/features/events/server/cache-pages";
import {
  coverageSchema,
  coverageIndex,
  robotCoverage,
  orderedMatches,
  type MatchStation,
} from "../model";

export async function getEventSchedule(eventKey: string) {
  const event = await getEvent(eventKey);
  const { db, profile } = await eventContext();
  const [matches, stations, coverageResult, leaseResult] = await Promise.all([
    pages((from, to) =>
      db
        .from("matches")
        .select(
          "id,tba_match_key,comp_level,set_number,match_number,scheduled_time,actual_time,winning_alliance,result_metadata",
        )
        .eq("event_id", event.id)
        .order("id")
        .range(from, to),
    ),
    pages((from, to) =>
      db
        .from("match_teams")
        .select("match_id,team_number,alliance,station")
        .eq("event_id", event.id)
        .order("match_id")
        .order("team_number")
        .range(from, to),
    ),
    db.rpc("get_event_match_coverage", { target: event.id }),
    Promise.resolve()
      .then(() =>
        createServiceClient()
          .from("tba_refresh_leases")
          .select("token,expires_at")
          .eq("event_id", event.id)
          .maybeSingle(),
      )
      .catch(() => null),
  ]);
  const parsed = coverageSchema.safeParse(coverageResult.data);
  const coverage = coverageIndex(
    !coverageResult.error && parsed.success ? parsed.data : null,
  );
  const stationMap = new Map<string, MatchStation[]>();
  for (const station of stations) {
    const group = stationMap.get(station.match_id) ?? [];
    group.push(station);
    stationMap.set(station.match_id, group);
  }
  const generatedAt = Date.now();
  return {
    event,
    profile,
    generatedAt,
    syncExpiresAt: leaseResult?.data?.token
      ? (leaseResult.data.expires_at ?? null)
      : null,
    coverageAvailable: coverage !== null,
    matches: orderedMatches(matches).map((match) => {
      const lineup = getMatchStations(stationMap.get(match.id) ?? []);
      return {
        ...match,
        stations: [...lineup.red, ...lineup.blue].map((station) => ({
          ...station,
          coverage: robotCoverage(coverage, match.id, station.team_number),
        })),
      };
    }),
  };
}

export async function getOfficialMatch(eventKey: string, matchKey: string) {
  const event = await getEvent(eventKey);
  const { db, profile } = await eventContext();
  const [matches, target, leaseResult] = await Promise.all([
    pages((from, to) =>
      db
        .from("matches")
        .select(
          "id,tba_match_key,comp_level,set_number,match_number,scheduled_time,actual_time,winning_alliance,result_metadata",
        )
        .eq("event_id", event.id)
        .order("id")
        .range(from, to),
    ),
    db
      .from("matches")
      .select(
        "id,tba_match_key,comp_level,set_number,match_number,scheduled_time,actual_time,winning_alliance,result_metadata,raw_tba_payload,match_teams(team_number,alliance,station)",
      )
      .eq("event_id", event.id)
      .eq("tba_match_key", matchKey)
      .maybeSingle(),
    Promise.resolve()
      .then(() =>
        createServiceClient()
          .from("tba_refresh_leases")
          .select("token,expires_at")
          .eq("event_id", event.id)
          .maybeSingle(),
      )
      .catch(() => null),
  ]);
  if (target.error) throw new Error("Match details unavailable.");
  // The event-scoped lookup, not the route key alone, establishes ownership.
  if (!target.data) notFound();
  const source = target.data;
  const numbers = source.match_teams.map((row) => row.team_number);
  const [coverageResult, teams, submissions, assignments] = await Promise.all([
    db.rpc("get_match_coverage", {
      target_event: event.id,
      target_match: source.id,
    }),
    db
      .from("teams")
      .select("team_number,nickname,name")
      .in("team_number", numbers),
    db
      .from("match_scouting_submissions")
      .select("id,team_number,game_slug,schema_version,game_data,completed_at")
      .eq("event_id", event.id)
      .eq("match_id", source.id)
      .eq("status", "final")
      .order("completed_at", { ascending: false })
      .order("id")
      .limit(1000),
    db
      .from("scouting_assignments")
      .select("id,team_number,status")
      .eq("event_id", event.id)
      .eq("match_id", source.id)
      .eq("scout_user_id", profile.id)
      .in("status", ["assigned", "in_progress"]),
  ]);
  if (teams.error) throw new Error("Match details unavailable.");
  const parsed = coverageSchema.safeParse(coverageResult.data);
  const coverage = coverageIndex(
    !coverageResult.error && parsed.success ? parsed.data : null,
  );
  const lineup = getMatchStations(source.match_teams);
  const match = {
    ...source,
    stations: [...lineup.red, ...lineup.blue].map((station) => ({
      ...station,
      match_id: source.id,
      coverage: robotCoverage(coverage, source.id, station.team_number),
    })),
  };
  const readable = new Map<
    number,
    { id: string; summary: readonly string[]; viewHref: string | null }[]
  >();
  for (const row of submissions.data ?? []) {
    try {
      const game = getGameModule(row.game_slug, row.schema_version);
      game.parseMatch(row.game_data);
      const items = readable.get(row.team_number) ?? [];
      items.push({
        id: row.id,
        summary: game.summarizeMatch?.(row.game_data) ?? [],
        viewHref:
          row.game_slug === "2026-rebuilt" && row.schema_version === 2
            ? `/events/${eventKey}/teams/${row.team_number}/matches/${row.id}`
            : null,
      });
      readable.set(row.team_number, items);
    } catch {
      /* Unsupported/invalid historical payloads are not displayed as evidence. */
    }
  }
  return {
    event,
    profile,
    matches: orderedMatches(matches),
    generatedAt: Date.now(),
    syncExpiresAt: leaseResult?.data?.token
      ? (leaseResult.data.expires_at ?? null)
      : null,
    coverageAvailable: coverage !== null,
    match,
    raw: source.raw_tba_payload,
    recordsAvailable: !submissions.error,
    teams: match.stations.map((station) => ({
      ...station,
      nickname:
        teams.data.find((row) => row.team_number === station.team_number)
          ?.nickname ??
        teams.data.find((row) => row.team_number === station.team_number)
          ?.name ??
        null,
      records: readable.get(station.team_number) ?? [],
      assignmentId:
        event.status === "active" && !assignments.error
          ? (assignments.data.find(
              (row) => row.team_number === station.team_number,
            )?.id ?? null)
          : null,
    })),
  };
}
export type EventScheduleData = Awaited<ReturnType<typeof getEventSchedule>>;
export type OfficialMatchData = Awaited<ReturnType<typeof getOfficialMatch>>;

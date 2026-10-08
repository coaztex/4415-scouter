import "server-only";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { getTeamDirectory } from "@/features/teams/server/queries";
import { parsePit } from "@/features/teams/model";
import { selectPrepMatch, type PrepMatch, type PrepStation } from "../model";
import { getMatchStations } from "@/features/events/match-stations";
import { readEventCachePages } from "@/features/events/server/cache-pages";
import { isPlayed, orderedMatches } from "@/features/event-schedule/model";

export async function getMatchPrep(eventKey: string, selectedKey?: string) {
  const { db } = await requireRole("strategy");
  const directory = await getTeamDirectory(eventKey);
  const event = await db
    .from("events")
    .select("our_team_number")
    .eq("id", directory.event.id)
    .single();
  const [matchesResult, stationsResult] = await Promise.all([
    readEventCachePages((from, to) =>
      db
        .from("matches")
        .select(
          "id,tba_match_key,comp_level,set_number,match_number,scheduled_time,predicted_time,actual_time,result_metadata",
        )
        .eq("event_id", directory.event.id)
        .order("id")
        .range(from, to),
    ),
    readEventCachePages((from, to) =>
      db
        .from("match_teams")
        .select("match_id,team_number,alliance,station")
        .eq("event_id", directory.event.id)
        .order("match_id")
        .order("team_number")
        .range(from, to),
    ),
  ]);
  if (event.error) throw new Error("Match Prep schedule unavailable.");
  const matches = orderedMatches(matchesResult as PrepMatch[]);
  const stations = stationsResult as PrepStation[];
  const { selected, invalidSelection } = selectPrepMatch(
    matches,
    stations,
    event.data.our_team_number,
    selectedKey,
  );
  if (invalidSelection)
    redirect(`/events/${encodeURIComponent(eventKey)}/match-prep`);
  const selectedIsPlayed = !!selected && isPlayed(selected);
  const officialStations = getMatchStations(
    selected ? stations.filter((s) => s.match_id === selected.id) : [],
  );
  const lineup = [...officialStations.red, ...officialStations.blue];
  const numbers = lineup.map((s) => s.team_number);
  const [pits, notes] = selected
    ? await Promise.all([
        db
          .from("pit_scouting_submissions")
          .select("team_number,game_data,completed_at")
          .eq("event_id", directory.event.id)
          .eq("status", "final")
          .eq("game_slug", "2026-rebuilt")
          .eq("schema_version", 2)
          .in("team_number", numbers)
          .order("completed_at", { ascending: false, nullsFirst: false })
          .limit(120),
        db
          .from("match_prep_notes")
          .select("note,updated_at")
          .eq("match_id", selected.id)
          .maybeSingle(),
      ])
    : [null, null];
  if (pits?.error || notes?.error)
    throw new Error("Match Prep evidence unavailable.");
  const pitMap = new Map<number, ReturnType<typeof parsePit>>();
  for (const record of pits?.data ?? []) {
    if (pitMap.has(record.team_number)) continue;
    const parsed = parsePit(record.game_data);
    if (parsed) pitMap.set(record.team_number, parsed);
  }
  return {
    event: directory.event,
    ownTeamNumber: event.data.our_team_number,
    matches,
    selected,
    selectedIsPlayed,
    lineup,
    note: notes?.data ?? null,
    teams: lineup.map((station) => ({
      station,
      row:
        directory.rows.find((r) => r.teamNumber === station.team_number) ??
        null,
      pit: pitMap.get(station.team_number) ?? null,
    })),
  };
}
export type MatchPrepData = Awaited<ReturnType<typeof getMatchPrep>>;

import "server-only";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/server";
import { getTeamDirectory } from "@/features/teams/server/queries";
import { parsePit } from "@/features/teams/model";
import {
  defaultMatch,
  upcomingMatches,
  type PrepMatch,
  type PrepStation,
} from "../model";

export async function getMatchPrep(eventKey: string, selectedKey?: string) {
  const { db } = await requireRole("strategy");
  const directory = await getTeamDirectory(eventKey);
  const event = await db
    .from("events")
    .select("our_team_number")
    .eq("id", directory.event.id)
    .single();
  const [matchesResult, stationsResult] = await Promise.all([
    db
      .from("matches")
      .select(
        "id,tba_match_key,comp_level,set_number,match_number,scheduled_time,predicted_time,actual_time,result_metadata",
      )
      .eq("event_id", directory.event.id)
      .limit(1000),
    db
      .from("match_teams")
      .select("match_id,team_number,alliance,station")
      .eq("event_id", directory.event.id)
      .limit(3000),
  ]);
  if (event.error || matchesResult.error || stationsResult.error)
    throw new Error("Match Prep schedule unavailable.");
  const allMatches = matchesResult.data as PrepMatch[];
  const matches = upcomingMatches(allMatches);
  const stations = stationsResult.data as PrepStation[];
  const selected = selectedKey
    ? allMatches.find((m) => m.tba_match_key === selectedKey)
    : defaultMatch(matches, stations, event.data.our_team_number);
  if (selectedKey && !selected) notFound();
  const selectedIsPlayed = Boolean(
    selected && !matches.some((match) => match.id === selected.id),
  );
  if (selected && selectedIsPlayed) matches.unshift(selected);
  const lineup = selected
    ? stations.filter((s) => s.match_id === selected.id)
    : [];
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

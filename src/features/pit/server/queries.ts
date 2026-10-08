import "server-only";
import { notFound } from "next/navigation";
import { getEvent, eventContext } from "@/features/events/server/queries";
import { rebuiltPitSchema } from "@/games/2026-rebuilt/pit-schema";
import type { TeamListRow } from "../model";
import {
  readPitMapCache,
  cachedEventPitMap,
} from "@/features/pit-map/server/cache";
import { pitAssignmentsByTeam } from "@/features/pit-map/model";
import { readNexusInspectionCache } from "@/features/events/server/nexus-inspection-repository";
import {
  NEXUS_INSPECTION_CACHE_MS,
  type NexusInspectionCache,
} from "@/features/events/server/nexus-inspection-sync";
import type { CachedNexusInspection } from "@/lib/nexus/inspection";

function teamInspection(
  cache: NexusInspectionCache | null,
  key: string,
  number: number,
): CachedNexusInspection | null {
  const value =
    cache?.sourceEventKey === key ? cache.snapshot?.[String(number)] : null;
  return value && cache?.fetchedAt
    ? {
        value,
        fetchedAt: cache.fetchedAt,
        stale:
          cache.status !== "succeeded" ||
          Date.now() - Date.parse(cache.fetchedAt) >= NEXUS_INSPECTION_CACHE_MS,
      }
    : null;
}
export async function pitEvent(key: string) {
  const event = await getEvent(key),
    { db, profile } = await eventContext();
  if (event.game_slug !== "2026-rebuilt")
    throw new Error("This pit form requires the 2026 REBUILT game module.");
  return { event, db, profile };
}
export async function listPitTeams(key: string) {
  const { event, db } = await pitEvent(key);
  const [roster, teams, mapCache, completion, inspectionCache] =
    await Promise.all([
      db
        .from("event_teams")
        .select("team_number,pit_status,pit_claimed_by")
        .eq("event_id", event.id)
        .order("team_number")
        .limit(1000),
      db
        .from("teams")
        .select("team_number,nickname")
        .order("team_number")
        .limit(10000),
      readPitMapCache(db, event.id),
      db.rpc("get_event_pit_completion", { target: event.id }),
      readNexusInspectionCache(db, event.id),
    ]);
  if (roster.error || teams.error)
    throw new Error("Pit team list unavailable.");
  const names = new Map(
    teams.data.map((team) => [team.team_number, team.nickname]),
  );
  const pitMap = cachedEventPitMap(mapCache);
  const locations = pitAssignmentsByTeam(pitMap);
  return {
    event,
    pitMap,
    // Missing optional migration falls back to the existing persisted status.
    completed:
      !completion.error && Array.isArray(completion.data)
        ? completion.data.filter(
            (n): n is number =>
              typeof n === "number" && Number.isSafeInteger(n) && n > 0,
          )
        : roster.data
            .filter((r) => r.pit_status === "completed")
            .map((r) => r.team_number),
    rows: roster.data.map((row): TeamListRow => ({
      teamNumber: row.team_number,
      nickname: names.get(row.team_number) ?? null,
      status: row.pit_status,
      claimedBy: row.pit_claimed_by,
      pitLabel: locations.get(row.team_number) ?? null,
      inspection: teamInspection(
        inspectionCache,
        event.nexus_event_key ?? event.tba_key,
        row.team_number,
      ),
    })),
  };
}
export async function pitTeam(key: string, number: number) {
  const { event, db, profile } = await pitEvent(key);
  const [member, team, own, final, mapCache, inspectionCache] =
    await Promise.all([
      db
        .from("event_teams")
        .select("pit_status,pit_claimed_by")
        .eq("event_id", event.id)
        .eq("team_number", number)
        .maybeSingle(),
      db
        .from("teams")
        .select("nickname,team_number")
        .eq("team_number", number)
        .maybeSingle(),
      db
        .from("pit_scouting_submissions")
        .select("client_submission_id,game_data,revision,updated_at")
        .eq("event_id", event.id)
        .eq("team_number", number)
        .eq("scout_user_id", profile.id)
        .eq("status", "draft")
        .eq("schema_version", 2)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("pit_scouting_submissions")
        .select("id,scout_user_id,game_data,updated_at")
        .eq("event_id", event.id)
        .eq("team_number", number)
        .eq("status", "final")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      readPitMapCache(db, event.id),
      readNexusInspectionCache(db, event.id),
    ]);
  if (member.error || team.error || own.error || final.error)
    throw new Error("Pit record unavailable.");
  if (!member.data || !team.data) notFound();
  const ownDraft = own.data && rebuiltPitSchema.safeParse(own.data.game_data);
  return {
    event,
    profile,
    member: member.data,
    team: team.data,
    pitLabel:
      pitAssignmentsByTeam(mapCache?.layout ?? null).get(number) ?? null,
    pitMapSource: mapCache?.source ?? null,
    inspection: teamInspection(
      inspectionCache,
      event.nexus_event_key ?? event.tba_key,
      number,
    ),
    ownDraft: ownDraft?.success
      ? { ...own.data!, game_data: ownDraft.data }
      : null,
    priorFinal: final.data,
  };
}

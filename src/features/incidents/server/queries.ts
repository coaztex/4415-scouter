import "server-only";
import { requireRole } from "@/lib/auth/server";
import { getTeamDirectory } from "@/features/teams/server/queries";
import { enrichIncidents, incidentColumns, type IncidentRow } from "../model";

export async function getEventIncidents(eventKey: string) {
  const { db } = await requireRole("strategy");
  const directory = await getTeamDirectory(eventKey);
  const incidents: IncidentRow[] = [];
  // Supabase's API caps each response at 1,000 rows; page by event, never by team.
  for (let offset = 0; offset < 20000; offset += 1000) {
    const result = await db
      .from("team_incidents")
      .select(incidentColumns)
      .eq("event_id", directory.event.id)
      .order("created_at")
      .range(offset, offset + 999);
    if (result.error) throw new Error("Incident review unavailable.");
    incidents.push(...(result.data as IncidentRow[]));
    if ((result.data?.length ?? 0) < 1000) break;
    if (offset === 19000)
      throw new Error("Incident review needs a narrower date range.");
  }
  const { data: profiles, error } = await db
    .from("profiles")
    .select("id,display_name,username")
    .limit(1000);
  if (error) throw new Error("Incident reviewer directory unavailable.");
  const reviewers = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      profile.display_name || profile.username,
    ]),
  );
  return {
    event: directory.event,
    incidents: enrichIncidents(
      incidents,
      directory.matchMap,
      directory.teamMap,
      reviewers,
    ),
  };
}

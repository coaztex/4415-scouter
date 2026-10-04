import "server-only";
import { notFound } from "next/navigation";
import { eventContext } from "@/features/events/server/queries";
import { isAtLeastRole } from "@/lib/auth/roles";
import { getGameModule } from "@/games/registry";
import type { CaptureContext } from "../model";
export async function getCaptureContext(
  eventKey: string,
  id: string,
): Promise<CaptureContext> {
  const { db, profile } = await eventContext();
  const { data: a, error } = await db
    .from("scouting_assignments")
    .select(
      "id,event_id,match_id,team_number,scout_user_id,status,assignment_type",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Assignment unavailable.");
  if (!a || a.assignment_type !== "match" || !a.match_id || !a.team_number)
    notFound();
  if (
    a.scout_user_id !== profile.id &&
    !isAtLeastRole(profile.role, "strategy")
  )
    notFound();
  const [event, match, station] = await Promise.all([
    db
      .from("events")
      .select("tba_key,game_slug,status")
      .eq("id", a.event_id)
      .single(),
    db.from("matches").select("tba_match_key").eq("id", a.match_id).single(),
    db
      .from("match_teams")
      .select("alliance,station")
      .eq("match_id", a.match_id)
      .eq("team_number", a.team_number)
      .single(),
  ]);
  if (event.error || match.error || station.error)
    throw new Error("Assignment roster unavailable.");
  if (
    event.data.tba_key !== eventKey ||
    event.data.status !== "active" ||
    a.status === "missed"
  )
    notFound();
  const game = getGameModule(event.data.game_slug);
  if (game.slug !== "2026-rebuilt" || game.schemaVersion !== 2)
    throw new Error("This capture form requires REBUILT version 2.");
  return {
    eventId: a.event_id,
    assignmentId: a.id,
    actorId: profile.id,
    assignedScoutId: a.scout_user_id,
    matchId: a.match_id,
    teamNumber: a.team_number,
    eventKey,
    matchKey: match.data.tba_match_key,
    alliance: station.data.alliance,
    station: station.data.station,
    override: a.scout_user_id !== profile.id,
    submitted: a.status === "submitted",
  };
}

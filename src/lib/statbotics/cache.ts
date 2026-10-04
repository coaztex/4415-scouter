import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { normalizeTeamEvent } from "./schemas";

/** RLS-scoped cache read. Normal pages must never call the provider client. */
export async function getCachedStatboticsMetrics(
  db: SupabaseClient<Database>,
  eventId: string,
  eventKey: string,
  teamNumber?: number,
) {
  let query = db
    .from("external_team_metrics")
    .select(
      "team_number,epa_total,epa_auto,epa_teleop,epa_endgame,source_updated_at,fetched_at,payload",
    )
    .eq("event_id", eventId)
    .eq("source", "statbotics")
    .order("team_number");
  if (teamNumber !== undefined) query = query.eq("team_number", teamNumber);
  const { data, error } = await query;
  if (error) throw new Error("Statbotics cache unavailable.");
  return data.map((row) => {
    const payload =
      row.payload &&
      typeof row.payload === "object" &&
      !Array.isArray(row.payload)
        ? row.payload
        : {};
    const normalized = normalizeTeamEvent({
      team: row.team_number,
      event: eventKey,
      epa: payload.epa,
    });
    return {
      ...row,
      event_key: eventKey,
      components_2026: normalized.components_2026,
    };
  });
}

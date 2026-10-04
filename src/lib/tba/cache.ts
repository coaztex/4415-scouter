import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { parseCopr2026 } from "@/games/2026-rebuilt/official";
/** Shared RLS-scoped read; pages never fetch TBA directly. */
export async function getCachedTbaMetrics(
  db: SupabaseClient<Database>,
  eventId: string,
  eventYear: number,
  teamNumber?: number,
) {
  let query = db
    .from("external_team_metrics")
    .select("team_number,opr,dpr,ccwm,payload,fetched_at,source_updated_at")
    .eq("event_id", eventId)
    .eq("source", "tba");
  if (teamNumber !== undefined) query = query.eq("team_number", teamNumber);
  const rows = await query;
  if (rows.error) throw new Error("TBA metrics cache unavailable.");
  return rows.data.map((row) => ({
    ...row,
    components_2026:
      eventYear === 2026
        ? parseCopr2026(
            row.payload &&
              typeof row.payload === "object" &&
              !Array.isArray(row.payload)
              ? row.payload.coprs
              : null,
          )
        : null,
  }));
}

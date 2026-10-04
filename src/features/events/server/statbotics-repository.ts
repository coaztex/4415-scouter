import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { StatboticsRepository } from "./statbotics-sync";

export function statboticsRepository(
  db: SupabaseClient<Database>,
): StatboticsRepository {
  async function write(payload: Json) {
    const { error } = await db.rpc("apply_statbotics_snapshot", { payload });
    if (error) throw new Error("Statbotics database update failed.");
  }
  return {
    commit: (event, attemptedAt, rows) =>
      write(JSON.parse(JSON.stringify({ event, attemptedAt, rows }))),
    failed: (event, attemptedAt, message) =>
      write({ event, attemptedAt, error: message.slice(0, 500) }),
  };
}

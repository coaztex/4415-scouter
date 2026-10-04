import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { SyncRepository } from "./tba-sync";

export function tbaRepository(db: SupabaseClient<Database>): SyncRepository {
  return {
    async commit(snapshot) {
      // Serialize to JSON to omit optional undefined fields before RPC transport.
      const payload: Json = JSON.parse(JSON.stringify(snapshot));
      const { data, error } = await db.rpc("apply_tba_snapshot", { payload });
      if (error || !data)
        throw new Error(
          "Unable to commit TBA sync. Check migrations and roster conflicts.",
        );
      return data;
    },
    async failed(key, attemptedAt, message) {
      const event = await db
        .from("events")
        .select("id")
        .eq("tba_key", key)
        .maybeSingle();
      if (!event.data) return; // Failed imports must not create an empty event.
      const state = await db
        .from("event_sync_state")
        .select("event_id")
        .eq("event_id", event.data.id)
        .eq("source", "tba")
        .maybeSingle();
      if (!state.data) {
        await db.from("event_sync_state").insert({
          event_id: event.data.id,
          source: "tba",
          status: "failed",
          last_attempt_at: attemptedAt,
          last_error: message,
        });
        return;
      }
      await db
        .from("event_sync_state")
        .update({
          status: "failed",
          last_attempt_at: attemptedAt,
          last_error: message,
        })
        .eq("event_id", event.data.id)
        .eq("source", "tba")
        .or(`last_attempt_at.is.null,last_attempt_at.lte.${attemptedAt}`);
    },
  };
}

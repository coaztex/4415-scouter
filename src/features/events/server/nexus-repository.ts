import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { readPitMapCache } from "@/features/pit-map/server/cache";
import { getOptionalNexusEnvironment } from "@/lib/server/env";
import { NexusClient } from "@/lib/nexus/client";
import { syncPitMapForEvent, type NexusRepository } from "./nexus-sync";

export function nexusRepository(db: SupabaseClient<Database>): NexusRepository {
  return {
    read: (id) => readPitMapCache(db, id),
    async commit(result) {
      const { data, error } = await db.rpc("store_nexus_pit_map", {
        target: result.eventId,
        source_key: result.sourceEventKey,
        attempted_at: result.attemptedAt,
        fetched_layout:
          result.layout === null
            ? null
            : (JSON.parse(JSON.stringify(result.layout)) as Json),
        raw_payload:
          result.raw === null
            ? null
            : (JSON.parse(JSON.stringify(result.raw)) as Json),
        sync_result: result.status,
        message: result.message,
        replace_manual: result.force,
      });
      if (error) throw new Error("Pit map cache could not be saved.");
      return data === true;
    },
  };
}
/** Optional provider step in the existing authorized event sync orchestration. */
export async function syncNexusForEvent(
  db: SupabaseClient<Database>,
  eventId: string,
  force = false,
) {
  const result = await db
    .from("events")
    .select("id,tba_key,nexus_event_key")
    .eq("id", eventId)
    .maybeSingle();
  if (result.error || !result.data)
    return {
      ok: false,
      status: "failed" as const,
      message:
        "Pit map configuration is unavailable. Existing Pit Scouting remains available.",
    };
  return syncPitMapForEvent(
    result.data,
    nexusRepository(db),
    () => {
      const environment = getOptionalNexusEnvironment();
      return environment ? new NexusClient(environment) : null;
    },
    { force },
  );
}

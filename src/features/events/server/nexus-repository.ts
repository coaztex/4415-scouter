import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { readPitMapCache } from "@/features/pit-map/server/cache";
import { getOptionalNexusEnvironment } from "@/lib/server/env";
import { NexusClient } from "@/lib/nexus/client";
import { syncPitMapForEvent, type NexusRepository } from "./nexus-sync";
import { logSyncError, SyncDatabaseError } from "@/lib/server/sync-diagnostics";
import { syncNexusInspection } from "./nexus-inspection-sync";
import { nexusInspectionRepository } from "./nexus-inspection-repository";

export function nexusRepository(db: SupabaseClient<Database>): NexusRepository {
  return {
    read: (id) => readPitMapCache(db, id, true),
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
      if (error)
        throw new SyncDatabaseError("Nexus", "store_nexus_pit_map", error);
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
  if (result.error || !result.data) {
    if (result.error)
      logSyncError({
        provider: "nexus",
        stage: "event_lookup",
        eventKey: eventId,
        responseDetails: result.error,
      });
    return {
      ok: false,
      status: "failed" as const,
      message: result.error
        ? new SyncDatabaseError("Nexus", "event lookup", result.error).message
        : "Pit map configuration is unavailable. Existing Pit Scouting remains available.",
    };
  }
  const environment = getOptionalNexusEnvironment();
  const client = environment ? new NexusClient(environment) : null;
  const map = await syncPitMapForEvent(
    result.data,
    nexusRepository(db),
    () => client,
    { force },
  );
  if (!client) return map;
  // Inspection refreshes independently of the graphical map's long-lived cache.
  const inspection = await syncNexusInspection(
    result.data,
    nexusInspectionRepository(db),
    client,
    { force },
  );
  return {
    ...map,
    ok: map.ok || inspection.ok,
    status: map.ok !== inspection.ok ? ("partial" as const) : map.status,
    message: `${map.message} ${inspection.message}`,
  };
}

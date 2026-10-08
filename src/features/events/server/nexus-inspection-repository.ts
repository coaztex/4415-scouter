import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { normalizeNexusInspection } from "@/lib/nexus/inspection";
import { SyncDatabaseError } from "@/lib/server/sync-diagnostics";
import type {
  InspectionRepository,
  NexusInspectionCache,
} from "./nexus-inspection-sync";

export async function readNexusInspectionCache(
  db: SupabaseClient<Database>,
  eventId: string,
  strict = false,
): Promise<NexusInspectionCache | null> {
  try {
    const { data, error } = await db
      .from("event_nexus_inspections")
      .select(
        "source_event_key,snapshot,fetched_at,last_attempt_at,last_attempt_key,status,last_error",
      )
      .eq("event_id", eventId)
      .maybeSingle();
    if (error)
      throw new SyncDatabaseError("Nexus", "read inspection cache", error);
    if (!data) return null;
    return {
      sourceEventKey: data.source_event_key,
      snapshot:
        data.snapshot === null ? null : normalizeNexusInspection(data.snapshot),
      fetchedAt: data.fetched_at,
      lastAttemptAt: data.last_attempt_at,
      lastAttemptKey: data.last_attempt_key,
      status: data.status as NexusInspectionCache["status"],
      lastError: data.last_error,
    };
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}
export function nexusInspectionRepository(
  db: SupabaseClient<Database>,
): InspectionRepository {
  return {
    read: (id) => readNexusInspectionCache(db, id, true),
    async commit(write) {
      const { data, error } = await db.rpc("store_nexus_inspection", {
        target: write.eventId,
        source_key: write.sourceEventKey,
        attempted_at: write.attemptedAt,
        fetched_snapshot:
          write.snapshot === null
            ? null
            : (JSON.parse(JSON.stringify(write.snapshot)) as Json),
        sync_result: write.status,
        message: write.message,
      });
      if (error)
        throw new SyncDatabaseError("Nexus", "store_nexus_inspection", error);
      return data === true;
    },
  };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SyncDatabaseError } from "@/lib/server/sync-diagnostics";
import {
  pitMapLayoutSchema,
  withPitAssignments,
  type EventPitMap,
  type PitMapLayout,
} from "../model";

export type PitMapCache = {
  eventId: string;
  source: "nexus" | "manual";
  sourceEventKey: string | null;
  layout: PitMapLayout | null;
  fetchedAt: string | null;
  status: "succeeded" | "partial" | "unavailable" | "failed";
  lastAttemptAt: string;
  lastAttemptKey: string | null;
  lastError: string | null;
};
/** Optional enhancement: missing migrations, unreadable cache or invalid data
 * never prevent an existing pit list/form from loading. No provider requests. */
export async function readPitMapCache(
  db: SupabaseClient<Database>,
  eventId: string,
  strict = false,
): Promise<PitMapCache | null> {
  try {
    const result = await db
      .from("event_pit_maps")
      .select(
        "event_id,source,source_event_key,layout,fetched_at,status,last_attempt_at,last_attempt_key,last_error",
      )
      .eq("event_id", eventId)
      .maybeSingle();
    if (result.error && strict)
      throw new SyncDatabaseError("Nexus", "read pit cache", result.error);
    if (result.error || !result.data) return null;
    const row = result.data;
    const parsed = pitMapLayoutSchema.safeParse(row.layout);
    return {
      eventId: row.event_id,
      source: row.source as PitMapCache["source"],
      sourceEventKey: row.source_event_key,
      // Repair older cached geometry without relying on /map's optional team.
      // Reuse the normalizer's canonical join, never a component-level join.
      layout: parsed.success
        ? parsed.data.assignments.length
          ? withPitAssignments(parsed.data, parsed.data.assignments)
          : parsed.data
        : null,
      fetchedAt: parsed.success ? row.fetched_at : null,
      status: row.status as PitMapCache["status"],
      lastAttemptAt: row.last_attempt_at,
      lastAttemptKey: row.last_attempt_key,
      lastError: row.last_error,
    };
  } catch (error) {
    if (strict) throw error;
    return null;
  }
}
export function cachedEventPitMap(
  cache: PitMapCache | null,
): EventPitMap | null {
  return cache?.layout && cache.fetchedAt
    ? {
        ...cache.layout,
        eventId: cache.eventId,
        source: cache.source,
        sourceEventKey: cache.sourceEventKey,
        fetchedAt: cache.fetchedAt,
      }
    : null;
}

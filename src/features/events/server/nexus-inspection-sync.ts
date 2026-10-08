import "server-only";
import { NexusError } from "@/lib/nexus/client";
import {
  normalizeNexusInspection,
  type NexusInspection,
} from "@/lib/nexus/inspection";
import { nexusEventKey } from "@/lib/nexus/schemas";
import {
  diagnosticText,
  logSyncError,
  SyncDatabaseError,
} from "@/lib/server/sync-diagnostics";
import type { NexusEvent } from "./nexus-sync";

export type NexusInspectionCache = {
  sourceEventKey: string;
  snapshot: Record<string, NexusInspection> | null;
  fetchedAt: string | null;
  lastAttemptAt: string;
  lastAttemptKey: string;
  status: "succeeded" | "unavailable" | "failed";
  lastError: string | null;
};
export type InspectionSyncWrite = {
  eventId: string;
  sourceEventKey: string;
  attemptedAt: string;
  snapshot: Record<string, NexusInspection> | null;
  status: NexusInspectionCache["status"];
  message: string | null;
};
export interface InspectionRepository {
  read(eventId: string): Promise<NexusInspectionCache | null>;
  commit(write: InspectionSyncWrite): Promise<boolean>;
}
export const NEXUS_INSPECTION_CACHE_MS = 5 * 60 * 1000;

export async function syncNexusInspection(
  event: NexusEvent,
  repository: InspectionRepository,
  client: { inspection(key: string): Promise<unknown | null> },
  options: { force?: boolean; now?: Date } = {},
) {
  const key = nexusEventKey(event),
    now = options.now ?? new Date();
  let stage = "inspection_cache_read";
  const attemptedAt = now.toISOString();
  try {
    const previous = await repository.read(event.id);
    const age = previous
      ? now.getTime() - Date.parse(previous.lastAttemptAt)
      : Infinity;
    if (
      !options.force &&
      previous?.lastAttemptKey === key &&
      age >= 0 &&
      age < NEXUS_INSPECTION_CACHE_MS
    )
      return {
        ok: previous.status === "succeeded",
        message:
          previous.lastError ??
          "Nexus inspection cache retained; Sync Pit Map refreshes immediately.",
      };
    stage = "inspection_fetch";
    const raw = await client.inspection(key);
    stage = "inspection_transform";
    const snapshot = raw === null ? null : normalizeNexusInspection(raw);
    const message =
      snapshot === null
        ? `Nexus inspection status is not available from the API for ${key} yet. Cached inspection data was retained.`
        : `Nexus inspection synced for ${key}: ${Object.keys(snapshot).length} teams.`;
    stage = "inspection_supabase_commit";
    const saved = await repository.commit({
      eventId: event.id,
      sourceEventKey: key,
      attemptedAt,
      snapshot,
      status: snapshot === null ? "unavailable" : "succeeded",
      message: snapshot === null ? message : null,
    });
    return {
      ok: snapshot !== null,
      message: saved ? message : "A newer Nexus inspection sync was retained.",
    };
  } catch (error) {
    logSyncError({
      provider: "nexus",
      stage,
      eventKey: key,
      eventId: event.id,
      upstreamStatus:
        error instanceof NexusError ? (error.status ?? null) : null,
      responseDetails:
        error instanceof SyncDatabaseError
          ? error.details
          : diagnosticText(error instanceof Error ? error.message : error),
    });
    let message =
      error instanceof NexusError || error instanceof SyncDatabaseError
        ? error.message
        : `Nexus inspection sync failed at ${stage} for ${key}. Cached inspection data was retained.`;
    try {
      await repository.commit({
        eventId: event.id,
        sourceEventKey: key,
        attemptedAt,
        snapshot: null,
        status: "failed",
        message: message.slice(0, 1000),
      });
    } catch (recordError) {
      logSyncError({
        provider: "nexus",
        stage: "inspection_failure_record",
        eventKey: key,
        responseDetails:
          recordError instanceof SyncDatabaseError
            ? recordError.details
            : diagnosticText(
                recordError instanceof Error
                  ? recordError.message
                  : recordError,
              ),
      });
      message +=
        " The failed inspection attempt could not be saved to Supabase.";
    }
    return { ok: false, message };
  }
}

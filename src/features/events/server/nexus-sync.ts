import "server-only";
import { NexusError } from "@/lib/nexus/client";
import { nexusEventKey } from "@/lib/nexus/schemas";
import {
  normalizeNexusAssignments,
  normalizeNexusPitMap,
} from "@/lib/nexus/normalize";
import {
  hasPitGeometry,
  withPitAssignments,
  type PitMapLayout,
} from "@/features/pit-map/model";
import type { PitMapCache } from "@/features/pit-map/server/cache";

export type NexusEvent = {
  id: string;
  tba_key: string;
  nexus_event_key?: string | null;
};
export type PitMapSyncWrite = {
  eventId: string;
  sourceEventKey: string;
  attemptedAt: string;
  layout: PitMapLayout | null;
  raw: { pits: unknown; map: unknown } | null;
  status: PitMapCache["status"];
  message: string | null;
  force: boolean;
};
export interface NexusRepository {
  read(eventId: string): Promise<PitMapCache | null>;
  commit(result: PitMapSyncWrite): Promise<boolean>;
}
export type NexusResources = {
  pits(key: string): Promise<unknown | null>;
  map(key: string): Promise<unknown | null>;
};
export type NexusSyncResult = {
  ok: boolean;
  status: PitMapCache["status"] | "cached" | "unconfigured";
  message: string;
};
export const PIT_MAP_CACHE_MS = 24 * 60 * 60 * 1000;
export const PIT_MAP_FAILURE_CACHE_MS = 60 * 60 * 1000;

export async function syncPitMapForEvent(
  event: NexusEvent,
  repository: NexusRepository,
  createClient: () => NexusResources | null,
  options: { force?: boolean; now?: Date } = {},
): Promise<NexusSyncResult> {
  const now = options.now ?? new Date(),
    force = options.force ?? false;
  let key: string;
  try {
    key = nexusEventKey(event);
  } catch {
    return {
      ok: false,
      status: "failed",
      message: "Enter a valid Nexus event key override.",
    };
  }
  try {
    const previous = await repository.read(event.id);
    if (!force && previous?.source === "manual")
      return {
        ok: true,
        status: "cached",
        message:
          "Manual pit layout retained. Use Sync Pit Map to explicitly replace it with Nexus data.",
      };
    const age = previous
      ? now.getTime() - Date.parse(previous.lastAttemptAt)
      : Infinity;
    const ttl =
      previous?.status === "failed"
        ? PIT_MAP_FAILURE_CACHE_MS
        : PIT_MAP_CACHE_MS;
    if (!force && previous?.lastAttemptKey === key && age >= 0 && age < ttl)
      return {
        ok: previous.status !== "failed" && previous.status !== "unavailable",
        status: "cached",
        message:
          "Pit map cache retained. Use Sync Pit Map for a manual refresh.",
      };
    const client = createClient();
    if (!client)
      return {
        ok: false,
        status: "unconfigured",
        message:
          "Optional Nexus pit sync is disabled. Configure NEXUS_API_KEY on the server to enable it.",
      };
    const results = await Promise.allSettled([
      client.pits(key),
      client.map(key),
    ]);
    let pits: unknown = null,
      map: unknown = null;
    let pitsFailed = false,
      mapFailed = false;
    const messages: string[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === "fulfilled") {
        if (index === 0) pits = result.value;
        else map = result.value;
      } else {
        if (index === 0) pitsFailed = true;
        else mapFailed = true;
        messages.push(
          result.reason instanceof NexusError
            ? result.reason.message
            : "A Nexus pit resource could not be retrieved. Cached data was retained where available.",
        );
      }
    }
    try {
      normalizeNexusAssignments(pits);
    } catch {
      pits = null;
      pitsFailed = true;
      messages.push("Nexus pit assignments have an unsupported shape.");
    }
    const usablePrevious =
      previous?.source === "nexus" && previous.sourceEventKey === key
        ? previous.layout
        : null;
    let normalized;
    try {
      normalized = normalizeNexusPitMap(
        pitsFailed ? (usablePrevious?.assignments ?? null) : pits,
        map,
      );
    } catch {
      map = null;
      mapFailed = true;
      messages.push("Nexus graphical pit data could not be normalized.");
      normalized = normalizeNexusPitMap(
        pitsFailed ? (usablePrevious?.assignments ?? null) : pits,
        null,
      );
    }
    if (map !== null && !hasPitGeometry(normalized.layout)) {
      map = null;
      mapFailed = true;
    }
    let layout = normalized.layout;
    if (mapFailed && usablePrevious && hasPitGeometry(usablePrevious))
      layout = withPitAssignments(usablePrevious, layout.assignments);
    messages.push(...normalized.warnings);
    const usable = hasPitGeometry(layout) || layout.assignments.length > 0;
    // No fresh resource succeeded: retain the cache without changing fetchedAt.
    const fresh =
      (pits !== null && !pitsFailed) ||
      (map !== null && !mapFailed && hasPitGeometry(normalized.layout));
    const status: PitMapCache["status"] =
      !usable || !fresh
        ? pitsFailed || mapFailed
          ? "failed"
          : "unavailable"
        : pitsFailed || mapFailed || !hasPitGeometry(layout) || messages.length
          ? "partial"
          : "succeeded";
    if (!hasPitGeometry(layout) && layout.assignments.length)
      messages.push(
        "Nexus has pit addresses but no graphical pit map. The addresses are available to Pit Scouting.",
      );
    else if (status === "unavailable")
      messages.push(
        "Nexus has no pit map or pit addresses for this event. Existing Pit Scouting remains available.",
      );
    const message = [...new Set(messages)].join(" ").slice(0, 1000) || null;
    const saved = await repository.commit({
      eventId: event.id,
      sourceEventKey: key,
      attemptedAt: now.toISOString(),
      layout: usable && fresh ? layout : null,
      raw: usable && fresh ? { pits, map } : null,
      status,
      message,
      force,
    });
    if (!saved)
      return {
        ok: true,
        status: "cached",
        message:
          "A newer pit sync or manual layout was retained. Refresh to review the cache.",
      };
    return {
      ok: status === "succeeded" || status === "partial",
      status,
      message:
        message ??
        `Nexus pit map synced: ${layout.assignments.length} assigned pits; graphical geometry available.`,
    };
  } catch {
    return {
      ok: false,
      status: "failed",
      message:
        "Pit map sync could not be saved. Check database migrations and event access. Existing Pit Scouting remains available.",
    };
  }
}

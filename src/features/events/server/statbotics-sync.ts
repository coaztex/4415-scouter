import "server-only";
import { StatboticsClient, StatboticsError } from "@/lib/statbotics/client";
import type { StatboticsMetric } from "@/lib/statbotics/schemas";
import {
  diagnosticText,
  logSyncError,
  SyncDatabaseError,
} from "@/lib/server/sync-diagnostics";

export type StatboticsEvent = { id: string; tba_key: string };
export interface StatboticsRepository {
  claim(event: StatboticsEvent): Promise<{
    token: string | null;
    reason?: "busy" | "cooldown";
    retryAt?: string;
  }>;
  release(claimed: string, retryNotBefore: string): Promise<void>;
  cached(
    event: StatboticsEvent,
  ): Promise<{ count: number; oldestFetchedAt: string | null }>;
  commit(
    event: StatboticsEvent,
    attemptedAt: string,
    rows: StatboticsMetric[],
    claimed: string,
  ): Promise<void>;
  failed(
    event: StatboticsEvent,
    attemptedAt: string,
    message: string,
    claimed: string,
  ): Promise<void>;
}
export async function syncStatboticsForEvent(
  event: StatboticsEvent,
  repository: StatboticsRepository,
  client = new StatboticsClient(),
) {
  const attemptedAt = new Date().toISOString();
  let stage = "supabase_lease";
  let token: string | null = null;
  let retryNotBefore = attemptedAt;
  async function fallback(message: string) {
    try {
      const cache = await repository.cached(event);
      const cacheMessage = cache.count
        ? `Showing cached EPA for ${cache.count} teams (oldest fetch: ${cache.oldestFetchedAt}).`
        : `No previously cached event EPA is available for ${event.tba_key}.`;
      console.info(
        JSON.stringify({
          type: "external_sync_result",
          provider: "statbotics",
          stage: "cache_fallback",
          eventKey: event.tba_key,
          cachedRows: cache.count,
          oldestFetchedAt: cache.oldestFetchedAt,
        }),
      );
      return {
        ok: false as const,
        message: `${message} ${cacheMessage}`,
        source: "cache" as const,
        cachedRows: cache.count,
      };
    } catch (error) {
      logSyncError({
        provider: "statbotics",
        stage: "cache_read",
        origin: "internal_database",
        eventKey: event.tba_key,
        responseDetails:
          error instanceof SyncDatabaseError
            ? error.details
            : diagnosticText(error instanceof Error ? error.message : error),
      });
      return {
        ok: false as const,
        message: `${message} ${error instanceof SyncDatabaseError ? error.message : "The saved EPA cache could not be read from Supabase."}`,
        source: "unavailable" as const,
        cachedRows: 0,
      };
    }
  }
  async function runSync() {
    try {
      const lease = await repository.claim(event);
      token = lease.token;
      if (!token)
        return await fallback(
          lease.reason === "cooldown"
            ? `Statbotics is cooling down after an upstream failure. Retry after ${lease.retryAt}.`
            : `Another Statbotics sync is already running. Try again when it finishes.`,
        );
      stage = "fetch_epa";
      const rows = await client.teamEvents(event.tba_key);
      stage = "supabase_commit";
      await repository.commit(event, attemptedAt, rows, token);
      return {
        ok: true as const,
        source: "upstream" as const,
        message: rows.length
          ? `Statbotics cache refreshed for ${event.tba_key}: ${rows.length} team EPA rows.`
          : `Statbotics returned no event EPA for ${event.tba_key}. Offseason events may not be covered. Previous metrics were retained.`,
      };
    } catch (error) {
      const message =
        error instanceof StatboticsError || error instanceof SyncDatabaseError
          ? error.message
          : stage === "supabase_commit"
            ? `Statbotics metrics could not be saved to Supabase for ${event.tba_key}. Previous metrics were retained. Check server sync diagnostics.`
            : `Statbotics EPA could not be loaded for ${event.tba_key}. Previous metrics were retained. Check server sync diagnostics.`;
      logSyncError({
        provider: "statbotics",
        stage,
        origin:
          error instanceof StatboticsError
            ? error.code === "http"
              ? "upstream_http"
              : error.code === "network"
                ? "upstream_transport"
                : "internal_parser"
            : "internal_database",
        eventKey: event.tba_key,
        eventId: event.id,
        attemptedAt,
        upstreamStatus:
          error instanceof StatboticsError ? (error.status ?? null) : null,
        responseDetails:
          error instanceof StatboticsError
            ? error.context
            : error instanceof SyncDatabaseError
              ? error.details
              : diagnosticText(error instanceof Error ? error.message : error),
      });
      if (
        error instanceof StatboticsError &&
        (error.code === "network" ||
          (error.code === "http" &&
            [408, 429, 500, 502, 503, 504].includes(error.status ?? 0)))
      ) {
        retryNotBefore = new Date(
          Math.max(
            Date.now() + 30_000,
            Date.parse(error.context.retryNotBefore ?? "") || 0,
          ),
        ).toISOString();
      }
      if (!token) return await fallback(message);
      try {
        await repository.failed(event, attemptedAt, message, token);
      } catch (recordError) {
        logSyncError({
          provider: "statbotics",
          stage: "supabase_failure_record",
          origin: "internal_database",
          eventKey: event.tba_key,
          eventId: event.id,
          responseDetails:
            recordError instanceof SyncDatabaseError
              ? recordError.details
              : diagnosticText(
                  recordError instanceof Error
                    ? recordError.message
                    : recordError,
                ),
        });
        return await fallback(
          `${message} The failed attempt could not be saved to Supabase; the status shown may be stale.`,
        );
      }
      return await fallback(message);
    }
  }
  const result = await runSync();
  if (token) {
    try {
      await repository.release(token, retryNotBefore);
    } catch (error) {
      logSyncError({
        provider: "statbotics",
        stage: "supabase_lease_release",
        origin: "internal_database",
        eventKey: event.tba_key,
        responseDetails:
          error instanceof SyncDatabaseError
            ? error.details
            : diagnosticText(error instanceof Error ? error.message : error),
      });
      return {
        ...result,
        ok: false as const,
        message: `${result.message} ${error instanceof SyncDatabaseError ? error.message : "The Supabase sync lease could not be released."} Further syncs may be blocked until the lease expires.`,
      };
    }
  }
  return result;
}

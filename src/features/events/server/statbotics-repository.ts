import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { StatboticsRepository } from "./statbotics-sync";
import { SyncDatabaseError } from "@/lib/server/sync-diagnostics";
import { createServiceClient } from "@/lib/supabase/service";
import { z } from "zod";

export function statboticsRepository(
  db: SupabaseClient<Database>,
  serviceClient = createServiceClient,
): StatboticsRepository {
  // The calling action authorizes the admin; service-only RPCs coordinate all instances.
  async function write(payload: Json, claimed: string) {
    const { error } = await serviceClient().rpc("store_statbotics_sync", {
      payload,
      claimed,
    });
    if (error)
      throw new SyncDatabaseError("Statbotics", "store_statbotics_sync", error);
  }
  return {
    async claim(event) {
      const { data, error } = await serviceClient().rpc(
        "claim_statbotics_sync",
        { target_event: event.id },
      );
      if (error)
        throw new SyncDatabaseError(
          "Statbotics",
          "claim_statbotics_sync",
          error,
        );
      return z
        .object({
          token: z.string().uuid().nullable(),
          reason: z.enum(["busy", "cooldown"]).optional(),
          retryAt: z.string().optional(),
        })
        .parse(data);
    },
    async release(claimed, retryNotBefore) {
      const { error } = await serviceClient().rpc("release_statbotics_sync", {
        claimed,
        retry_not_before: retryNotBefore,
      });
      if (error)
        throw new SyncDatabaseError(
          "Statbotics",
          "release_statbotics_sync",
          error,
        );
    },
    async cached(event) {
      const { data, error } = await db
        .from("external_team_metrics")
        .select("fetched_at")
        .eq("event_id", event.id)
        .eq("source", "statbotics")
        .order("fetched_at");
      if (error) throw new SyncDatabaseError("Statbotics", "cache_read", error);
      return {
        count: data.length,
        oldestFetchedAt: data[0]?.fetched_at ?? null,
      };
    },
    commit: (event, attemptedAt, rows, claimed) =>
      write(JSON.parse(JSON.stringify({ event, attemptedAt, rows })), claimed),
    failed: (event, attemptedAt, message, claimed) =>
      write({ event, attemptedAt, error: message.slice(0, 500) }, claimed),
  };
}

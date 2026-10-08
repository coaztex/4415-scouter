"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import { createTbaClient } from "@/lib/tba";
import { TbaError } from "@/lib/tba/client";
import { eventKeySchema } from "@/lib/tba/schemas";
import { getGameModule } from "@/games/registry";
import { previewEvent } from "./tba-sync";
import { syncEvent } from "./sync-event";
import { withTbaRefreshLease } from "./live-refresh";
import { syncStatboticsForEvent } from "./statbotics-sync";
import { statboticsRepository } from "./statbotics-repository";
import { nexusEventKeySchema } from "@/lib/nexus/schemas";
import { syncNexusForEvent } from "./nexus-repository";
import type { ImportState } from "../import-state";
import { logSyncError, SyncDatabaseError } from "@/lib/server/sync-diagnostics";

export async function eventImportAction(
  _previous: ImportState,
  form: FormData,
): Promise<ImportState> {
  try {
    // Authorize BEFORE validation, provider requests, or database writes.
    const { db } = await requireRole("admin");
    const key = eventKeySchema.parse(form.get("eventKey"));
    const operation = z
      .enum(["preview", "import", "sync", "statbotics", "pit-map"])
      .parse(form.get("operation"));
    if (operation === "pit-map") {
      const raw = z
        .string()
        .trim()
        .parse(form.get("nexusEventKey") ?? "");
      const parsedOverride =
        raw === "" ? null : nexusEventKeySchema.safeParse(raw);
      if (parsedOverride && !parsedOverride.success)
        return {
          error:
            "Enter a Nexus event key using letters, digits, underscores or hyphens, up to 80 characters; leave blank to use the normal event key.",
        };
      const override = parsedOverride?.success ? parsedOverride.data : null;
      const event = await db
        .from("events")
        .update({ nexus_event_key: override })
        .eq("tba_key", key)
        .select("id")
        .maybeSingle();
      if (event.error)
        throw new SyncDatabaseError("Nexus", "save event setting", event.error);
      if (!event.data)
        return {
          error:
            "Nexus event setting could not be saved. Check event access and database migrations.",
        };
      const result = await syncNexusForEvent(db, event.data.id, true);
      revalidatePath("/admin", "layout");
      revalidatePath(`/events/${key}/pit`, "layout");
      return result.ok
        ? { message: result.message }
        : { error: result.message };
    }
    if (operation === "statbotics") {
      const { data, error } = await db
        .from("events")
        .select("id,tba_key")
        .eq("tba_key", key)
        .single();
      if (error)
        throw new SyncDatabaseError("Statbotics", "event lookup", error);
      if (!data) return { error: "Event cache unavailable." };
      const result = await syncStatboticsForEvent(
        data,
        statboticsRepository(db),
      );
      revalidatePath("/admin", "layout");
      revalidatePath(`/events/${key}`);
      return result.ok
        ? { message: result.message }
        : { error: result.message };
    }
    if (!process.env.TBA_AUTH_KEY?.trim())
      return {
        error:
          "Configure TBA_AUTH_KEY on the server before importing or syncing.",
      };
    const client = createTbaClient();
    let gameSlug: string;
    if (operation === "sync") {
      const existing = await db
        .from("events")
        .select("game_slug")
        .eq("tba_key", key)
        .single();
      if (existing.error || !existing.data)
        return {
          error: "Event cache is unavailable. Verify database migrations.",
        };
      gameSlug = existing.data.game_slug;
    } else {
      gameSlug = z.string().parse(form.get("gameSlug"));
      const game = getGameModule(gameSlug);
      if (game.year !== Number(key.slice(0, 4)))
        return { error: "Select a game module matching the event year." };
    }
    if (operation === "preview") {
      const { event, teamCount } = await previewEvent(client, key);
      return {
        preview: {
          key,
          name: event.name,
          location: [event.city, event.state_prov, event.country]
            .filter(Boolean)
            .join(", "),
          dates: [event.start_date, event.end_date].filter(Boolean).join(" – "),
          teamCount,
          gameSlug,
        },
      };
    }
    if (operation === "import" && form.get("confirmed") !== "yes")
      return { error: "Preview the event and explicitly confirm import." };
    const leased =
      operation === "sync"
        ? await withTbaRefreshLease(key, 0, true, () =>
            syncEvent(db, key, gameSlug),
          )
        : {
            status: "refreshed" as const,
            result: await syncEvent(db, key, gameSlug),
          };
    if (leased.status === "skipped")
      return {
        message:
          "A TBA refresh is already running for this event. Try again shortly.",
      };
    const result = leased.result;
    revalidatePath("/events");
    revalidatePath(`/events/${key}`, "layout");
    revalidatePath("/admin", "layout");
    return {
      message: `Saved ${key}: ${result.teamCount} teams and ${result.matchCount} matches. Scouting records were preserved. ${result.statbotics.message}${result.statbotics.ok ? "" : " Use Retry Statbotics."} ${result.media.ok ? `TBA media checked (${result.media.robotCount} robot images, ${result.media.avatarCount} team avatars usable).` : "TBA media could not be checked; existing images were preserved."} ${result.nexus.message}`,
    };
  } catch (error) {
    if (error instanceof SyncDatabaseError)
      logSyncError({
        provider: form.get("operation") === "pit-map" ? "nexus" : "statbotics",
        stage: "action_database",
        eventKey: String(form.get("eventKey") ?? ""),
        responseDetails: error.details,
      });
    if (
      error instanceof AuthorizationError ||
      error instanceof TbaError ||
      error instanceof SyncDatabaseError
    )
      return { error: error.message };
    return {
      error:
        "Import/sync could not complete. Check the event key, game module, database migrations, and roster conflicts. Cached data was retained.",
    };
  }
}

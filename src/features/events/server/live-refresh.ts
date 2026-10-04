import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { createTbaClient } from "@/lib/tba";
import { syncTbaEvent } from "./tba-sync";
import { tbaRepository } from "./tba-repository";
import { scheduleFreshness } from "@/features/event-schedule/model";

export const TBA_WEBHOOK_REFRESH_SECONDS = 30;
export function tbaAutoRefreshSeconds() {
  const configured = Number(process.env.TBA_REFRESH_INTERVAL_SECONDS);
  return Number.isInteger(configured) && configured >= 60 && configured <= 3600
    ? configured
    : 300;
}

export type RefreshableEvent = {
  status: string;
  start_date: string | null;
  end_date: string | null;
  last_tba_sync_at: string | null;
};

export function eventCacheFreshness(event: RefreshableEvent, now = new Date()) {
  return scheduleFreshness(
    event.last_tba_sync_at,
    now.getTime(),
    isEventInLiveWindow(event, now),
    false,
    tbaAutoRefreshSeconds() * 1000,
  );
}

export function isEventInLiveWindow(
  event: Pick<RefreshableEvent, "status" | "start_date" | "end_date">,
  now = new Date(),
) {
  if (event.status !== "active") return false;
  if (!event.start_date || !event.end_date) return false;
  // Include a day at each edge so UTC date rollover never cuts off a local event day.
  if (
    event.start_date &&
    now.getTime() < Date.parse(`${event.start_date}T00:00:00Z`) - 86_400_000
  )
    return false;
  if (
    event.end_date &&
    now.getTime() > Date.parse(`${event.end_date}T00:00:00Z`) + 2 * 86_400_000
  )
    return false;
  return true;
}

export function shouldCheckLiveRefresh(
  event: RefreshableEvent,
  now = new Date(),
  intervalSeconds = 300,
) {
  if (!isEventInLiveWindow(event, now)) return false;
  return (
    !event.last_tba_sync_at ||
    now.getTime() - Date.parse(event.last_tba_sync_at) >= intervalSeconds * 1000
  );
}

/** The database claim serializes across app instances and lasts across HTTP calls. */
export async function withTbaRefreshLease<T>(
  eventKey: string,
  minimumAgeSeconds: number,
  forced: boolean,
  sync: () => Promise<T>,
): Promise<{ status: "refreshed"; result: T } | { status: "skipped" }> {
  const db = createServiceClient();
  const { data: token, error } = await db.rpc("claim_tba_refresh", {
    target_key: eventKey,
    minimum_age_seconds: minimumAgeSeconds,
    forced,
  });
  if (error) throw new Error("TBA refresh lease unavailable.");
  if (!token) return { status: "skipped" };
  try {
    return { status: "refreshed", result: await sync() };
  } finally {
    const released = await db.rpc("release_tba_refresh", {
      target_key: eventKey,
      claimed: token,
    });
    if (released.error)
      console.error("TBA refresh lease release failed", released.error.message);
  }
}

export async function refreshCachedTbaEvent(
  eventKey: string,
  minimumAgeSeconds: number,
) {
  const db = createServiceClient();
  const { data: event, error } = await db
    .from("events")
    .select("game_slug")
    .eq("tba_key", eventKey)
    .maybeSingle();
  if (error || !event) return { status: "skipped" as const };
  return withTbaRefreshLease(eventKey, minimumAgeSeconds, false, () =>
    syncTbaEvent(
      createTbaClient(),
      tbaRepository(db),
      eventKey,
      event.game_slug,
    ),
  );
}

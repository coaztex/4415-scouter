import { after } from "next/server";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import {
  refreshCachedTbaEvent,
  shouldCheckLiveRefresh,
  tbaAutoRefreshSeconds,
} from "@/features/events/server/live-refresh";
import { eventKeySchema } from "@/lib/tba/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ eventKey: string }> },
) {
  try {
    const { db } = await requireRole("scout");
    const parsed = eventKeySchema.safeParse((await context.params).eventKey);
    if (!parsed.success) return new Response(null, { status: 404 });
    const { data: event, error } = await db
      .from("events")
      .select("status,start_date,end_date,last_tba_sync_at")
      .eq("tba_key", parsed.data)
      .maybeSingle();
    if (error || !event) return new Response(null, { status: 404 });
    const interval = tbaAutoRefreshSeconds();
    if (shouldCheckLiveRefresh(event, new Date(), interval)) {
      after(async () => {
        try {
          await refreshCachedTbaEvent(parsed.data, interval);
        } catch (error) {
          console.error("Automatic TBA refresh failed", error);
        }
      });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return new Response(null, { status: error.status });
    throw error;
  }
}

import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  refreshCachedTbaEvent,
  TBA_WEBHOOK_REFRESH_SECONDS,
} from "@/features/events/server/live-refresh";
import {
  parseTbaNotification,
  verifyTbaHmac,
} from "@/features/events/server/tba-webhook";
import { readBoundedBody } from "@/lib/server/bounded-body";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.TBA_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Webhook unavailable", { status: 503 });
  const bytes = await readBoundedBody(request, 256_000);
  if (!bytes) return new Response("Payload too large", { status: 413 });
  const rawBody = Buffer.from(bytes);
  if (!verifyTbaHmac(rawBody, request.headers.get("x-tba-hmac"), secret))
    return new Response("Invalid signature", { status: 401 });
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const notification = parseTbaNotification(payload);
  if (notification.type === "verification" && notification.verificationKey) {
    const { error } = await createServiceClient()
      .from("tba_webhook_verification")
      .upsert({
        id: true,
        verification_key: notification.verificationKey,
        received_at: new Date().toISOString(),
      });
    if (error)
      return new Response("Verification storage unavailable", { status: 503 });
  }
  if (notification.type === "refresh") {
    after(async () => {
      try {
        await refreshCachedTbaEvent(
          notification.eventKey,
          TBA_WEBHOOK_REFRESH_SECONDS,
        );
      } catch (error) {
        console.error("TBA webhook refresh failed", error);
      }
    });
  }
  return new Response("OK", { status: 200 });
}

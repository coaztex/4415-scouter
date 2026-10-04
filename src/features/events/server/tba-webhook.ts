import { createHmac, timingSafeEqual } from "node:crypto";
import { eventKeySchema } from "@/lib/tba/schemas";

export function verifyTbaHmac(
  rawBody: Buffer,
  header: string | null,
  secret: string,
) {
  if (!header || !/^[a-f\d]{64}$/i.test(header) || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(header, "hex"));
}

type Notification = {
  message_type: string;
  message_data?: Record<string, unknown>;
};

export function parseTbaNotification(
  value: unknown,
):
  | { type: "ping" | "verification"; verificationKey?: string }
  | { type: "refresh"; eventKey: string }
  | { type: "ignored" } {
  if (!value || typeof value !== "object") return { type: "ignored" };
  const message = value as Notification;
  if (message.message_type === "ping") return { type: "ping" };
  if (message.message_type === "verification") {
    const key = message.message_data?.verification_key;
    return typeof key === "string" && key.length <= 200
      ? { type: "verification", verificationKey: key }
      : { type: "ignored" };
  }
  if (
    !["match_score", "schedule_updated", "alliance_selection"].includes(
      message.message_type,
    )
  )
    return { type: "ignored" };
  const data = message.message_data;
  const nested = data?.match;
  const candidate =
    data?.event_key ??
    (nested && typeof nested === "object"
      ? (nested as Record<string, unknown>).event_key
      : undefined);
  const eventKey = eventKeySchema.safeParse(candidate);
  return eventKey.success
    ? { type: "refresh", eventKey: eventKey.data }
    : { type: "ignored" };
}

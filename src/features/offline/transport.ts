import { z } from "zod";
import { validateSubmission, type Submission, type SyncReply } from "./model";
const replySchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    kind: z.enum(["auth", "conflict", "invalid", "transient"]),
  }),
]);
export async function sendSubmission(
  payload: Submission,
  request: typeof fetch = fetch,
): Promise<SyncReply> {
  try {
    validateSubmission(payload);
  } catch {
    return { ok: false, kind: "invalid" };
  }
  try {
    const response = await request("/api/scouting/sync", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403)
      return { ok: false, kind: "auth" };
    if (response.status >= 500) return { ok: false, kind: "transient" };
    return replySchema.parse(await response.json());
  } catch {
    return { ok: false, kind: "transient" };
  }
}

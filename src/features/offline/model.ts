import { z } from "zod";
import { draftSchema, finalPayload } from "@/features/scouting/match/model";
import { rebuiltPitSchema } from "@/games/2026-rebuilt/pit-schema";

const base = {
  actorId: z.uuid(),
  eventId: z.uuid(),
  eventKey: z.string().regex(/^\d{4}[a-z0-9]+$/),
  draftKey: z.string().min(1),
};
export const submissionSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("match"),
    draft: draftSchema,
    override: z.boolean(),
  }),
  z.object({
    ...base,
    type: z.literal("pit"),
    clientSubmissionId: z.uuid(),
    teamNumber: z.number().int().positive(),
    expectedRevision: z.number().int().min(0),
    gameData: rebuiltPitSchema,
    // Offline replay never takes someone else's claim automatically.
    takeover: z.literal(false),
  }),
]);
export type Submission = z.infer<typeof submissionSchema>;
export function validateSubmission(input: unknown): Submission {
  const value = submissionSchema.parse(input);
  if (value.type === "match") {
    if (value.actorId !== value.draft.identity.actorId)
      throw new Error("Draft owner mismatch");
    finalPayload(value.draft);
  }
  return value;
}
export function submissionId(value: Submission) {
  return value.type === "match"
    ? value.draft.clientSubmissionId
    : value.clientSubmissionId;
}
export type FailureKind = "transient" | "auth" | "conflict" | "invalid";
export type SyncReply = { ok: true } | { ok: false; kind: FailureKind };
export const safeErrors: Record<FailureKind, string> = {
  transient:
    "Server acceptance was not confirmed. The device copy is safe; retry sync.",
  auth: "Sign in as the account that recorded this submission, then retry sync.",
  conflict:
    "Conflict: the assignment, pit claim, or final record changed. Ask strategy/admin to resolve it. The device copy is preserved.",
  invalid:
    "This record needs review before it can sync. The device copy is preserved.",
};
export type QueueRecord = {
  client_submission_id: string;
  actorId: string;
  type: "match" | "pit";
  eventId: string;
  eventKey: string;
  teamNumber: number;
  assignmentId: string | null;
  matchId: string | null;
  draftKey: string;
  payload: Submission | null;
  created_at: number;
  updated_at: number;
  state: "pending" | "syncing" | "synced" | "error";
  retryCount: number;
  lastError: string | null;
  failureKind: FailureKind | null;
  nextAttemptAt: number;
  lease: string | null;
};
export const MAX_ATTEMPTS = 5;
export const CONFIRMATION_TTL = 7 * 24 * 60 * 60 * 1000;
export function retryDelay(attempts: number) {
  return Math.min(60_000, 2000 * 2 ** Math.max(0, attempts - 1));
}

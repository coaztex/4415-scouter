import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { submissionId, type Submission } from "@/features/offline/model";
import type { Json } from "@/types/database";

/** Persist a rejected offline candidate for human review; never overwrite evidence. */
export async function recordSyncConflict(submission: Submission) {
  const db = createServiceClient();
  const clientId = submissionId(submission);
  const [matchIdUse, pitIdUse, candidate] = await Promise.all([
    db
      .from("match_scouting_submissions")
      .select("id")
      .eq("client_submission_id", clientId)
      .maybeSingle(),
    db
      .from("pit_scouting_submissions")
      .select("id")
      .eq("client_submission_id", clientId)
      .maybeSingle(),
    submission.type === "match"
      ? db
          .from("match_scouting_submissions")
          .select("id")
          .eq("assignment_id", submission.draft.identity.assignmentId)
          .eq("status", "final")
          .maybeSingle()
      : db
          .from("pit_scouting_submissions")
          .select("id")
          .eq("event_id", submission.eventId)
          .eq("team_number", submission.teamNumber)
          .eq("status", "final")
          .limit(1)
          .maybeSingle(),
  ]);
  const kind =
    matchIdUse.data || pitIdUse.data
      ? "client_id_collision"
      : candidate.data
        ? "duplicate_candidate"
        : "sync_conflict";
  const identity =
    submission.type === "match"
      ? {
          assignment_id: submission.draft.identity.assignmentId,
          match_id: submission.draft.identity.matchId,
          team_number: submission.draft.identity.teamNumber,
        }
      : {
          assignment_id: null,
          match_id: null,
          team_number: submission.teamNumber,
        };
  const attemptedPayload = JSON.parse(JSON.stringify(submission)) as Json;
  const { error } = await db.from("scouting_sync_conflicts").insert({
    event_id: submission.eventId,
    actor_user_id: submission.actorId,
    submission_kind: submission.type,
    client_submission_id: clientId,
    kind,
    attempted_payload: attemptedPayload,
    ...identity,
  });
  // An identical queued retry is intentionally idempotent.
  if (error && error.code !== "23505")
    throw new Error("Could not record scouting sync conflict.");
}

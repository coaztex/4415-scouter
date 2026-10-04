"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireRole } from "@/lib/auth/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getGameModule } from "@/games/registry";
import type { Json } from "@/types/database";

const kindSchema = z.enum(["match", "pit"]);
const resolutionSchema = z.enum([
  "open",
  "reviewed_no_change",
  "video_review_requested",
]);
const provenanceSchema = z.enum(["manual_correction", "video_rescout"]);

function back(eventKey: string, kind: string, id: string, message: string) {
  revalidatePath(`/events/${eventKey}/data-review`);
  redirect(
    `/events/${eventKey}/data-review/submissions/${kind}/${id}?message=${encodeURIComponent(message)}`,
  );
}

export async function reviewSubmissionAction(form: FormData) {
  const { profile } = await requireRole("strategy");
  const eventKey = z
    .string()
    .regex(/^\d{4}[a-z0-9]+$/)
    .parse(form.get("eventKey"));
  const kind = kindSchema.parse(form.get("kind"));
  const id = z.uuid().parse(form.get("id"));
  const resolution = resolutionSchema.parse(form.get("resolution"));
  const reason = z.string().trim().min(1).max(1000).parse(form.get("reason"));
  const service = createServiceClient();
  const { error } = await service.rpc("review_scouting_submission", {
    actor: profile.id,
    target_kind: kind,
    target_submission: id,
    next_resolution: resolution,
    reason,
  });
  if (error) throw new Error("Review status could not be saved.");
  back(
    eventKey,
    kind,
    id,
    resolution === "reviewed_no_change"
      ? "Reviewed — original submission remains canonical."
      : resolution === "video_review_requested"
        ? "Marked for later video review."
        : "Review reopened.",
  );
}

export async function correctSubmissionAction(form: FormData) {
  const { profile, db } = await requireRole("strategy");
  const eventKey = z
    .string()
    .regex(/^\d{4}[a-z0-9]+$/)
    .parse(form.get("eventKey"));
  const kind = kindSchema.parse(form.get("kind"));
  const id = z.uuid().parse(form.get("id"));
  const expectedRevision = z.coerce
    .number()
    .int()
    .positive()
    .parse(form.get("revision"));
  const reason = z.string().trim().max(1000).parse(form.get("reason"));
  const provenance = provenanceSchema.parse(form.get("provenance"));
  let raw: unknown;
  try {
    raw = JSON.parse(z.string().max(500_000).parse(form.get("payload")));
  } catch {
    throw new Error("Correction payload must be valid JSON.");
  }
  const table =
    kind === "match"
      ? "match_scouting_submissions"
      : "pit_scouting_submissions";
  const [stored, event] = await Promise.all([
    db.from(table).select("game_slug,event_id").eq("id", id).maybeSingle(),
    db.from("events").select("id").eq("tba_key", eventKey).maybeSingle(),
  ]);
  if (
    stored.error ||
    event.error ||
    !stored.data ||
    !event.data ||
    stored.data.event_id !== event.data.id
  )
    throw new Error("Submission does not belong to this event.");
  const game = getGameModule(stored.data.game_slug);
  const parsed = kind === "match" ? game.parseMatch(raw) : game.parsePit(raw);
  const payload = JSON.parse(JSON.stringify(parsed)) as Json;
  const service = createServiceClient();
  const { error } = await service.rpc("correct_scouting_submission", {
    actor: profile.id,
    target_kind: kind,
    target_submission: id,
    expected_revision: expectedRevision,
    payload,
    target_schema_version: game.schemaVersion,
    reason: reason || null,
    provenance,
  });
  if (error)
    throw new Error(
      error.code === "40001"
        ? "The submission changed. Refresh before correcting it."
        : "Correction could not be saved.",
    );
  back(
    eventKey,
    kind,
    id,
    provenance === "video_rescout"
      ? "Video-reviewed correction saved with provenance."
      : "Correction saved; the previous revision is preserved.",
  );
}

export async function resolveSyncConflictAction(form: FormData) {
  const { profile } = await requireRole("strategy");
  const eventKey = z
    .string()
    .regex(/^\d{4}[a-z0-9]+$/)
    .parse(form.get("eventKey"));
  const target = z.uuid().parse(form.get("id"));
  const resolution = z
    .enum(["reviewed_no_change", "video_review_requested"])
    .parse(form.get("resolution"));
  const service = createServiceClient();
  const { error } = await service.rpc("resolve_sync_conflict", {
    actor: profile.id,
    target,
    next_resolution: resolution,
  });
  if (error) throw new Error("Conflict resolution could not be saved.");
  revalidatePath(`/events/${eventKey}/data-review`);
  redirect(`/events/${eventKey}/data-review`);
}

import { NextResponse, type NextRequest } from "next/server";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import { validateSubmission } from "@/features/offline/model";
import { submitCapture } from "@/features/scouting/match/server/actions";
import { savePit } from "@/features/pit/server/actions";
import { recordSyncConflict } from "@/features/data-review/server/sync-conflicts";
import { readBoundedBody } from "@/lib/server/bounded-body";
export async function POST(request: NextRequest) {
  const reply = (body: object, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return reply({ ok: false, kind: "auth" }, 403);
  try {
    const { profile, db } = await requireRole("scout");
    const bytes = await readBoundedBody(request, 500_000);
    if (!bytes) return reply({ ok: false, kind: "invalid" }, 413);
    let raw: string;
    try {
      raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return reply({ ok: false, kind: "invalid" }, 400);
    }
    let submission;
    try {
      submission = validateSubmission(JSON.parse(raw));
    } catch {
      return reply({ ok: false, kind: "invalid" }, 400);
    }
    if (submission.actorId !== profile.id)
      return reply({ ok: false, kind: "auth" }, 403);
    const event = await db
      .from("events")
      .select("id")
      .eq("id", submission.eventId)
      .eq("tba_key", submission.eventKey)
      .maybeSingle();
    if (event.error) return reply({ ok: false, kind: "transient" }, 503);
    if (!event.data) return reply({ ok: false, kind: "conflict" }, 409);
    if (submission.type === "match") {
      const assignment = await db
        .from("scouting_assignments")
        .select("event_id")
        .eq("id", submission.draft.identity.assignmentId)
        .maybeSingle();
      if (assignment.error) return reply({ ok: false, kind: "transient" }, 503);
      if (assignment.data?.event_id !== submission.eventId) {
        await recordSyncConflict(submission);
        return reply({ ok: false, kind: "conflict" }, 409);
      }
      const result = await submitCapture({
        draft: submission.draft,
        override: submission.override,
      });
      if (!result.ok && result.kind === "conflict")
        await recordSyncConflict(submission);
      return reply(
        result.ok
          ? { ok: true }
          : { ok: false, kind: result.kind ?? "transient" },
      );
    }
    const result = await savePit({
      eventId: submission.eventId,
      teamNumber: submission.teamNumber,
      clientSubmissionId: submission.clientSubmissionId,
      expectedRevision: submission.expectedRevision,
      gameData: submission.gameData,
      finalize: true,
      takeover: false,
    });
    if (!result.ok && result.kind === "conflict")
      await recordSyncConflict(submission);
    return reply(
      result.ok
        ? { ok: true }
        : { ok: false, kind: result.kind ?? "transient" },
    );
  } catch (error) {
    return error instanceof AuthorizationError
      ? reply({ ok: false, kind: "auth" }, error.status)
      : reply({ ok: false, kind: "transient" }, 503);
  }
}

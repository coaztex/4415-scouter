"use server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import type { FailureKind } from "@/features/offline/model";
import { databaseFailure } from "@/features/offline/server-errors";
import {
  getServerSupabaseEnvironment,
  getServiceRoleEnvironment,
} from "@/lib/server/env";
import { getGameModule } from "@/games/registry";
import { captureIdentitySchema, draftSchema, finalPayload } from "../model";
import type { Database } from "@/types/database";

function captureClient() {
  const { url } = getServerSupabaseEnvironment(),
    { serviceRoleKey } = getServiceRoleEnvironment();
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
const requestSchema = z.object({
  identity: captureIdentitySchema,
  override: z.boolean(),
});
export async function startCapture(
  input: unknown,
): Promise<{ error?: string }> {
  try {
    const { profile } = await requireRole("scout"),
      r = requestSchema.parse(input);
    if (r.identity.actorId !== profile.id) throw new Error("Wrong identity");
    const { error } = await captureClient().rpc("start_match_capture", {
      actor: profile.id,
      target: r.identity.assignmentId,
      expected_scout: r.identity.assignedScoutId,
      expected_match: r.identity.matchId,
      expected_team: r.identity.teamNumber,
      allow_override: r.override,
    });
    if (error) throw error;
    return {};
  } catch {
    return {
      error:
        "Could not reserve this assignment online. Your local draft still works; submission will recheck ownership and availability.",
    };
  }
}
export async function submitCapture(input: unknown): Promise<{
  ok: boolean;
  error?: string;
  eventKey?: string;
  kind?: FailureKind;
}> {
  try {
    const { profile, db } = await requireRole("scout");
    const request = z
        .object({ draft: draftSchema, override: z.boolean() })
        .parse(input),
      draft = request.draft;
    if (draft.identity.actorId !== profile.id)
      throw new Error("Sign in as the scout who owns this device draft.");
    const game = getGameModule(draft.gameSlug, draft.schemaVersion),
      payload = game.parseMatch(finalPayload(draft));
    const { data: a } = await db
      .from("scouting_assignments")
      .select("event_id")
      .eq("id", draft.identity.assignmentId)
      .single();
    if (!a)
      throw new Error(
        "Assignment is no longer accessible. Keep the draft for a lead to review.",
      );
    const { data: event } = await db
      .from("events")
      .select("tba_key")
      .eq("id", a.event_id)
      .single();
    if (!event) throw new Error("Event is unavailable. Draft preserved.");
    const { error } = await captureClient().rpc("submit_match_capture", {
      actor: profile.id,
      target: draft.identity.assignmentId,
      expected_scout: draft.identity.assignedScoutId,
      expected_match: draft.identity.matchId,
      expected_team: draft.identity.teamNumber,
      client_id: draft.clientSubmissionId,
      payload,
      started: new Date(draft.startedMs).toISOString(),
      completed: new Date(draft.completedMs!).toISOString(),
      allow_override: request.override,
    });
    if (error)
      return {
        ok: false,
        kind: databaseFailure(error.code),
        error:
          error.code === "40001"
            ? "The assignment changed. Keep your draft and ask a lead to review it."
            : error.code === "23505" || error.code === "23514"
              ? "A record or closed assignment conflicts with this draft. An identical retry is safe; other corrections require review. Your draft was preserved."
              : "Submission was not confirmed. Your draft is preserved; reconnect/sign in and retry with the same submission ID.",
      };
    revalidatePath(`/events/${event.tba_key}`, "layout");
    revalidatePath("/schedule");
    revalidatePath("/admin/scheduling");
    return { ok: true, eventKey: event.tba_key };
  } catch (error) {
    return {
      ok: false,
      kind:
        error instanceof AuthorizationError
          ? "auth"
          : error instanceof z.ZodError
            ? "invalid"
            : "transient",
      error:
        error instanceof z.ZodError
          ? "Some observations or timing values are invalid. Your draft is preserved; review the form."
          : error instanceof Error && error.message.startsWith("Choose defense")
            ? error.message
            : "Submission was not confirmed. Your draft is preserved. Check the fields, connection, and signed-in account, then retry.",
    };
  }
}

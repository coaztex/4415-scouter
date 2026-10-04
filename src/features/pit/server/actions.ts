"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import type { FailureKind } from "@/features/offline/model";
import { databaseFailure } from "@/features/offline/server-errors";
import { getGameModule } from "@/games/registry";
import { pitServiceClient } from "./client";
const claimSchema = z.strictObject({
  eventId: z.uuid(),
  teamNumber: z.number().int().positive(),
  takeover: z.boolean(),
});
const saveSchema = claimSchema.extend({
  clientSubmissionId: z.uuid(),
  expectedRevision: z.number().int().min(0),
  finalize: z.boolean(),
  gameData: z.unknown(),
});
type ActionReply = {
  ok: boolean;
  kind?: FailureKind;
  message?: string;
  revision?: number;
  status?: "draft" | "final";
};
export async function claimPit(input: unknown): Promise<ActionReply> {
  try {
    const { profile } = await requireRole("scout"),
      r = claimSchema.parse(input);
    const { error } = await pitServiceClient().rpc("claim_pit_team", {
      actor: profile.id,
      target_event: r.eventId,
      target_team: r.teamNumber,
      takeover: r.takeover,
    });
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      kind:
        error instanceof AuthorizationError
          ? "auth"
          : error instanceof z.ZodError
            ? "invalid"
            : typeof error === "object" &&
                error !== null &&
                "code" in error &&
                typeof error.code === "string"
              ? databaseFailure(error.code)
              : "transient",
      message:
        "This pit team is no longer available or is claimed by another scout. Refresh the page and review its status.",
    };
  }
}
export async function savePit(input: unknown): Promise<ActionReply> {
  try {
    const { profile, db } = await requireRole("scout"),
      r = saveSchema.parse(input);
    const game = getGameModule("2026-rebuilt", 2),
      payload = game.parsePit(r.gameData);
    const { data: event, error: eventError } = await db
      .from("events")
      .select("tba_key")
      .eq("id", r.eventId)
      .single();
    if (eventError || !event) throw new Error("Event unavailable");
    const { data, error } = await pitServiceClient().rpc("save_pit_capture", {
      actor: profile.id,
      target_event: r.eventId,
      target_team: r.teamNumber,
      client_id: r.clientSubmissionId,
      payload,
      finalize: r.finalize,
      expected_revision: r.expectedRevision,
      takeover: r.takeover,
    });
    if (error)
      return {
        ok: false,
        kind: databaseFailure(error.code),
        message:
          error.code === "40001"
            ? "The pit claim or draft changed. Your entries remain on this page; refresh and review before trying again."
            : error.code === "23505" || error.code === "23514"
              ? "A submitted report or another scout's work conflicts with this save. Your entries remain on this page for review."
              : "The pit report was not saved. Keep this page open and retry after checking the connection.",
      };
    const result = z
      .object({
        revision: z.number().int(),
        status: z.enum(["draft", "final"]),
      })
      .parse(data);
    revalidatePath(`/events/${event.tba_key}/pit`);
    revalidatePath(`/events/${event.tba_key}/pit/${r.teamNumber}`);
    return { ok: true, revision: result.revision, status: result.status };
  } catch (error) {
    return {
      ok: false,
      kind:
        error instanceof AuthorizationError
          ? "auth"
          : error instanceof z.ZodError
            ? "invalid"
            : "transient",
      message:
        error instanceof z.ZodError
          ? "Review the capacity and routine details. The entries remain on this page."
          : "The pit report was not saved. Keep this page open and retry.",
    };
  }
}

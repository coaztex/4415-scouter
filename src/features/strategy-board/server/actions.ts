"use server";
import { z } from "zod";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import { getGameModule } from "@/games/registry";
import type { MatchStation } from "@/features/events/match-stations";
import { boardSchema, validateBoard } from "../model";
import type { Json } from "@/types/database";

const inputSchema = z.object({
  eventId: z.uuid(),
  matchId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  document: boardSchema,
});
export type BoardSaveResult =
  | { ok: true; revision: number }
  | {
      ok: false;
      kind: "conflict" | "auth" | "invalid" | "transient";
      message: string;
    };
export async function saveStrategyBoard(
  input: unknown,
): Promise<BoardSaveResult> {
  try {
    const value = inputSchema.parse(input);
    const { db } = await requireRole("strategy");
    const event = await db
      .from("events")
      .select("id,status,game_slug")
      .eq("id", value.eventId)
      .maybeSingle();
    if (event.error)
      return {
        ok: false,
        kind: "transient",
        message: "Event unavailable. The device draft is preserved.",
      };
    if (!event.data || event.data.status !== "active")
      return {
        ok: false,
        kind: "auth",
        message: "Only active-event strategy/admin users may save.",
      };
    const config = getGameModule(event.data.game_slug).features?.strategyBoard;
    if (!config)
      return {
        ok: false,
        kind: "invalid",
        message: "Game board configuration unavailable.",
      };
    const [match, stations] = await Promise.all([
      db
        .from("matches")
        .select("id")
        .eq("id", value.matchId)
        .eq("event_id", value.eventId)
        .maybeSingle(),
      db
        .from("match_teams")
        .select("match_id,team_number,alliance,station")
        .eq("match_id", value.matchId)
        .eq("event_id", value.eventId),
    ]);
    if (match.error || stations.error)
      return {
        ok: false,
        kind: "transient",
        message: "Match unavailable. The device draft is preserved.",
      };
    if (!match.data)
      return {
        ok: false,
        kind: "invalid",
        message: "Match does not belong to this event.",
      };
    const document = validateBoard(
      value.document,
      event.data.game_slug,
      config,
      stations.data as MatchStation[],
    );
    const saved = await db.rpc("save_strategy_board", {
      target_event: value.eventId,
      target_match: value.matchId,
      expected_revision: value.expectedRevision,
      document: document as Json,
    });
    if (saved.error) {
      if (saved.error.code === "P0001")
        return {
          ok: false,
          kind: "conflict",
          message:
            "Another editor changed the saved board. Export your draft, then reload the saved board to reconcile.",
        };
      if (saved.error.code === "42501")
        return {
          ok: false,
          kind: "auth",
          message:
            "Your account may no longer edit this event. Your draft is preserved.",
        };
      return {
        ok: false,
        kind: "transient",
        message:
          "Save was not confirmed. Your device draft is preserved; retry Save board.",
      };
    }
    return { ok: true, revision: saved.data };
  } catch (error) {
    if (error instanceof AuthorizationError)
      return {
        ok: false,
        kind: "auth",
        message: "Sign in with an active strategy/admin account to save.",
      };
    return {
      ok: false,
      kind: "invalid",
      message: "Board validation failed. Your device draft is preserved.",
    };
  }
}

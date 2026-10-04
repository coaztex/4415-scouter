"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import type { Json } from "@/types/database";
import { profileIds, stateSchema } from "../model";
import { snapshotEvidence } from "../snapshot";
import { getPicklist } from "./queries";
const identity = z.object({
  eventKey: z.string().regex(/^\d{4}[a-z0-9]+$/),
  revision: z.number().int().positive(),
});
const failure = (code: string) =>
  code === "40001"
    ? "Another strategist saved changes. Reload the latest version before saving; your draft is still here."
    : code === "23505"
      ? "That snapshot name already exists. Choose another name."
      : "Could not save. Check your connection, permissions and event status.";
export async function savePicklist(input: unknown) {
  try {
    const value = identity.extend({ state: stateSchema }).parse(input);
    const { db } = await requireRole("strategy");
    const event = await db
      .from("events")
      .select("id")
      .eq("tba_key", value.eventKey)
      .single();
    if (event.error)
      return { ok: false as const, message: "Event unavailable." };
    const result = await db.rpc("save_event_picklist", {
      target: event.data.id,
      expected_revision: value.revision,
      payload: value.state as Json,
    });
    if (result.error)
      return { ok: false as const, message: failure(result.error.code) };
    revalidatePath(`/events/${value.eventKey}/picklist`);
    return { ok: true as const, revision: result.data };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof z.ZodError
          ? (error.issues[0]?.message ?? "Check weights and notes.")
          : "Strategy access is required to save.",
    };
  }
}
export async function createSnapshot(input: unknown) {
  try {
    const value = identity
      .extend({
        name: z.string().trim().min(1).max(80),
        profile: z.enum(profileIds),
      })
      .parse(input);
    const { db } = await requireRole("strategy");
    const workspace = await getPicklist(value.eventKey);
    if (workspace.revision !== value.revision)
      return { ok: false as const, message: failure("40001") };
    const evidence = snapshotEvidence(
      workspace.teams,
      workspace.state,
      workspace.ownTeamNumber,
      value.profile,
    );
    const result = await db.rpc("create_picklist_snapshot", {
      target: workspace.event.id,
      expected_revision: value.revision,
      snapshot_name: value.name,
      payload: evidence as Json,
    });
    if (result.error)
      return { ok: false as const, message: failure(result.error.code) };
    revalidatePath(`/events/${value.eventKey}/picklist`);
    return { ok: true as const, id: result.data };
  } catch {
    return {
      ok: false as const,
      message:
        "Snapshot could not be created. Use a name of 1–80 characters and check your connection.",
    };
  }
}

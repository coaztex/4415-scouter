"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import {
  generateConfigSchema,
  isProtected,
  planRowSchema,
  type ScheduleActionState,
  type PlanOperations,
} from "../model";
import {
  previewSchedule,
  publishAcceptedPreview,
  StaleSchedulePreview,
} from "../publication";
import { planManualEdit } from "../manual-plan";
import { readScheduleSnapshot } from "./queries";
function invalidate(key: string) {
  revalidatePath("/admin/scheduling");
  revalidatePath("/schedule");
  revalidatePath(`/events/${key}`, "layout");
}
function safeError(error: unknown) {
  return error instanceof AuthorizationError
    ? error.message
    : error instanceof z.ZodError
      ? "Check the selected matches, scouts, and schedule constraints."
      : error instanceof ScheduleError
        ? error.message
        : error instanceof StaleSchedulePreview
          ? error.message
          : "Schedule operation failed. Refresh and try again.";
}
class ScheduleError extends Error {}
async function persist(
  eventId: string,
  version: string,
  operations: PlanOperations,
  key: string,
) {
  const { db } = await requireRole("strategy");
  const { error } = await db.rpc("save_scouting_schedule", {
    target: eventId,
    expected_version: version,
    operations,
  });
  if (error)
    throw new ScheduleError(
      error.code === "40001"
        ? "The schedule, roster, or team accounts changed. Refresh and generate a new preview."
        : error.code === "23505"
          ? "That scout or robot already has an assignment or break in this slot. Remove the conflicting editable row first."
          : error.code === "23514"
            ? "This change conflicts with a protected assignment, submission, or imported station. Refresh and review."
            : "The schedule could not be saved. No partial changes were applied.",
    );
  invalidate(key);
}
export async function generateScheduleAction(
  previous: ScheduleActionState,
  form: FormData,
): Promise<ScheduleActionState> {
  try {
    await requireRole("strategy");
    const eventId = z.uuid().parse(form.get("event_id")),
      snapshot = await readScheduleSnapshot(eventId);
    const operation = z.enum(["preview", "save"]).parse(form.get("operation"));
    let config;
    if (operation === "preview") {
      const level = z
        .enum(["qm", "ef", "qf", "sf", "f"])
        .parse(form.get("comp_level"));
      const choices = snapshot.data.matches.filter(
        (m) => m.comp_level === level,
      );
      const start = choices.findIndex((m) => m.id === form.get("first_match")),
        end = choices.findIndex((m) => m.id === form.get("last_match"));
      if (start < 0 || end < start)
        throw new ScheduleError(
          "Choose a valid first and last match in schedule order.",
        );
      config = generateConfigSchema.parse({
        matchIds: choices.slice(start, end + 1).map((m) => m.id),
        scoutIds: form.getAll("scout_id"),
        maxConsecutive: Number(form.get("max_consecutive")),
        replaceMode: form.get("replace_mode"),
      });
    } else {
      if (form.get("confirmed") !== "yes")
        throw new ScheduleError(
          "Review and confirm the preview before saving.",
        );
      config = generateConfigSchema.parse(
        JSON.parse(z.string().max(40000).parse(form.get("config"))),
      );
    }
    if (operation === "preview")
      return {
        preview: previewSchedule(snapshot, config),
        config,
        version: snapshot.version,
        observationVersion: snapshot.observationVersion,
      };
    await publishAcceptedPreview(
      snapshot,
      config,
      previous,
      {
        version: form.get("version"),
        observationVersion: form.get("observation_version"),
      },
      (operations) =>
        persist(
          eventId,
          snapshot.version,
          operations,
          snapshot.data.event.tba_key,
        ),
    );
    return {
      message:
        "Schedule saved transactionally. Protected assignments were preserved.",
    };
  } catch (error) {
    return { error: safeError(error) };
  }
}
export async function editAssignmentAction(
  _state: ScheduleActionState,
  form: FormData,
): Promise<ScheduleActionState> {
  try {
    await requireRole("strategy");
    if (form.get("confirmed") !== "yes")
      throw new ScheduleError("Review and confirm the assignment change.");
    const eventId = z.uuid().parse(form.get("event_id")),
      snapshot = await readScheduleSnapshot(eventId);
    const version = z.string().parse(form.get("version"));
    if (version !== snapshot.version)
      throw new ScheduleError("The schedule changed. Refresh before editing.");
    const operation = z
      .enum(["update", "create", "remove"])
      .parse(form.get("operation"));
    const existing =
      operation === "create"
        ? null
        : snapshot.data.assignments.find((a) => a.id === form.get("id"));
    if (operation !== "create" && !existing)
      throw new ScheduleError("Assignment no longer exists.");
    if (existing && isProtected(existing))
      throw new ScheduleError(
        "This assignment has started or is linked to scouting data. Corrections require a later explicit workflow.",
      );
    let operations: PlanOperations;
    if (operation === "remove") {
      if (existing?.assignment_type !== "break")
        throw new ScheduleError("Only break rows can be removed here.");
      operations = { remove_ids: [existing.id], rows: [] };
    } else {
      const type = z
        .enum(["match", "break"])
        .parse(form.get("assignment_type"));
      const row = planRowSchema.parse({
        id: existing?.id ?? null,
        slot_match_id: form.get("slot_match_id"),
        team_number: type === "break" ? null : Number(form.get("team_number")),
        scout_user_id: form.get("scout_user_id"),
        assignment_type: type,
        status: type === "break" ? "assigned" : form.get("status"),
      });
      if (!snapshot.data.scouts.some((s) => s.id === row.scout_user_id))
        throw new ScheduleError("Choose an active scout.");
      try {
        operations = planManualEdit(snapshot, row);
      } catch (error) {
        throw new ScheduleError(
          error instanceof Error ? error.message : "Invalid edit.",
        );
      }
    }
    await persist(eventId, version, operations, snapshot.data.event.tba_key);
    return {
      message: operation === "remove" ? "Break removed." : "Assignment saved.",
    };
  } catch (error) {
    return { error: safeError(error) };
  }
}
export async function finishBreakAction(
  _state: ScheduleActionState,
  form: FormData,
): Promise<ScheduleActionState> {
  try {
    const { db } = await requireRole("scout");
    const id = z.uuid().parse(form.get("id"));
    const { error } = await db.rpc("finish_scout_break", { assignment: id });
    if (error)
      return {
        error: "This break is no longer available. Refresh your schedule.",
      };
    revalidatePath("/events", "layout");
    revalidatePath("/schedule");
    revalidatePath("/admin/scheduling");
    return { message: "Break finished." };
  } catch {
    return { error: "Sign in with an active account to finish your break." };
  }
}

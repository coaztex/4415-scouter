"use server";
import { revalidatePath } from "next/cache";
import { getEvent } from "@/features/events/server/queries";
import { requireRole } from "@/lib/auth/server";
import { createServiceClient } from "@/lib/supabase/service";
import { confirmIncidentSchema } from "../model";

export async function confirmIncident(input: unknown) {
  const { db, profile } = await requireRole("strategy");
  const parsed = confirmIncidentSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      message: "Enter a cause, evidence note, and confirmation source.",
    };
  const value = parsed.data;
  const event = await getEvent(value.eventKey);
  try {
    const { data: incident, error: lookupError } = await db
      .from("team_incidents")
      .select("event_id,team_number,reviewed_at")
      .eq("id", value.incidentId)
      .maybeSingle();
    if (lookupError || !incident || incident.event_id !== event.id)
      return {
        ok: false,
        message: "This incident is unavailable for the event.",
      };
    if (incident.reviewed_at)
      return {
        ok: false,
        message: "This incident already has a confirmed cause.",
      };
    const { error } = await createServiceClient().rpc("confirm_team_incident", {
      actor: profile.id,
      target: value.incidentId,
      cause: value.cause,
      source: value.source,
      evidence: value.evidence,
    });
    if (error)
      return {
        ok: false,
        message:
          "The confirmation was not saved. Refresh and check whether another reviewer completed it.",
      };
    revalidatePath(`/events/${value.eventKey}/incidents`);
    revalidatePath(`/events/${value.eventKey}/teams/${incident.team_number}`);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "The confirmation was not saved. Refresh and retry.",
    };
  }
}

"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
const noteSchema = z.object({
  eventId: z.uuid(),
  eventKey: z.string().regex(/^\d{4}[a-z0-9]+$/),
  teamNumber: z.number().int().positive(),
  note: z.string().trim().min(1).max(2000),
});
export async function addTeamNote(input: unknown) {
  try {
    const { db, profile } = await requireRole("strategy"),
      value = noteSchema.parse(input);
    const member = await db
      .from("event_teams")
      .select("event_id")
      .eq("event_id", value.eventId)
      .eq("team_number", value.teamNumber)
      .maybeSingle();
    const event = await db
      .from("events")
      .select("tba_key,status")
      .eq("id", value.eventId)
      .maybeSingle();
    if (
      member.error ||
      event.error ||
      !member.data ||
      event.data?.tba_key !== value.eventKey ||
      event.data.status !== "active"
    )
      return { ok: false, message: "This active event team is unavailable." };
    const result = await db.from("team_notes").insert({
      event_id: value.eventId,
      team_number: value.teamNumber,
      author_user_id: profile.id,
      note: value.note,
    });
    if (result.error)
      return {
        ok: false,
        message: "The note was not saved. Check your role and connection.",
      };
    revalidatePath(`/events/${value.eventKey}/teams/${value.teamNumber}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Enter a note of 1–2,000 characters." };
  }
}

"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import { upcomingMatches, type PrepMatch } from "../model";

const schema = z.object({
  eventKey: z.string().regex(/^\d{4}[a-z0-9]+$/),
  matchId: z.uuid(),
  note: z.string().trim().min(1).max(2000),
});
export async function saveMatchPlan(input: unknown) {
  try {
    const value = schema.parse(input);
    const { db, profile } = await requireRole("strategy");
    const event = await db
      .from("events")
      .select("id,status")
      .eq("tba_key", value.eventKey)
      .maybeSingle();
    if (event.error || !event.data || event.data.status !== "active")
      return { ok: false, message: "Active event unavailable." };
    const match = await db
      .from("matches")
      .select(
        "id,tba_match_key,comp_level,set_number,match_number,scheduled_time,predicted_time,actual_time,result_metadata",
      )
      .eq("id", value.matchId)
      .eq("event_id", event.data.id)
      .maybeSingle();
    if (match.error || !match.data)
      return { ok: false, message: "Match unavailable." };
    if (!upcomingMatches([match.data as PrepMatch]).length)
      return { ok: false, message: "This match is already played." };
    const saved = await db.from("match_prep_notes").upsert(
      {
        match_id: value.matchId,
        event_id: event.data.id,
        note: value.note,
        updated_by: profile.id,
      },
      { onConflict: "match_id" },
    );
    if (saved.error) return { ok: false, message: "Plan could not be saved." };
    revalidatePath(`/events/${value.eventKey}/match-prep`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Enter a plan of 1–2,000 characters." };
  }
}

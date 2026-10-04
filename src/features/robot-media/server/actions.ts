"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ROBOT_MEDIA_BUCKET } from "../model";

export async function removeRobotMedia(form: FormData) {
  const { db } = await requireRole("admin");
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid photo.");
  const row = await db
    .from("robot_media")
    .select("id,event_id,team_number,storage_path,source")
    .eq("id", id)
    .single();
  if (row.error || !row.data) throw new Error("Photo unavailable.");
  if (row.data.source !== "pit_upload" || !row.data.storage_path)
    throw new Error("Only pit uploads can be removed here.");
  const event = await db
    .from("events")
    .select("tba_key")
    .eq("id", row.data.event_id)
    .single();
  if (event.error || !event.data) throw new Error("Event unavailable.");
  const svc = createServiceClient();
  const removed = await svc.storage
    .from(ROBOT_MEDIA_BUCKET)
    .remove([row.data.storage_path]);
  if (removed.error)
    throw new Error("Photo could not be removed from storage.");
  const deleted = await svc.from("robot_media").delete().eq("id", id);
  if (deleted.error) throw new Error("Photo metadata could not be removed.");
  revalidatePath(`/events/${event.data.tba_key}/teams/${row.data.team_number}`);
  revalidatePath(`/events/${event.data.tba_key}/pit/${row.data.team_number}`);
}

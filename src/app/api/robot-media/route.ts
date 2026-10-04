import { requireRole, AuthorizationError } from "@/lib/auth/server";
import { createServiceClient } from "@/lib/supabase/service";
import { prepareRobotPhoto } from "@/features/robot-media/server/images";
import { readBoundedBody } from "@/lib/server/bounded-body";
import {
  MAX_INPUT_BYTES,
  MAX_PHOTOS_PER_TEAM,
  ROBOT_MEDIA_BUCKET,
  robotMediaPath,
} from "@/features/robot-media/model";

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin)
      return Response.json(
        { error: "Upload origin is not allowed." },
        { status: 403 },
      );
    const { db, profile } = await requireRole("scout");
    const bytes = await readBoundedBody(request, MAX_INPUT_BYTES + 100_000);
    if (!bytes)
      return Response.json(
        { error: "Photo exceeds the 12 MB upload limit." },
        { status: 413 },
      );
    const form = await new Response(bytes, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const eventKey = String(form.get("eventKey") ?? "");
    const teamNumber = Number(form.get("teamNumber"));
    const file = form.get("photo");
    if (
      !/^\d{4}[a-z0-9]+$/.test(eventKey) ||
      !Number.isSafeInteger(teamNumber) ||
      teamNumber <= 0 ||
      !(file instanceof File)
    )
      return Response.json(
        { error: "Choose an event, team, and photo." },
        { status: 400 },
      );
    const event = await db
      .from("events")
      .select("id,status")
      .eq("tba_key", eventKey)
      .maybeSingle();
    if (event.error || !event.data || event.data.status !== "active")
      return Response.json(
        { error: "This event is unavailable for uploads." },
        { status: 403 },
      );
    const member = await db
      .from("event_teams")
      .select("team_number")
      .eq("event_id", event.data.id)
      .eq("team_number", teamNumber)
      .maybeSingle();
    if (member.error || !member.data)
      return Response.json(
        { error: "Team is not on this event roster." },
        { status: 404 },
      );
    const svc = createServiceClient();
    const existing = await svc
      .from("robot_media")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.data.id)
      .eq("team_number", teamNumber)
      .eq("source", "pit_upload");
    if (existing.error) throw existing.error;
    if ((existing.count ?? 0) >= MAX_PHOTOS_PER_TEAM)
      return Response.json(
        {
          error:
            "This team already has four pit photos. Ask an admin to remove an incorrect one.",
        },
        { status: 409 },
      );
    const jpeg = await prepareRobotPhoto(file);
    const id = crypto.randomUUID();
    const path = robotMediaPath(event.data.id, teamNumber, id);
    const upload = await svc.storage
      .from(ROBOT_MEDIA_BUCKET)
      .upload(path, jpeg, {
        contentType: "image/jpeg",
        cacheControl: "3600",
        upsert: false,
      });
    if (upload.error) throw upload.error;
    const saved = await svc.from("robot_media").insert({
      id,
      event_id: event.data.id,
      team_number: teamNumber,
      storage_path: path,
      source: "pit_upload",
      uploaded_by: profile.id,
      media_type: "robot_photo",
    });
    if (saved.error) {
      await svc.storage.from(ROBOT_MEDIA_BUCKET).remove([path]);
      throw saved.error;
    }
    return Response.json({ ok: true, id });
  } catch (error) {
    if (error instanceof AuthorizationError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      {
        error:
          error instanceof Error &&
          /^(Choose|This image|This photo)/.test(error.message)
            ? error.message
            : "Photo upload failed. Try again when connected.",
      },
      { status: 400 },
    );
  }
}

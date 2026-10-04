import "server-only";
import { createHash } from "node:crypto";
import { requireRole } from "@/lib/auth/server";
import { scheduleSnapshotSchema } from "../model";
export async function listSchedulingEvents() {
  const { db } = await requireRole("strategy");
  const r = await db
    .from("events")
    .select("id,tba_key,name,status")
    .order("year", { ascending: false })
    .order("start_date", { ascending: false })
    .order("id");
  if (r.error) throw new Error("Scheduling events unavailable.");
  return r.data;
}
export async function readScheduleSnapshot(eventId: string) {
  const { db } = await requireRole("strategy");
  const r = await db.rpc("get_schedule_snapshot", { target: eventId });
  if (r.error)
    throw new Error(
      "Schedule unavailable. Check connectivity and scheduling migrations.",
    );
  const snapshot = scheduleSnapshotSchema.parse(r.data);
  const seen = new Set<string>();
  for (let from = 0; from < 20000; from += 500) {
    const result = await db
      .from("match_scouting_submissions")
      .select("id,match_id,team_number")
      .eq("event_id", eventId)
      .eq("status", "final")
      .order("match_id")
      .order("team_number")
      .order("id")
      .range(from, from + 499);
    if (result.error || !result.data)
      throw new Error("Scouting observation counts unavailable.");
    for (const row of result.data)
      seen.add(`${row.match_id}:${row.team_number}`);
    if (result.data.length < 500) break;
    if (from === 19500)
      throw new Error("Scouting observation counts exceed supported size.");
  }
  const keys = [...seen].sort();
  const counts = new Map<number, number>();
  for (const key of keys) {
    const team = Number(key.split(":")[1]);
    counts.set(team, (counts.get(team) ?? 0) + 1);
  }
  snapshot.data.observations = [...counts].map(([team_number, count]) => ({
    team_number,
    count,
  }));
  snapshot.observationVersion = createHash("sha256")
    .update(keys.join("|"))
    .digest("hex");
  return snapshot;
}

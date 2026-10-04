import "server-only";
import { requireRole } from "@/lib/auth/server";
import { organizeScoutSchedule } from "../scout-schedule";
async function allRows<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let start = 0; start < 20000; start += 500) {
    const result = await read(start, start + 499);
    if (result.error || !result.data)
      throw new Error("Scout schedule unavailable.");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
  throw new Error("Schedule exceeds supported size.");
}
/** Identity always comes from the verified session, never a caller-supplied user ID. */
export async function getMyAssignments(eventId: string) {
  const { db, profile } = await requireRole("scout");
  const [assignments, matches, stations] = await Promise.all([
    allRows((from, to) =>
      db
        .from("scouting_assignments")
        .select(
          "id,sequence,assignment_type,status,team_number,match_id,break_match_id",
        )
        .eq("event_id", eventId)
        .eq("scout_user_id", profile.id)
        .order("sequence")
        .order("id")
        .range(from, to),
    ),
    allRows((from, to) =>
      db
        .from("matches")
        .select("id,tba_match_key,scheduled_time")
        .eq("event_id", eventId)
        .order("id")
        .range(from, to),
    ),
    allRows((from, to) =>
      db
        .from("match_teams")
        .select("match_id,team_number,alliance,station")
        .eq("event_id", eventId)
        .order("match_id")
        .order("team_number")
        .range(from, to),
    ),
  ]);
  return organizeScoutSchedule(assignments, matches, stations);
}

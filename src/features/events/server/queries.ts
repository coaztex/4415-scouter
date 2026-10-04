import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { requireRole, AuthorizationError } from "@/lib/auth/server";

export const eventContext = cache(async () => {
  try {
    return await requireRole("scout");
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      redirect("/login");
    throw error;
  }
});
export async function listEvents() {
  const { db } = await eventContext();
  const { data, error } = await db
    .from("events")
    .select(
      "id,tba_key,name,short_name,year,start_date,end_date,city,state,country,status,game_slug,timezone,timezone_source,last_tba_sync_at",
    )
    .order("status", { ascending: true })
    .order("year", { ascending: false })
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("name");
  if (error) throw new Error("Event list unavailable");
  if (!data.length) return [];
  // One RLS-scoped batched read replaces two count requests per event.
  const counts = new Map<string, { teams: number; pits: number }>();
  let complete = false;
  for (let from = 0; from < 20_000; from += 500) {
    const page = await db
      .from("event_teams")
      .select("event_id,pit_status")
      .in(
        "event_id",
        data.map((event) => event.id),
      )
      .order("event_id")
      .order("team_number")
      .range(from, from + 499);
    if (page.error || !page.data)
      throw new Error("Event team counts unavailable");
    for (const row of page.data) {
      const current = counts.get(row.event_id) ?? { teams: 0, pits: 0 };
      current.teams++;
      if (row.pit_status === "completed") current.pits++;
      counts.set(row.event_id, current);
    }
    if (page.data.length < 500) {
      complete = true;
      break;
    }
  }
  if (!complete) throw new Error("Event list exceeds supported size");
  return data.map((event) => ({
    ...event,
    teamCount: counts.get(event.id)?.teams ?? 0,
    pitCompletedCount: counts.get(event.id)?.pits ?? 0,
  }));
}
export const getEvent = cache(async (key: string) => {
  const { db } = await eventContext();
  const { data, error } = await db
    .from("events")
    .select(
      "id,tba_key,name,short_name,year,start_date,end_date,city,state,country,status,game_slug,timezone,timezone_source,last_tba_sync_at,our_team_number",
    )
    .eq("tba_key", key)
    .maybeSingle();
  if (error) throw new Error("Event unavailable");
  if (!data) notFound();
  return data;
});
export async function getEventProgress(id: string) {
  const { db, profile } = await eventContext();
  const results = await Promise.all([
    db
      .from("event_teams")
      .select("team_number", { count: "exact", head: true })
      .eq("event_id", id),
    db
      .from("event_teams")
      .select("team_number", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("pit_status", "completed"),
    db
      .from("scouting_assignments")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("scout_user_id", profile.id)
      .eq("assignment_type", "match")
      .in("status", ["assigned", "in_progress"]),
    db
      .from("match_scouting_submissions")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("status", "final"),
  ]);
  // A failed count is unavailable, never a fabricated zero.
  const count = (index: number) =>
    results[index].error ? null : results[index].count;
  return {
    teams: count(0),
    pits: count(1),
    assignments: count(2),
    samples: count(3),
  };
}

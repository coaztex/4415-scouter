import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import { roles } from "../schemas";
import { adminAccountDetails } from "./accounts";
export const adminContext = cache(async () => {
  try {
    return await requireRole("admin");
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      redirect("/login");
    throw error;
  }
});
export const adminEvents = cache(async () => {
  const { db } = await adminContext();
  const { data, error } = await db
    .from("events")
    .select(
      "id,tba_key,name,status,year,our_team_number,timezone,timezone_source,last_tba_sync_at,last_statbotics_sync_at,event_sync_state(source,status,last_attempt_at,last_success_at,last_error)",
    )
    .order("year", { ascending: false })
    .order("name");
  if (error) throw new Error("Event administration is unavailable.");
  return data;
});
export async function userList(
  params: Record<string, string | string[] | undefined>,
) {
  const { db } = await adminContext();
  const scalar = (key: string) =>
    typeof params[key] === "string" ? params[key] : "";
  const q = scalar("q")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .slice(0, 80);
  const role = roles.find((role) => role === scalar("role"));
  const active = scalar("active");
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(scalar("page"), 10) || 1),
  );
  let query = db
    .from("profiles")
    .select(
      "id,username,display_name,role,active,approval_pending,must_change_password",
      {
        count: "exact",
      },
    )
    .order("display_name")
    .order("id");
  if (q)
    query = query.or(
      `username.ilike.%${q.replaceAll("_", "\\_")}%,display_name.ilike.%${q.replaceAll("_", "\\_")}%`,
    );
  if (role) query = query.eq("role", role);
  if (active === "true" || active === "false")
    query = query.eq("active", active === "true").eq("approval_pending", false);
  if (active === "pending")
    query = query.eq("approval_pending", true).eq("active", false);
  const { data, error, count } = await query.range(
    (page - 1) * 25,
    page * 25 - 1,
  );
  if (error) throw new Error("Account list unavailable.");
  const details = await adminAccountDetails(data.map((user) => user.id));
  return {
    users: data.map((user) => ({ ...user, ...details.get(user.id) })),
    count: count ?? 0,
    page,
    q,
    role: role ?? "",
    active,
  };
}
export async function cacheCounts(id: string) {
  const { db } = await adminContext();
  const results = await Promise.all([
    db
      .from("event_teams")
      .select("team_number", { head: true, count: "exact" })
      .eq("event_id", id),
    db
      .from("matches")
      .select("id", { head: true, count: "exact" })
      .eq("event_id", id),
    db
      .from("event_rankings")
      .select("team_number", { head: true, count: "exact" })
      .eq("event_id", id),
  ]);
  return results.map((result) => (result.error ? null : result.count));
}

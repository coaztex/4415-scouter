import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasProfileRole } from "./account-access";
import type { ProfileRole } from "@/types/database";

export class AuthorizationError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(
      status === 401
        ? "Sign in to continue."
        : "Your account does not have permission for this workspace.",
    );
  }
}
export const requireUser = cache(async () => {
  const db = await createClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new AuthorizationError(401);
  return { db, user: data.user };
});

export const requireRole = cache(async (role: ProfileRole) => {
  const { db, user } = await requireUser();
  const profile = await db
    .from("profiles")
    .select(
      "id,username,display_name,role,active,approval_pending,must_change_password",
    )
    .eq("id", user.id)
    .single();
  if (profile.error || !profile.data || !hasProfileRole(profile.data, role))
    throw new AuthorizationError(403);
  return { db, profile: profile.data };
});

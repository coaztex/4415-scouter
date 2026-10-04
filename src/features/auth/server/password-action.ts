"use server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/server";
import { requireUser } from "@/lib/auth/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseEnvironment } from "@/lib/server/env";
import { allowLoginAttempt } from "./rate-limit";
import { temporaryPassword, type AdminState } from "@/features/admin/schemas";
export async function changePasswordAction(
  _state: AdminState,
  form: FormData,
): Promise<AdminState> {
  try {
    const { db } = await requireRole("scout");
    const current = z
      .string()
      .min(1)
      .max(1024)
      .parse(form.get("current_password"));
    const next = temporaryPassword.parse(form.get("password"));
    if (next !== form.get("confirm_password"))
      return { error: "New passwords do not match." };
    if (next === current) return { error: "Choose a different password." };
    const { user } = await requireUser();
    if (!user.email || !allowLoginAttempt(`password-change:${user.id}`))
      return {
        error:
          "Unable to verify the current password. Wait a minute and retry.",
      };
    // Verify explicitly: some Supabase projects do not require current_password.
    const { url, publishableKey } = getServerSupabaseEnvironment();
    const verifier = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const check = await verifier.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (check.error || check.data.user?.id !== user.id)
      return { error: "Current password could not be verified." };
    await verifier.auth.signOut({ scope: "local" });
    const { error } = await db.auth.updateUser({
      password: next,
      current_password: current,
    });
    if (error)
      return {
        error:
          "Password could not be changed. Check your current password. If Supabase requires reauthentication, sign out and sign back in, then retry.",
      };
    // Revoke other sessions holding the temporary password; keep this session.
    const logout = await db.auth.signOut({ scope: "others" });
    return {
      message: logout.error
        ? "Password changed. Other sessions could not be revoked; contact your administrator if needed."
        : "Password changed. Other sessions have been signed out.",
    };
  } catch {
    return {
      error: "Use an active account and a new password of 16–128 characters.",
    };
  }
}

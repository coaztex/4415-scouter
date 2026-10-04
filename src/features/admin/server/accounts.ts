import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireRole } from "@/lib/auth/server";
import {
  getServerSupabaseEnvironment,
  getServiceRoleEnvironment,
} from "@/lib/server/env";
import type { Database, Json } from "@/types/database";
import { profileValues, expectedProfile } from "../schemas";
import { AdminOperationError, provisionAccount } from "./provision-account";
import { z } from "zod";

export function serviceClient() {
  const { url } = getServerSupabaseEnvironment();
  const { serviceRoleKey } = getServiceRoleEnvironment();
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function adminAccountDetails(ids: string[]) {
  await requireRole("admin");
  const admin = serviceClient();
  if (!ids.length)
    return new Map<string, { email: string | null; created_at: string }>();
  const { data, error } = await admin
    .from("profiles")
    .select("id,created_at")
    .in("id", ids);
  if (error) throw new Error("Account details unavailable.");
  const details = await Promise.all(
    data.map(async (profile) => {
      const { data: account, error } = await admin.auth.admin.getUserById(
        profile.id,
      );
      if (error) throw new Error("Account email unavailable.");
      return [
        profile.id,
        { email: account.user.email ?? null, created_at: profile.created_at },
      ] as const;
    }),
  );
  return new Map(details);
}
export function accountError(error: { code?: string; message?: string }) {
  if (error.message?.includes("last_active_admin"))
    return "Keep at least one active admin. Promote another account before changing this one.";
  if (error.code === "23505") return "That username is already in use.";
  if (error.code === "40001")
    return "This account changed since the page loaded. Refresh and review it again.";
  if (error.code === "42501")
    return "An active administrator account is required.";
  return "The account could not be updated. Refresh and try again.";
}
export async function saveAccount(
  target: string,
  changes: unknown,
  expected: unknown,
) {
  const { profile } = await requireRole("admin");
  const targetId = z.uuid().parse(target);
  const values = profileValues.parse(changes);
  const before = expectedProfile.parse(expected);
  const { error } = await serviceClient().rpc("admin_save_profile", {
    actor_id: profile.id,
    target_id: targetId,
    changes: values,
    expected: before,
  });
  if (error) throw new AdminOperationError(accountError(error));
}

export async function createAccount(input: unknown) {
  const { profile } = await requireRole("admin");
  const admin = serviceClient();
  return provisionAccount(input, {
    async usernameExists(username) {
      const result = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (result.error)
        throw new AdminOperationError(
          "Account setup is unavailable. Check the database migration.",
        );
      return !!result.data;
    },
    async createAuth(values) {
      // The existing trigger creates an inactive scout before activation.
      const result = await admin.auth.admin.createUser({
        email: values.email,
        password: values.password,
        email_confirm: true,
      });
      if (result.error || !result.data.user)
        throw new Error("Auth creation failed");
      return result.data.user.id;
    },
    async activate(id, values) {
      const scaffold = await admin
        .from("profiles")
        .select("username,display_name,role,active,approval_pending")
        .eq("id", id)
        .single();
      if (scaffold.error || !scaffold.data)
        throw new Error("Profile not available");
      const result = await admin.rpc("admin_save_profile", {
        actor_id: profile.id,
        target_id: id,
        changes: {
          username: values.username,
          display_name: values.display_name,
          role: values.role,
          active: true,
          approval_pending: false,
        },
        expected: scaffold.data as Json,
      });
      if (result.error) throw new Error("Activation failed");
    },
  });
}

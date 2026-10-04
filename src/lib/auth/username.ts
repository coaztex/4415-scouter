import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  getServiceRoleEnvironment,
  getServerSupabaseEnvironment,
} from "@/lib/server/env";
import type { Database } from "@/types/database";

export async function registrationUsernameExists(username: string) {
  if (!/^[a-z0-9_]{3,40}$/.test(username)) return true;
  const { url } = getServerSupabaseEnvironment();
  const { serviceRoleKey } = getServiceRoleEnvironment();
  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (error) throw new Error("Registration lookup unavailable");
  return !!data;
}

/** Tightly scoped credential lookup. No reusable privileged client is exported. */
export async function resolveUsernameForLogin(
  username: string,
): Promise<string | null> {
  if (!/^[a-z0-9_]{3,40}$/.test(username)) return null;
  const { url } = getServerSupabaseEnvironment();
  const { serviceRoleKey } = getServiceRoleEnvironment();
  const admin = createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const profile = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (profile.error) throw new Error("Authentication lookup unavailable");
  if (!profile.data) return null;
  const { data, error } = await admin.auth.admin.getUserById(profile.data.id);
  if (error) throw new Error("Authentication lookup unavailable");
  return data.user?.email ?? null;
}

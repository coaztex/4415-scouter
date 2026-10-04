import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  getServerSupabaseEnvironment,
  getServiceRoleEnvironment,
} from "@/lib/server/env";
import type { Database } from "@/types/database";

/** Use only in server actions that verify the caller, then invoke narrow RPCs. */
export function createServiceClient() {
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

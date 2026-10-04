import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  getServerSupabaseEnvironment,
  getServiceRoleEnvironment,
} from "@/lib/server/env";
import type { Database } from "@/types/database";
/** A request-local privileged client; only checked pit actions may call this. */
export function pitServiceClient() {
  const { url } = getServerSupabaseEnvironment(),
    { serviceRoleKey } = getServiceRoleEnvironment();
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

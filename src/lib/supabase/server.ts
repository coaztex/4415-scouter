import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerSupabaseEnvironment } from "@/lib/server/env";
import type { Database } from "@/types/database";

export async function createClient() {
  const { url, publishableKey } = getServerSupabaseEnvironment();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. The request proxy handles
          // refresh before rendering. Actions/Route Handlers can write here.
        }
      },
    },
  });
}

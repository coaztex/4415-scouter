"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnvironment } from "@/lib/env/public";
import type { Database } from "@/types/database";

export function createClient() {
  const { url, publishableKey } = getPublicSupabaseEnvironment();
  return createBrowserClient<Database>(url, publishableKey);
}

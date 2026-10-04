export type PublicSupabaseEnvironment = { url: string; publishableKey: string };

// Direct property reads are required for Next.js build-time public substitution.
// This module must never read or re-export private environment variables.
export function getPublicSupabaseEnvironment(): PublicSupabaseEnvironment {
  return parsePublicSupabaseEnvironment(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function parsePublicSupabaseEnvironment(
  url: string | undefined,
  publishableKey: string | undefined,
): PublicSupabaseEnvironment {
  if (!url || !publishableKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY before using Supabase.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be an HTTPS origin (HTTP is allowed for localhost).",
    );
  }
  // Accept only modern publishable keys; do not let a secret/service-role JWT
  // accidentally occupy a variable that Next.js includes in browser bundles.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key, never a secret or service-role key.",
    );
  }
  return { url: parsed.origin, publishableKey };
}

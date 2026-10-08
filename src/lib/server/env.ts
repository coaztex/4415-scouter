import "server-only";
import { getPublicSupabaseEnvironment } from "../env/public";

export function getTbaEnvironment(): { key: string } {
  const key = process.env.TBA_AUTH_KEY?.trim();
  if (!key)
    throw new Error("Configure TBA_AUTH_KEY in the server environment.");
  return { key };
}

export function getOptionalNexusEnvironment(): { key: string } | null {
  const key = process.env.NEXUS_API_KEY?.trim();
  return key ? { key } : null;
}

export function getServerSupabaseEnvironment() {
  return getPublicSupabaseEnvironment();
}

/** Only for the current public placeholder shell. Protected features must use
 * the strict getter above, never treat missing configuration as authorization. */
export function getOptionalShellSupabaseEnvironment() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return null;
  return getServerSupabaseEnvironment();
}

// Lazily validated: normal user clients and builds never require this secret.
// Used only by the server-only username credential lookup.
export function getServiceRoleEnvironment(): { serviceRoleKey: string } {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for controlled server admin operations.",
    );
  try {
    const parts = key.split(".");
    if (
      parts.length !== 3 ||
      parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
    )
      throw new Error();
    const claims: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (
      typeof claims !== "object" ||
      claims === null ||
      !("role" in claims) ||
      claims.role !== "service_role"
    )
      throw new Error();
  } catch {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be the project's service-role key.",
    );
  }
  // Shape validation only; the Supabase server verifies the signature.
  return { serviceRoleKey: key };
}

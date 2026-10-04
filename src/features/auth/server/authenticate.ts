import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const LOGIN_FAILURE =
  "Unable to sign in. Check your email or username and password, or contact your team administrator.";
const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine(
      (value) =>
        z.email().safeParse(value).success || /^[a-z0-9_]{3,40}$/.test(value),
    ),
  // Never trim passwords or apply signup complexity requirements to existing accounts.
  password: z.string().min(1).max(1024),
});
export interface LoginDependencies {
  resolveUsername(username: string): Promise<string | null>;
  signIn(email: string, password: string): Promise<string | null>;
  activeProfile(
    userId: string,
  ): Promise<boolean | "pending" | "password_change">;
  clearSession(): Promise<void>;
}

/** No user identity or provider error is returned to the caller. */
export async function authenticate(
  input: unknown,
  dependencies: LoginDependencies,
): Promise<boolean | "pending" | "password_change"> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return false;
  let signedIn = false;
  try {
    const { identifier, password } = parsed.data;
    const email = identifier.includes("@")
      ? identifier
      : await dependencies.resolveUsername(identifier);
    // Missing usernames still exercise the password endpoint. This is a failed
    // attempt only: no alias/account is ever created, and the address is not returned.
    const userId = await dependencies.signIn(
      email ?? `${randomUUID()}@invalid.invalid`,
      password,
    );
    signedIn = userId !== null;
    if (userId && email) {
      const access = await dependencies.activeProfile(userId);
      if (
        access === true ||
        access === "pending" ||
        access === "password_change"
      )
        return access;
    }
  } catch {
    // Lookup failures, bad passwords, missing profiles and disabled users share one response.
  }
  if (signedIn) await dependencies.clearSession();
  return false;
}

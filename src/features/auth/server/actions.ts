"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveUsernameForLogin } from "@/lib/auth/username";
import { authenticate, LOGIN_FAILURE } from "./authenticate";
import { allowLoginAttempt } from "./rate-limit";
import type { AuthState } from "../state";
import { accountAccess } from "@/lib/auth/account-access";

export async function loginAction(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const started = Date.now();
  const requestHeaders = await headers();
  // Trust only Vercel's platform-owned header when deployed there. Other hosts
  // share a conservative bucket instead of trusting arbitrary X-Forwarded-For.
  const address =
    process.env.VERCEL === "1"
      ? (requestHeaders.get("x-vercel-forwarded-for") ?? "shared")
      : "local-shared";
  if (!allowLoginAttempt(address))
    return { error: "Too many sign-in attempts. Wait a minute and try again." };
  let success: boolean | "pending" | "password_change" = false;
  try {
    const db = await createClient();
    success = await authenticate(
      { identifier: form.get("identifier"), password: form.get("password") },
      {
        resolveUsername: resolveUsernameForLogin,
        async signIn(email, password) {
          const { data, error } = await db.auth.signInWithPassword({
            email,
            password,
          });
          return error ? null : (data.user?.id ?? null);
        },
        async activeProfile(id) {
          const { data, error } = await db
            .from("profiles")
            .select("id,active,role,approval_pending,must_change_password")
            .eq("id", id)
            .single();
          if (
            error ||
            !data ||
            !["scout", "strategy", "admin"].includes(data.role)
          )
            return false;
          const access = accountAccess(data);
          return access === "pending" || access === "password_change"
            ? access
            : access === "active";
        },
        async clearSession() {
          await db.auth.signOut({ scope: "local" });
          await clearAuthCookies();
        },
      },
    );
  } catch {
    /* Never serialize credentials, provider bodies, or private configuration. */
  }
  if (!success) {
    // Reduce obvious fast-failure differences; not a claim of constant-time networking.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 750 - (Date.now() - started))),
    );
    return { error: LOGIN_FAILURE };
  }
  revalidatePath("/", "layout");
  redirect(
    success === "pending"
      ? "/pending-approval"
      : success === "password_change"
        ? "/change-password"
        : "/events",
  );
}

async function clearAuthCookies() {
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (/^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
      store.delete(cookie.name);
  }
}

export async function logoutAction(): Promise<AuthState> {
  try {
    const db = await createClient();
    const { error } = await db.auth.signOut({ scope: "local" });
    if (error)
      return {
        error: "Could not sign out. Check your connection and try again.",
      };
    await clearAuthCookies();
  } catch {
    return { error: "Could not sign out. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect("/login");
}

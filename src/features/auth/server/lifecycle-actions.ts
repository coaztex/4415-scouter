"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { registrationUsernameExists } from "@/lib/auth/username";
import { requireUser } from "@/lib/auth/server";
import { serviceClient } from "@/features/admin/server/accounts";
import { allowLoginAttempt } from "./rate-limit";
import {
  registerAccount,
  requestPasswordReset,
  completeRequiredPasswordChange,
} from "./flows";
import type { AuthState } from "../state";

async function requestContext(operation: string) {
  const requestHeaders = await headers();
  const address =
    process.env.VERCEL === "1"
      ? (requestHeaders.get("x-vercel-forwarded-for") ?? "shared")
      : "local-shared";
  return {
    allowed: allowLoginAttempt(`${operation}:${address}`),
  };
}

export async function registrationAction(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const request = await requestContext("registration");
  if (!request.allowed)
    return { error: "Too many requests. Wait a minute and try again." };
  let result: Awaited<ReturnType<typeof registerAccount>>;
  try {
    const db = await createClient();
    result = await registerAccount(Object.fromEntries(form), {
      usernameExists: registrationUsernameExists,
      async signUp(values) {
        const { data, error } = await db.auth.signUp({
          email: values.email,
          password: values.password,
          options: {
            data: {
              username: values.username,
              display_name: values.display_name,
            },
          },
        });
        if (error || !data.session)
          throw new Error(
            "Registration failed or email confirmation remains enabled",
          );
        return {
          created: !!data.user && data.user.identities?.length !== 0,
        };
      },
    });
  } catch {
    return {
      error:
        "Account creation is unavailable. Try again later or contact your team administrator.",
    };
  }
  if (!result.created) return result;
  revalidatePath("/", "layout");
  redirect("/pending-approval?created=1");
}

export async function forgotPasswordAction(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const started = Date.now();
  const request = await requestContext("password-reset-request");
  const result = await requestPasswordReset(
    form.get("identifier"),
    async (identifier) => {
      if (!request.allowed) return;
      const { error } = await serviceClient().rpc(
        "submit_password_reset_request",
        { identifier },
      );
      if (error) throw new Error("Reset request unavailable");
    },
  );
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, 700 - (Date.now() - started))),
  );
  return result;
}

export async function requiredPasswordChangeAction(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  let result: AuthState;
  try {
    const { db, user } = await requireUser();
    result = await completeRequiredPasswordChange(Object.fromEntries(form), {
      async eligible() {
        const { data, error } = await db
          .from("profiles")
          .select("active,approval_pending,must_change_password")
          .eq("id", user.id)
          .single();
        return (
          !error &&
          !!data &&
          !data.active &&
          !data.approval_pending &&
          data.must_change_password
        );
      },
      async update(password) {
        return !(await db.auth.updateUser({ password })).error;
      },
      async finish() {
        const { error } = await serviceClient().rpc(
          "complete_required_password_change",
          { actor_id: user.id },
        );
        if (error) return false;
        await db.auth.signOut({ scope: "others" });
        return true;
      },
    });
  } catch {
    return {
      error:
        "Password change is unavailable. Sign in again or contact your team administrator.",
    };
  }
  if (result.success) {
    revalidatePath("/", "layout");
    redirect("/events");
  }
  return result;
}

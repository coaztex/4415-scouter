import "server-only";
import {
  registrationInput,
  resetIdentifier,
  passwordChangeInput,
} from "../schemas";
import type { AuthState } from "../state";
import type { z } from "zod";
import { PASSWORD_LENGTH_HINT } from "@/lib/auth/password-policy";

function validationState(issues: z.core.$ZodIssue[]): AuthState {
  const labels: Record<string, string> = {
    display_name: "Enter a display name of 1–100 characters.",
    username: "Use 3–40 letters, digits, or underscores.",
    email: "Enter a valid email address.",
    password: PASSWORD_LENGTH_HINT,
    confirm_password: "Passwords do not match.",
  };
  return {
    error: "Check the highlighted fields.",
    fieldErrors: Object.fromEntries(
      issues.map((issue) => {
        const key = String(issue.path[0]);
        return [key, labels[key] ?? "Check this field."];
      }),
    ),
  };
}

type Registration = z.infer<typeof registrationInput>;
export async function registerAccount(
  input: unknown,
  dependencies: {
    usernameExists(username: string): Promise<boolean>;
    signUp(
      values: Omit<Registration, "confirm_password">,
    ): Promise<{ created: boolean }>;
  },
): Promise<AuthState & { created?: boolean }> {
  const parsed = registrationInput.safeParse(input);
  if (!parsed.success) return validationState(parsed.error.issues);
  try {
    if (await dependencies.usernameExists(parsed.data.username))
      return {
        error: "That username is already in use.",
        fieldErrors: { username: "Choose another username." },
      };
    const { display_name, username, email, password } = parsed.data;
    const result = await dependencies.signUp({
      display_name,
      username,
      email,
      password,
    });
    if (!result.created)
      return {
        message:
          "If you already have an account, sign in or contact your team administrator.",
      };
    return { created: true };
  } catch {
    // Never return provider errors or identity metadata. The DB unique constraint
    // also rejects a username collision racing the availability check.
    return {
      error:
        "Account could not be created. The username may be unavailable; try again or contact your team administrator.",
    };
  }
}

export const RESET_REQUEST_MESSAGE =
  "If that account exists, a password reset request has been sent to an administrator.";
export async function requestPasswordReset(
  input: unknown,
  submit: (identifier: string) => Promise<void>,
): Promise<AuthState> {
  const parsed = resetIdentifier.safeParse(input);
  if (!parsed.success)
    return {
      error: "Enter your username or email address.",
      fieldErrors: { identifier: "Enter your username or email address." },
    };
  try {
    await submit(parsed.data);
  } catch {
    /* Provider and database errors must not enumerate accounts. */
  }
  return { message: RESET_REQUEST_MESSAGE, success: true };
}

export async function completeRequiredPasswordChange(
  input: unknown,
  dependencies: {
    eligible(): Promise<boolean>;
    update(password: string): Promise<boolean>;
    finish(): Promise<boolean>;
  },
): Promise<AuthState> {
  const parsed = passwordChangeInput.safeParse(input);
  if (!parsed.success) return validationState(parsed.error.issues);
  try {
    if (!(await dependencies.eligible()))
      return {
        error: "A required password change is not available for this account.",
      };
    if (!(await dependencies.update(parsed.data.password)))
      return {
        error:
          "Password could not be updated. Choose a different password and try again.",
      };
    if (!(await dependencies.finish()))
      return {
        error:
          "Password changed, but access could not be restored. Contact your team administrator.",
      };
    return {
      success: true,
      message: "Password updated.",
    };
  } catch {
    return {
      error:
        "Password could not be updated. Try again or contact your team administrator.",
    };
  }
}

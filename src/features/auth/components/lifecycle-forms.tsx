"use client";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/fields";
import {
  registrationAction,
  forgotPasswordAction,
  requiredPasswordChangeAction,
} from "../server/lifecycle-actions";
import type { AuthState } from "../state";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_LENGTH_HINT,
} from "@/lib/auth/password-policy";

function Result({ state }: { state: AuthState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-foreground">
          {state.message}
        </p>
      )}
    </>
  );
}
const backLink =
  "inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline";

export function RegistrationForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    registrationAction,
    {},
  );
  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="register-name"
            name="display_name"
            label="Display name"
            autoComplete="name"
            required
            maxLength={100}
            error={state.fieldErrors?.display_name}
          />
          <Input
            id="register-username"
            name="username"
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            pattern="[a-zA-Z0-9_]{3,40}"
            maxLength={40}
            hint="3–40 letters, digits, or underscores."
            error={state.fieldErrors?.username}
          />
        </div>
        <Input
          id="register-email"
          name="email"
          type="email"
          label="Email"
          autoComplete="email"
          autoCapitalize="none"
          required
          maxLength={254}
          error={state.fieldErrors?.email}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="register-password"
            name="password"
            type="password"
            label="Password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            hint={PASSWORD_LENGTH_HINT}
            error={state.fieldErrors?.password}
          />
          <Input
            id="register-confirm"
            name="confirm_password"
            type="password"
            label="Confirm password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            error={state.fieldErrors?.confirm_password}
          />
        </div>
        <p className="text-sm text-muted">
          Use a unique password. Admin approval is required.
        </p>
        <Result state={state} />
        <Button type="submit" className="w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </fieldset>
      <Link href="/login" className={backLink}>
        Back to sign in
      </Link>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    forgotPasswordAction,
    {},
  );
  return (
    <form action={action} className="space-y-5" aria-busy={pending}>
      <Input
        id="reset-identifier"
        name="identifier"
        label="Username or email"
        autoComplete="username"
        autoCapitalize="none"
        required
        maxLength={254}
        readOnly={pending}
        error={state.fieldErrors?.identifier}
      />
      <Result state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Submitting…" : "Request password reset"}
      </Button>
      <Link href="/login" className={backLink}>
        Back to sign in
      </Link>
    </form>
  );
}

export function RequiredPasswordChangeForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    requiredPasswordChangeAction,
    {},
  );
  return (
    <form action={action} className="space-y-5" aria-busy={pending}>
      <Input
        id="reset-password"
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        readOnly={pending}
        hint={PASSWORD_LENGTH_HINT}
        error={state.fieldErrors?.password}
      />
      <Input
        id="reset-confirm"
        name="confirm_password"
        type="password"
        label="Confirm new password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        readOnly={pending}
        error={state.fieldErrors?.confirm_password}
      />
      <Result state={state} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}

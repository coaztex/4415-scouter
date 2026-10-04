"use client";
import { useActionState } from "react";
import { changePasswordAction } from "../server/password-action";
import { Input } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <fieldset disabled={pending} className="space-y-4">
        <Input
          id="current-password"
          name="current_password"
          label="Current password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Input
          id="next-password"
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          minLength={16}
          maxLength={128}
          required
          hint="At least 16 characters. Use a unique password or passphrase."
        />
        <Input
          id="confirm-password"
          name="confirm_password"
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          minLength={16}
          maxLength={128}
          required
        />
        <Button type="submit">
          {pending ? "Changing password…" : "Change password"}
        </Button>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}

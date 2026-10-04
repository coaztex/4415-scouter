"use client";
import { useActionState } from "react";
import type { AuthState } from "../state";
import { logoutAction } from "../server/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    logoutAction,
    {},
  );
  return (
    <form action={action}>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-2 max-w-xs text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

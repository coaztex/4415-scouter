"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "../server/actions";
import { Input } from "@/components/ui/fields";
import { Button, buttonStyles } from "@/components/ui/button";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  return (
    <form action={action} className="space-y-5" aria-busy={pending}>
      <Input
        id="identifier"
        name="identifier"
        label="Email or username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={254}
        readOnly={pending}
      />
      <Input
        id="password"
        name="password"
        type="password"
        label="Password"
        labelAction={
          <Link
            href="/forgot-password"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline"
          >
            Forgot password?
          </Link>
        }
        autoComplete="current-password"
        required
        maxLength={1024}
        readOnly={pending}
      />
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <div className="border-t border-border pt-5">
        <p className="mb-3 text-sm text-muted">New to Epic Scout?</p>
        <Link
          href="/register"
          className={`${buttonStyles("secondary")} w-full`}
        >
          Create account
        </Link>
      </div>
    </form>
  );
}

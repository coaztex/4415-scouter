"use client";
import { useActionState } from "react";
import {
  accountAction,
  accountApprovalAction,
  passwordResetDecisionAction,
} from "../server/actions";
import { roles, type ProfileValues } from "../schemas";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/fields";
import { Card } from "@/components/ui/card";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_LENGTH_HINT,
} from "@/lib/auth/password-policy";
function Result({ state }: { state: { error?: string; message?: string } }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
      {state.message && <p role="status">{state.message}</p>}
    </>
  );
}
function RoleSelect({ id, role = "scout" }: { id: string; role?: string }) {
  return (
    <Select id={id} name="role" label="Role" defaultValue={role}>
      {roles.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </Select>
  );
}
export function CreateAccountForm() {
  const [state, action, pending] = useActionState(accountAction, {});
  return (
    <Card>
      <h2 className="mb-4 text-xl font-bold">Create account</h2>
      <form action={action} className="space-y-4" aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-4">
          <input type="hidden" name="operation" value="create" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="new-name"
              name="display_name"
              label="Display name"
              required
              maxLength={100}
            />
            <Input
              id="new-username"
              name="username"
              label="Username"
              required
              pattern="[a-zA-Z0-9_]{3,40}"
              autoCapitalize="none"
              autoComplete="off"
              hint="3–40 letters, digits, or underscores."
            />
            <Input
              id="new-email"
              name="email"
              type="email"
              label="Email"
              autoComplete="off"
              required
              maxLength={254}
            />
            <RoleSelect id="new-role" />
            <Input
              id="new-password"
              name="password"
              type="password"
              label="Temporary password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              hint={`${PASSWORD_LENGTH_HINT} Use a unique password. Share it privately.`}
            />
          </div>
          <label className="flex min-h-12 items-start gap-3 py-3">
            <input
              type="checkbox"
              name="confirmed"
              value="yes"
              required
              className="mt-1 size-5 shrink-0"
            />
            I confirm this email belongs to the team member, the selected role
            is appropriate, and I will share the temporary password privately.
            This creates an active account without an invitation email.
          </label>
          <Button type="submit">
            {pending ? "Creating…" : "Create account"}
          </Button>
        </fieldset>
        <Result state={state} />
      </form>
    </Card>
  );
}
export function AccountEditor({
  user,
  currentUserId,
}: {
  user: ProfileValues & {
    id: string;
    email?: string | null;
    created_at?: string;
    must_change_password: boolean;
  };
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState(accountAction, {});
  const { id } = user;
  const expected: ProfileValues & { must_change_password: boolean } = {
    username: user.username,
    display_name: user.display_name,
    role: user.role,
    active: user.active,
    approval_pending: user.approval_pending,
    must_change_password: user.must_change_password,
  };
  return (
    <Card>
      <h3 className="text-lg font-bold">
        {user.display_name || user.username}
        {id === currentUserId ? " (you)" : ""}
      </h3>
      <p className="mb-4 text-sm text-muted">
        {user.username} · {user.role} ·{" "}
        {user.approval_pending
          ? "Pending approval"
          : user.must_change_password
            ? "Password change required"
            : user.active
              ? "Active"
              : "Disabled / inactive"}
      </p>
      {user.email && (
        <p className="mb-2 break-all text-sm text-muted">{user.email}</p>
      )}
      {user.created_at && (
        <p className="mb-4 text-xs text-muted">
          Created{" "}
          {new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeZone: "UTC",
          }).format(new Date(user.created_at))}{" "}
          (UTC)
        </p>
      )}
      {user.approval_pending && (
        <AccountApprovalForm id={id} expected={expected} />
      )}
      <details>
        <summary className="min-h-12 cursor-pointer py-3 font-bold text-accent">
          Edit account
        </summary>
        <form action={action} className="space-y-4" aria-busy={pending}>
          <fieldset disabled={pending} className="space-y-4">
            <input type="hidden" name="operation" value="update" />
            <input type="hidden" name="id" value={id} />
            <input
              type="hidden"
              name="approval_pending"
              value={String(user.approval_pending)}
            />
            <input
              type="hidden"
              name="expected"
              value={JSON.stringify(expected)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id={`name-${id}`}
                name="display_name"
                label="Display name"
                defaultValue={user.display_name}
                maxLength={100}
                required
              />
              <Input
                id={`username-${id}`}
                name="username"
                label="Username"
                defaultValue={user.username}
                pattern="[a-zA-Z0-9_]{3,40}"
                required
              />
              <RoleSelect id={`role-${id}`} role={user.role} />
              <Select
                id={`active-${id}`}
                name="active"
                label="Account access"
                defaultValue={
                  user.must_change_password && !user.approval_pending
                    ? "change"
                    : String(user.active)
                }
              >
                {user.must_change_password && !user.approval_pending ? (
                  <option value="change">Password change required</option>
                ) : (
                  <option value="true">Active</option>
                )}
                <option value="false">Inactive</option>
              </Select>
            </div>
            <label className="flex min-h-12 items-start gap-3 py-3">
              <input
                type="checkbox"
                name="confirmed"
                value="yes"
                required
                className="mt-1 size-5 shrink-0"
              />
              I confirm these changes to {user.display_name || user.username}.
              Role changes alter permissions; deactivation blocks application
              access. At least one active admin must remain.
            </label>
            <Button type="submit">
              {pending ? "Saving…" : "Save account changes"}
            </Button>
          </fieldset>
          <Result state={state} />
        </form>
      </details>
      {!user.active && (
        <p className="mt-3 break-all text-xs text-muted">Account ID: {id}</p>
      )}
    </Card>
  );
}

function AccountApprovalForm({
  id,
  expected,
}: {
  id: string;
  expected: ProfileValues & { must_change_password: boolean };
}) {
  const [state, action, pending] = useActionState(accountApprovalAction, {});
  return (
    <form action={action} className="mb-4 space-y-3" aria-busy={pending}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expected" value={JSON.stringify(expected)} />
      <fieldset disabled={pending} className="space-y-3">
        <RoleSelect id={`approval-role-${id}`} />
        <p className="text-xs text-muted">
          Assign Strategy or Admin only when required.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="operation" value="approve">
            {pending ? "Saving…" : "Approve"}
          </Button>
          <Button
            type="submit"
            name="operation"
            value="reject"
            variant="secondary"
          >
            Reject / disable
          </Button>
        </div>
      </fieldset>
      <Result state={state} />
    </form>
  );
}

export function PasswordResetRequestForm({
  request,
}: {
  request: {
    id: string;
    username: string;
    display_name: string;
    email: string | null;
    requested_at: string;
    approval_pending: boolean;
  };
}) {
  const [state, action, pending] = useActionState(
    passwordResetDecisionAction,
    {},
  );
  return (
    <Card>
      <h3 className="text-lg font-bold">
        {request.display_name || request.username}
      </h3>
      <p className="break-all text-sm text-muted">
        {request.username}
        {request.email ? ` · ${request.email}` : ""}
      </p>
      <p className="text-xs text-muted">
        Requested{" "}
        {new Intl.DateTimeFormat("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "UTC",
        }).format(new Date(request.requested_at))}{" "}
        UTC{request.approval_pending ? " · Pending approval" : ""}
      </p>
      <form action={action} className="mt-4 space-y-3" aria-busy={pending}>
        <input type="hidden" name="id" value={request.id} />
        <Input
          id={`temporary-${request.id}`}
          name="temporary_password"
          type="password"
          label="Temporary password (optional)"
          autoComplete="off"
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          hint={`${PASSWORD_LENGTH_HINT} Use a unique password, or leave blank to generate one.`}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            name="operation"
            value="reset"
            disabled={pending}
          >
            Generate temporary password
          </Button>
          <Button
            type="submit"
            name="operation"
            value="dismiss"
            variant="secondary"
            disabled={pending}
          >
            Dismiss
          </Button>
        </div>
        <Result state={state} />
        {state.temporaryPassword && (
          <div className="rounded-control border border-border bg-surface-subtle p-3">
            <p className="text-sm font-semibold">
              Temporary password — copy now and share privately
            </p>
            <code className="mt-2 block break-all select-all text-sm">
              {state.temporaryPassword}
            </code>
            <p className="mt-2 text-xs text-muted">
              Copy before leaving or refreshing; this password is shown once.
            </p>
          </div>
        )}
      </form>
    </Card>
  );
}

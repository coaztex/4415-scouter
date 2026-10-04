import Link from "next/link";
import { PageHeading } from "@/components/layout/page-heading";
import { Input, Select } from "@/components/ui/fields";
import { Button, buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { roles } from "@/features/admin/schemas";
import { adminContext, userList } from "@/features/admin/server/queries";
import { pendingPasswordResets } from "@/features/admin/server/password-resets";
import {
  CreateAccountForm,
  AccountEditor,
  PasswordResetRequestForm,
} from "@/features/admin/components/account-forms";
export const metadata = { title: "User administration" };
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { profile } = await adminContext();
  const params = await searchParams;
  const result = await userList(params);
  const resetPage = Math.max(
    1,
    Math.min(
      10000,
      Number.parseInt(
        typeof params.resetPage === "string" ? params.resetPage : "1",
        10,
      ) || 1,
    ),
  );
  const resetQueue = await pendingPasswordResets(resetPage);
  const resetRequests = resetQueue.requests;
  const pageLink = (page: number) =>
    `/admin/users?${new URLSearchParams({ q: result.q, role: result.role, active: result.active, page: String(page) })}`;
  return (
    <>
      <PageHeading eyebrow="Administration" title="Users" />
      <section
        className="mb-8 space-y-4"
        aria-labelledby="reset-requests-heading"
      >
        <h2 id="reset-requests-heading" className="text-xl font-bold">
          Password reset requests ({resetQueue.count})
        </h2>
        <p className="text-sm text-muted">
          Generate a temporary password and share it privately with the verified
          team member. A pending account still needs approval.
        </p>
        {resetRequests.length ? (
          resetRequests.map((request) => (
            <PasswordResetRequestForm key={request.id} request={request} />
          ))
        ) : (
          <p className="text-sm text-muted">
            No pending password reset requests.
          </p>
        )}
        <div className="flex gap-3">
          {resetPage > 1 && (
            <Link
              className={buttonStyles("secondary")}
              href={`/admin/users?resetPage=${resetPage - 1}`}
            >
              Previous requests
            </Link>
          )}
          {resetPage * 25 < resetQueue.count && (
            <Link
              className={buttonStyles("secondary")}
              href={`/admin/users?resetPage=${resetPage + 1}`}
            >
              Next requests
            </Link>
          )}
        </div>
      </section>
      <details className="mb-8">
        <summary className="min-h-12 cursor-pointer py-3 font-bold text-accent">
          Create a team account
        </summary>
        <CreateAccountForm />
      </details>
      <form className="mb-6 grid items-end gap-4 sm:grid-cols-4">
        <Input
          id="search"
          name="q"
          label="Search name or username"
          defaultValue={result.q}
          maxLength={80}
        />
        <Select
          id="filter-role"
          name="role"
          label="Role"
          defaultValue={result.role}
        >
          <option value="">All roles</option>
          {roles.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </Select>
        <Select
          id="filter-active"
          name="active"
          label="Status"
          defaultValue={result.active}
        >
          <option value="">All accounts</option>
          <option value="true">Active</option>
          <option value="pending">Pending approval</option>
          <option value="false">Disabled / inactive</option>
        </Select>
        <Button type="submit" variant="secondary">
          Search / filter
        </Button>
      </form>
      <p className="mb-4 text-sm text-muted">
        {result.count} matching accounts
      </p>
      {result.users.length ? (
        <div className="space-y-4">
          {result.users.map((user) => (
            <AccountEditor
              key={`${user.id}:${user.role}:${user.active}:${user.approval_pending}:${user.must_change_password}:${user.username}:${user.display_name}`}
              user={user}
              currentUserId={profile.id}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No matching accounts"
          description="Try another search or filter."
        />
      )}
      <div className="mt-6 flex gap-3">
        {result.page > 1 && (
          <Link
            className={buttonStyles("secondary")}
            href={pageLink(result.page - 1)}
          >
            Previous
          </Link>
        )}
        {result.page * 25 < result.count && (
          <Link
            className={buttonStyles("secondary")}
            href={pageLink(result.page + 1)}
          >
            Next
          </Link>
        )}
      </div>
    </>
  );
}

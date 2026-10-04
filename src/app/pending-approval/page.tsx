import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { AuthPage } from "@/features/auth/components/auth-page";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { buttonStyles } from "@/components/ui/button";
export const metadata = { title: "Waiting for approval" };
export default async function PendingApprovalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const session = await requireUser().catch(() => null);
  if (session) {
    const { data } = await session.db
      .from("profiles")
      .select("active,approval_pending,must_change_password")
      .eq("id", session.user.id)
      .single();
    if (!data?.approval_pending && data?.must_change_password)
      redirect("/change-password");
    if (data?.active) redirect("/events");
    if (!data?.approval_pending) redirect("/login");
  } else if (params.created !== "1") redirect("/login");
  return (
    <AuthPage title="Account created">
      <div className="space-y-5">
        <p className="text-lg font-semibold">
          Your account is waiting for team approval.
        </p>
        <p className="text-sm text-muted">
          An administrator must approve your account before scouting access is
          enabled.
        </p>
        {session?.user.email && (
          <p className="break-all text-sm text-muted">{session.user.email}</p>
        )}
        {session ? (
          <LogoutButton />
        ) : (
          <Link href="/login" className={`${buttonStyles("secondary")} w-full`}>
            Back to sign in
          </Link>
        )}
      </div>
    </AuthPage>
  );
}

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { AuthPage } from "@/features/auth/components/auth-page";
import { RequiredPasswordChangeForm } from "@/features/auth/components/lifecycle-forms";
import { LogoutButton } from "@/features/auth/components/logout-button";

export const metadata = { title: "Change password" };
export default async function RequiredPasswordChangePage() {
  const session = await requireUser().catch(() => null);
  if (!session) redirect("/login");
  const { data } = await session.db
    .from("profiles")
    .select("active,approval_pending,must_change_password")
    .eq("id", session.user.id)
    .single();
  if (data?.approval_pending) redirect("/pending-approval");
  if (data?.active && !data.must_change_password) redirect("/events");
  if (!data?.must_change_password) redirect("/login");
  return (
    <AuthPage
      title="Change password"
      description="Replace the temporary password before entering the workspace."
    >
      <RequiredPasswordChangeForm />
      <div className="mt-5">
        <LogoutButton />
      </div>
    </AuthPage>
  );
}

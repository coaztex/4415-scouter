import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { AuthPage } from "@/features/auth/components/auth-page";
import { RegistrationForm } from "@/features/auth/components/lifecycle-forms";
export const metadata = { title: "Create account" };
export default async function RegisterPage() {
  const session = await requireUser().catch(() => null);
  if (session) {
    const { data } = await session.db
      .from("profiles")
      .select("active,approval_pending")
      .eq("id", session.user.id)
      .single();
    if (data?.active) redirect("/events");
    if (data?.approval_pending) redirect("/pending-approval");
  }
  return (
    <AuthPage title="Create account" wide>
      <RegistrationForm />
    </AuthPage>
  );
}

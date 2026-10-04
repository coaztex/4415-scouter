import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { AuthPage } from "@/features/auth/components/auth-page";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await requireUser().catch(() => null);
  if (session) {
    const { data } = await session.db
      .from("profiles")
      .select("active,approval_pending,must_change_password")
      .eq("id", session.user.id)
      .single();
    if (data?.approval_pending) redirect("/pending-approval");
    if (data?.must_change_password) redirect("/change-password");
    if (data?.active) redirect("/events");
  }
  return (
    <AuthPage title="Welcome to Epic Scout" description="Are ya scouting, son?">
      <h2 className="mb-6 text-xl font-bold">Sign in</h2>
      <LoginForm />
    </AuthPage>
  );
}

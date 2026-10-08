import { redirect } from "next/navigation";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import { PageHeading } from "@/components/layout/page-heading";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/states";
import { PasswordForm } from "@/features/auth/components/password-form";
export const metadata = { title: "Account" };
export default async function AccountPage() {
  let context;
  try {
    context = await requireRole("scout");
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      redirect("/login");
    return (
      <ErrorState
        title="Account inactive"
        description="Contact your team administrator to restore access."
      />
    );
  }
  return (
    <div className="max-w-xl">
      <PageHeading
        eyebrow="Your account"
        title={context.profile.display_name || "Account"}
        description="Account access is managed by an administrator."
      />
      <Card>
        <h2 className="mb-5 text-xl font-bold">Change password</h2>
        <PasswordForm />
      </Card>
    </div>
  );
}

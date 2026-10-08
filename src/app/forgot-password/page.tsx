import { AuthPage } from "@/features/auth/components/auth-page";
import { ForgotPasswordForm } from "@/features/auth/components/lifecycle-forms";
export const metadata = { title: "Forgot password" };
export default function ForgotPasswordPage() {
  return (
    <AuthPage
      title="Forgot password?"
      description="An administrator will review your request and share a temporary password privately."
    >
      <ForgotPasswordForm />
    </AuthPage>
  );
}

import { AuthPage } from "@/features/auth/components/auth-page";
import { ForgotPasswordForm } from "@/features/auth/components/lifecycle-forms";
export const metadata = { title: "Forgot password" };
export default function ForgotPasswordPage() {
  return (
    <AuthPage
      title="Forgot password?"
      description="Enter your username or email. A team administrator will review the request and share a temporary password privately."
    >
      <ForgotPasswordForm />
    </AuthPage>
  );
}

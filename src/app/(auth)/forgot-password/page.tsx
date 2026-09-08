import type { Metadata } from "next";
import { AuthFormShell, AuthLink } from "@/components/auth/auth-form-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthFormShell
      title="Forgot your password?"
      description="Enter your email and we will send you a link to reset it."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      <ForgotPasswordForm />
    </AuthFormShell>
  );
}

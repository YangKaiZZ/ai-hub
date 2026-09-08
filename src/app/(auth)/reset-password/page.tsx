import type { Metadata } from "next";
import { AuthFormShell, AuthLink } from "@/components/auth/auth-form-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <AuthFormShell
        title="Link missing"
        description="This reset link is incomplete. Request a new one and try again."
        footer={<AuthLink href="/forgot-password">Request a new link</AuthLink>}
      >
        <div />
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell title="Choose a new password" description="Pick something memorable that you have not used before.">
      <ResetPasswordForm token={token} />
    </AuthFormShell>
  );
}

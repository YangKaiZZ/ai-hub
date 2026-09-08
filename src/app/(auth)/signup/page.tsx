import type { Metadata } from "next";
import { AuthFormShell, AuthLink } from "@/components/auth/auth-form-shell";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <AuthFormShell
      title="Create your account"
      description="Set up your hub in under two minutes. No institutional verification needed."
      footer={
        <>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>
        </>
      }
    >
      <SignupForm />
    </AuthFormShell>
  );
}

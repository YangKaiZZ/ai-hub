import type { Metadata } from "next";
import { AuthFormShell, AuthLink } from "@/components/auth/auth-form-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthFormShell
      title="Welcome back"
      description="Sign in to pick up where you left off."
      footer={
        <>
          New to AI Hub? <AuthLink href="/signup">Create an account</AuthLink>
        </>
      }
    >
      <LoginForm nextPath={next} />
    </AuthFormShell>
  );
}

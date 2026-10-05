import type { Metadata } from "next";
import { AuthFormShell, AuthLink } from "@/components/auth/auth-form-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; demo?: string }> }) {
  const { next, demo } = await searchParams;
  // Read on the server so the demo form arrives already filled in, with no
  // client-side search-param hook and no suspense boundary to reveal.
  const isDemo = demo === "1";
  return (
    <AuthFormShell
      title={isDemo ? "Try the demo" : "Welcome back"}
      description={isDemo ? "The demo student's details are filled in below. Just press Sign in." : "Sign in to pick up where you left off."}
      footer={
        <>
          New to AI Hub? <AuthLink href="/signup">Create an account</AuthLink>
        </>
      }
    >
      <LoginForm nextPath={next} demo={isDemo} />
    </AuthFormShell>
  );
}

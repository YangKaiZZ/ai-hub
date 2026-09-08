"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AuthLink } from "@/components/auth/auth-form-shell";
import { ApiClientError, apiPost } from "@/lib/client/api";

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setFormError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await apiPost<{ next: string }>("/api/auth/login", {
        email: form.get("email"),
        password: form.get("password"),
      });
      router.push(nextPath && nextPath.startsWith("/") ? nextPath : res.next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details) setErrors(err.details);
        setFormError(err.code === "UNAUTHORIZED" ? "Incorrect email or password." : err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {formError ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {formError}
        </div>
      ) : null}
      <Field id="email" label="Email" required error={errors.email}>
        <Input name="email" type="email" autoComplete="email" placeholder="you@school.edu" required />
      </Field>
      <div className="space-y-1.5">
        <Field id="password" label="Password" required error={errors.password}>
          <Input name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
        </Field>
        <div className="text-right text-xs">
          <AuthLink href="/forgot-password">Forgot password?</AuthLink>
        </div>
      </div>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Sign in
      </Button>
    </form>
  );
}

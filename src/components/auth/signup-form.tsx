"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiPost } from "@/lib/client/api";

export function SignupForm() {
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
      const res = await apiPost<{ next: string }>("/api/auth/signup", {
        firstName: form.get("firstName"),
        lastName: form.get("lastName"),
        email: form.get("email"),
        password: form.get("password"),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      router.push(res.next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details) setErrors(err.details);
        else setFormError(err.message);
        if (err.code === "CONFLICT") setErrors({ email: err.message });
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
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="firstName" label="First name" required error={errors.firstName}>
          <Input name="firstName" autoComplete="given-name" placeholder="Andrew" required />
        </Field>
        <Field id="lastName" label="Last name" error={errors.lastName}>
          <Input name="lastName" autoComplete="family-name" placeholder="Reyes" />
        </Field>
      </div>
      <Field id="email" label="Email" required error={errors.email}>
        <Input name="email" type="email" autoComplete="email" placeholder="you@school.edu" required />
      </Field>
      <Field id="password" label="Password" required hint="At least 8 characters with a letter and a number." error={errors.password}>
        <Input name="password" type="password" autoComplete="new-password" placeholder="Create a password" required />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Create account
      </Button>
      <p className="text-center text-xs text-subtle">
        By continuing you agree to use AI Hub as a study assistant, in line with your institution&apos;s academic policies.
      </p>
    </form>
  );
}

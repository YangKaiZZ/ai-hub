"use client";

import * as React from "react";
import { EnvelopeSimpleIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiPost } from "@/lib/client/api";

export function ForgotPasswordForm() {
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await apiPost("/api/auth/forgot-password", { email: form.get("email") });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="rounded-2xl border border-border bg-surface p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-success-soft text-success">
          <EnvelopeSimpleIcon className="size-6" />
        </div>
        <h2 className="font-semibold">Check your inbox</h2>
        <p className="mt-1 text-sm text-muted">
          If an account exists for that email, we sent a link to reset your password. It expires in one hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <Field id="email" label="Email" required>
        <Input name="email" type="email" autoComplete="email" placeholder="you@school.edu" required />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Send reset link
      </Button>
    </form>
  );
}

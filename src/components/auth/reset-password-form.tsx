"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiPost } from "@/lib/client/api";
import { toast } from "@/components/ui/toaster";

export function ResetPasswordForm({ token }: { token: string }) {
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
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setErrors({ confirm: "Passwords do not match" });
      setLoading(false);
      return;
    }
    try {
      await apiPost("/api/auth/reset-password", { token, password });
      toast.success("Password updated. You can sign in now.");
      router.push("/login");
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.details?.token) setFormError("This reset link is invalid or has expired. Request a new one.");
        else if (err.details) setErrors(err.details);
        else setFormError(err.message);
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
      <Field id="password" label="New password" required hint="At least 8 characters with a letter and a number." error={errors.password}>
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field id="confirm" label="Confirm password" required error={errors.confirm}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Update password
      </Button>
    </form>
  );
}

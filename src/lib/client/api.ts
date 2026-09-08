"use client";

import type { ApiFailure, ApiSuccess } from "@/lib/api";

export class ApiClientError extends Error {
  code: string;
  status: number;
  details?: Record<string, string>;
  constructor(status: number, failure: ApiFailure["error"]) {
    super(failure.message);
    this.name = "ApiClientError";
    this.code = failure.code;
    this.status = status;
    this.details = failure.details as Record<string, string> | undefined;
  }
}

/** Typed fetch wrapper for our JSON API. Throws ApiClientError on failure. */
export async function api<T>(input: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(input, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });

  let payload: ApiSuccess<T> | ApiFailure | null = null;
  try {
    payload = (await res.json()) as ApiSuccess<T> | ApiFailure;
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || !payload.ok) {
    const failure = payload && !payload.ok ? payload.error : { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." };
    throw new ApiClientError(res.status, failure);
  }
  return payload.data;
}

export const apiGet = <T>(url: string) => api<T>(url);
export const apiPost = <T>(url: string, json?: unknown) => api<T>(url, { method: "POST", json });
export const apiPatch = <T>(url: string, json?: unknown) => api<T>(url, { method: "PATCH", json });
export const apiDelete = <T>(url: string) => api<T>(url, { method: "DELETE" });

import { env } from "@/lib/env";
import { RateLimitError } from "@/lib/errors";

/**
 * Rate limiting abstraction. The default store is in-memory (per server
 * instance) which is fine for a single node; swap `RateLimitStore` for a Redis
 * implementation when running multiple instances.
 */
export interface RateLimitStore {
  /** Increment the counter for `key` inside the current window and return the count + reset time. */
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = Date.now();

  async hit(key: string, windowMs: number) {
    const now = Date.now();
    this.sweep(now);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }
    bucket.count += 1;
    return bucket;
  }

  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
  }
}

const globalStore = globalThis as unknown as { __aihubRateLimitStore?: RateLimitStore };
let store: RateLimitStore = globalStore.__aihubRateLimitStore ?? (globalStore.__aihubRateLimitStore = new MemoryStore());

export function setRateLimitStore(next: RateLimitStore) {
  store = next;
}

export interface RateLimitPolicy {
  /** Logical name; part of the key. */
  name: string;
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  // Generous enough for shared campus IPs; tight enough to blunt credential stuffing.
  login: { name: "login", limit: 20, windowMs: 15 * 60_000 },
  signup: { name: "signup", limit: 30, windowMs: 60 * 60_000 },
  passwordReset: { name: "password-reset", limit: 5, windowMs: 60 * 60_000 },
  ai: { name: "ai", limit: 40, windowMs: 60_000 },
  upload: { name: "upload", limit: 20, windowMs: 10 * 60_000 },
  api: { name: "api", limit: 300, windowMs: 60_000 },
  integrationSync: { name: "sync", limit: 6, windowMs: 10 * 60_000 },
} satisfies Record<string, RateLimitPolicy>;

/** Throws RateLimitError when the policy is exceeded for the given identifier. */
export async function enforceRateLimit(policy: RateLimitPolicy, identifier: string): Promise<void> {
  if (env.RATE_LIMIT_DISABLED && env.NODE_ENV !== "production") return;
  const { count, resetAt } = await store.hit(`${policy.name}:${identifier}`, policy.windowMs);
  if (count > policy.limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)));
  }
}

/**
 * The caller's IP, as seen through whatever sits in front of us.
 *
 * `CF-Connecting-IP` wins when present: Cloudflare overwrites it on every
 * proxied request, whereas `X-Forwarded-For` is a list the client can prepend
 * entries to. Neither is trustworthy if the origin is reachable directly, so a
 * Cloudflare deployment should also firewall the origin to Cloudflare's ranges.
 */
export function clientIdentifier(req: Request): string {
  const cloudflare = req.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

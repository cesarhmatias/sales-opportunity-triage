/**
 * Sliding-window, in-memory rate limiter keyed by client (e.g. IP).
 *
 * Good enough to blunt casual abuse of a public demo link. State lives in one server
 * instance's memory, so limits are per instance and reset on cold starts; use a shared
 * store (e.g. Redis/KV) if a hard global limit is ever needed.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the oldest request in the window expires (0 when allowed). */
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
}: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
}): RateLimiter {
  const hits = new Map<string, number[]>();

  return {
    check(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.delete(key); // re-insert so Map order tracks recency for eviction
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },
  };
}

/** First hop of x-forwarded-for (set by Vercel's edge), then x-real-ip, else a shared bucket. */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

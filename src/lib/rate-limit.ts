// A tiny in-memory fixed-window rate limiter. Pure and side-effect-free except
// for its own internal map, with `now` injected so it is trivially testable
// (no reliance on the system clock in unit tests).
//
// Intended for low-stakes throttling (e.g. login attempts) on a single-instance
// deployment. On horizontally-scaled/serverless hosts each instance keeps its
// own window, so treat it as defense-in-depth, not a hard guarantee.

export interface RateLimitResult {
  /** Whether this attempt is allowed (i.e. under the limit). */
  allowed: boolean;
  /** Attempts remaining in the current window (0 when blocked). */
  remaining: number;
  /** Milliseconds until the window resets (0 when not currently limited). */
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimiter {
  /** Record an attempt for `key`; returns whether it is allowed. */
  hit(key: string, now: number): RateLimitResult;
  /** Clear a key's window (e.g. after a successful login). */
  reset(key: string): void;
}

/**
 * Create a fixed-window limiter allowing at most `max` attempts per
 * `windowMs`. Each `hit` counts an attempt and reports whether the caller is
 * still under the cap. Stale buckets are pruned lazily on access.
 */
export function createRateLimiter(opts: {
  max: number;
  windowMs: number;
}): RateLimiter {
  const { max, windowMs } = opts;
  if (max < 1) throw new Error("rate limiter `max` must be >= 1");
  if (windowMs <= 0) throw new Error("rate limiter `windowMs` must be > 0");

  const buckets = new Map<string, Bucket>();

  return {
    hit(key, now) {
      const existing = buckets.get(key);
      const bucket =
        existing && existing.resetAt > now
          ? existing
          : { count: 0, resetAt: now + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);

      const allowed = bucket.count <= max;
      return {
        allowed,
        remaining: Math.max(0, max - bucket.count),
        retryAfterMs: allowed ? 0 : Math.max(0, bucket.resetAt - now),
      };
    },
    reset(key) {
      buckets.delete(key);
    },
  };
}

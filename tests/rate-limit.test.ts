import { describe, it, expect } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("allows up to `max` attempts then blocks", () => {
    const rl = createRateLimiter({ max: 3, windowMs: 1000 });
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("a", 0).allowed).toBe(false);
  });

  it("reports remaining attempts and retry-after", () => {
    const rl = createRateLimiter({ max: 2, windowMs: 1000 });
    expect(rl.hit("a", 0)).toMatchObject({ remaining: 1, retryAfterMs: 0 });
    expect(rl.hit("a", 200)).toMatchObject({ remaining: 0, retryAfterMs: 0 });
    // Third attempt is blocked; window resets 1000ms after the first hit.
    expect(rl.hit("a", 300)).toMatchObject({
      allowed: false,
      retryAfterMs: 700,
    });
  });

  it("resets after the window elapses", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("a", 500).allowed).toBe(false);
    // A hit past the window starts a fresh window.
    expect(rl.hit("a", 1001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.hit("a", 0).allowed).toBe(true);
    expect(rl.hit("b", 0).allowed).toBe(true);
    expect(rl.hit("a", 0).allowed).toBe(false);
  });

  it("reset() clears a key's window early", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.hit("a", 0).allowed).toBe(true);
    rl.reset("a");
    expect(rl.hit("a", 0).allowed).toBe(true);
  });

  it("rejects nonsensical config", () => {
    expect(() => createRateLimiter({ max: 0, windowMs: 1000 })).toThrow();
    expect(() => createRateLimiter({ max: 1, windowMs: 0 })).toThrow();
  });
});

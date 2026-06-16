import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "budget_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Placeholder secrets shipped in .env.example. Using one in production means
// anyone can forge a session cookie, so we refuse to boot with it.
const DEFAULT_SECRET_MARKERS = ["change-me", "changeme", "dev-secret", "please"];

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "AUTH_SECRET must be set to a string of at least 16 characters.",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    DEFAULT_SECRET_MARKERS.some((m) => secret.toLowerCase().includes(m))
  ) {
    throw new Error(
      "AUTH_SECRET looks like the development placeholder. Set a long random " +
        "value (e.g. `openssl rand -base64 32`) before deploying.",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Issue a signed session token (used after a successful password check). */
export async function createSessionToken(): Promise<string> {
  return new SignJWT({ sub: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

/** Set the session cookie. Call from a Server Action / Route Handler. */
export async function setSession() {
  const token = await createSessionToken();
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE_NAME);
}

/** Whether the current request carries a valid session. */
export async function isAuthenticated(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

/** Thrown by {@link assertAuthenticated} / {@link authed} when no valid session. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * Throw unless the current request carries a valid session. Call this as the
 * first statement of every Server Action.
 *
 * Server Actions are dispatched by action id and are reachable via *any* route
 * (including public ones like `/login`), so the route-based middleware does NOT
 * protect them — each action must verify auth itself.
 */
export async function assertAuthenticated(): Promise<void> {
  if (!(await isAuthenticated())) throw new UnauthorizedError();
}

/** Constant-time equality on the SHA-256 digests of two strings. Hashing first
 * keeps the comparison length-independent (so it leaks neither value nor their
 * lengths) and satisfies `timingSafeEqual`'s equal-length requirement. */
function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}

export function checkPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(password, expected);
}

export const SESSION_COOKIE = COOKIE_NAME;

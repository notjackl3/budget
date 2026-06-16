import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// The app talks to libSQL/SQLite through the Prisma driver adapter. The same
// code path serves both environments:
//   - Local dev:  DATABASE_URL="file:./dev.db" (a plain on-disk SQLite file).
//   - Production: TURSO_DATABASE_URL="libsql://<db>.turso.io" + TURSO_AUTH_TOKEN
//     (Vercel's filesystem is read-only/ephemeral, so a local file can't work).
// TURSO_DATABASE_URL wins when present; otherwise we fall back to DATABASE_URL.
const url =
  process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./dev.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

// Reuse a single client across hot reloads in dev to avoid exhausting
// connections.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function makeClient() {
  const adapter = new PrismaLibSQL({ url, authToken });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

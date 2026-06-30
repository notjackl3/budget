// One-off: add BudgetPlan.investPlanJson to the live libSQL/Turso DB.
// Prisma talks to Turso through the driver adapter, so schema changes are
// applied as plain DDL (not `prisma db push`). Idempotent — safe to re-run.
//   npx tsx scripts/add-invest-plan-column.ts
import "dotenv/config";
import { createClient } from "@libsql/client";

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("No TURSO_DATABASE_URL / DATABASE_URL set");

  const client = createClient({ url, authToken });

  const cols = await client.execute("PRAGMA table_info('BudgetPlan')");
  const has = cols.rows.some((r) => r.name === "investPlanJson");
  if (has) {
    console.log("BudgetPlan.investPlanJson already exists — nothing to do.");
    return;
  }
  await client.execute('ALTER TABLE "BudgetPlan" ADD COLUMN "investPlanJson" TEXT');
  console.log("Added BudgetPlan.investPlanJson.");
}

main().catch((e) => {
  console.error("migration failed:", e?.message ?? e);
  process.exit(1);
});

// Seed the database from the real PDF statements in statements/.
// Runs the exact same pipeline the app uses (parse -> auto-categorize ->
// dedupe -> commit), so the app opens with real data.
//
//   npx tsx scripts/import-statements.ts            # import all PDFs
//   npx tsx scripts/import-statements.ts --reset    # wipe expenses+statements first
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { parseStatementText } from "../src/lib/parse-statement";
import { guessCategory } from "../src/lib/categorize";
import { guessIncomeType, isIncomeAmount } from "../src/lib/categories";
import { merchantKey } from "../src/lib/merchant-key";
import { getMerchantRuleMap, overrideWithRule } from "../src/lib/merchant-rules";
import { formatMoney } from "../src/lib/money";
import { ymdToDate } from "../src/lib/dates";

const prisma = new PrismaClient();

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset) {
    await prisma.expense.deleteMany({});
    await prisma.statement.deleteMany({});
    console.log("Reset: cleared existing expenses and statements.\n");
  }

  const dir = path.join(process.cwd(), "statements");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();

  const categories = await prisma.category.findMany({
    select: { id: true, slug: true },
  });
  if (categories.length === 0) {
    throw new Error("No categories found — run `npm run db:seed` first.");
  }
  const slugToId = new Map(categories.map((c) => [c.slug, c.id]));
  const idToSlug = new Map(categories.map((c) => [c.id, c.slug]));
  const miscId = slugToId.get("miscellaneous") ?? categories[0].id;
  const ruleMap = await getMerchantRuleMap();

  const creditCard = await prisma.paymentMethod.findFirst({
    where: { name: { contains: "Credit" } },
  });

  // Dedupe only against pre-existing rows so re-runs are idempotent. We do NOT
  // dedupe within this run: two legitimately distinct same-day, same-merchant,
  // same-amount purchases share a fingerprint and must both be kept (the bank's
  // own per-statement counts are the ground truth we match).
  const existing = await prisma.expense.findMany({ select: { dedupeHash: true } });
  const seen = new Set(existing.map((e) => e.dedupeHash));

  let totalCreated = 0;
  let totalCents = 0;

  for (const file of files) {
    const buf = fs.readFileSync(path.join(dir, file));
    const { text } = await pdf(buf);
    const parsed = parseStatementText(text);

    const fresh = parsed.transactions.filter((t) => !seen.has(t.dedupeHash));
    // Record hashes only after filtering this statement, so identical rows
    // *within* the same statement are both kept, while a later re-run (where
    // they already live in the DB) skips them.
    fresh.forEach((t) => seen.add(t.dedupeHash));

    if (fresh.length === 0) {
      console.log(`${file}: nothing new (already imported).`);
      continue;
    }

    const statement = await prisma.statement.create({
      data: {
        filename: file,
        label: parsed.label,
        periodStart: parsed.periodStart ? ymdToDate(parsed.periodStart) : null,
        periodEnd: parsed.periodEnd ? ymdToDate(parsed.periodEnd) : null,
      },
    });

    const data = fresh.map((t) => {
      const income = isIncomeAmount(t.amountCents);
      const guess = guessCategory(t.description, t.bankCategory);
      const resolved = overrideWithRule(
        {
          categorySlug: guess.categorySlug,
          categoryId: slugToId.get(guess.categorySlug) ?? miscId,
          needWant: income ? null : guess.needWant,
          incomeType: income ? guessIncomeType(t.description) : null,
        },
        ruleMap.get(merchantKey(t.description)),
        idToSlug,
        income,
      );
      return {
        description: t.description,
        date: ymdToDate(t.date),
        amountCents: t.amountCents,
        categoryId: resolved.categoryId,
        paymentMethodId: creditCard?.id ?? null,
        needWant: resolved.needWant,
        incomeType: resolved.incomeType,
        recurring: false,
        reviewed: false,
        sourceStatementId: statement.id,
        dedupeHash: t.dedupeHash,
      };
    });

    await prisma.expense.createMany({ data });
    const cents = data.reduce((a, d) => a + d.amountCents, 0);
    totalCreated += data.length;
    totalCents += cents;
    console.log(
      `${file}: imported ${data.length} txns (${formatMoney(cents)}) — ${parsed.label}`,
    );
  }

  console.log(
    `\nDone. Imported ${totalCreated} expenses totalling ${formatMoney(totalCents)}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

// End-to-end test for the merchant-memory system, run against a throwaway
// SQLite database so it never touches dev.db.
//
//   npx tsx scripts/test-merchant-memory.ts
//
// It drives the REAL functions the app uses — learnMerchantRule /
// learnFromExpenseIds (the review-time learning), getMerchantRuleMap +
// overrideWithRule + guessCategory + merchantKey (the import-time application) —
// and asserts the full loop: a manual correction during review pre-fills the
// same merchant on the next import.

import fs from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

// Point Prisma at a fresh temp DB BEFORE importing anything that builds a
// client (src/lib/prisma reads DATABASE_URL at connection time). Everything
// runs inside an async IIFE because the cjs transform rejects top-level await.
const DB_PATH = path.join("/tmp", "merchant-memory-e2e.db");

void (async () => {
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
  process.env.DATABASE_URL = `file:${DB_PATH}`;

  execSync("npx prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
  });

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  const { guessCategory } = await import("../src/lib/categorize");
  const { guessIncomeType, isIncomeAmount } = await import(
    "../src/lib/categories"
  );
  const { merchantKey } = await import("../src/lib/merchant-key");
  const {
    learnMerchantRule,
    learnFromExpenseIds,
    getMerchantRuleMap,
    overrideWithRule,
  } = await import("../src/lib/merchant-rules");
  const { DEFAULT_CATEGORIES } = await import("../src/lib/categories");
  const { incomeSummary, monthlySummary } = await import("../src/lib/aggregate");
  const { makeDedupeHash } = await import("../src/lib/parse-statement");
  const { ymdToDate } = await import("../src/lib/dates");

  // -------------------------------------------------------------- harness
let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${extra ? `  — ${extra}` : ""}`);
  }
}

// Mirror exactly what the import route does for one row: heuristic guess, then
// overlay any remembered rule. Returns the pre-filled {categorySlug, needWant}.
async function simulateImport(
  description: string,
  bankCategory: string | null,
  amountCents: number,
) {
  const categories = await prisma.category.findMany({
    select: { id: true, slug: true },
  });
  const slugToId = new Map(categories.map((c) => [c.slug, c.id]));
  const idToSlug = new Map(categories.map((c) => [c.id, c.slug]));
  const miscId = slugToId.get("miscellaneous") ?? categories[0]?.id ?? null;
  const ruleMap = await getMerchantRuleMap();

  const income = isIncomeAmount(amountCents);
  const guess = guessCategory(description, bankCategory, { amountCents });
  return overrideWithRule(
    {
      categorySlug: guess.categorySlug,
      categoryId: slugToId.get(guess.categorySlug) ?? miscId,
      needWant: income ? null : guess.needWant,
      incomeType: income ? guessIncomeType(description) : null,
    },
    ruleMap.get(merchantKey(description)),
    idToSlug,
    income,
  );
}

// Create an unreviewed expense, then "review" it the way the single-row path
// does (persist the user's choice, then learn from the persisted row). Pass a
// negative amount to exercise the income path (categorySlug then doubles as the
// income type holder via the incomeType arg).
async function reviewOne(
  description: string,
  categorySlug: string | null,
  needWant: string | null,
  amountCents = 677,
  incomeType: string | null = null,
) {
  const cat = categorySlug
    ? await prisma.category.findUnique({ where: { slug: categorySlug } })
    : null;
  const e = await prisma.expense.create({
    data: {
      description,
      date: ymdToDate("2026-01-01"),
      amountCents,
      categoryId: cat?.id ?? null,
      needWant,
      incomeType,
      reviewed: true,
      dedupeHash: makeDedupeHash("2026-01-01", amountCents, description),
    },
  });
  await learnMerchantRule({
    description: e.description,
    categoryId: e.categoryId,
    needWant: e.needWant,
    incomeType: e.incomeType,
  });
  return e;
}

async function main() {
  // Seed categories (id + slug + name) like prisma/seed.ts does.
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    await prisma.category.create({
      data: { name: c.name, slug: c.slug, color: c.color, sortOrder: i },
    });
  }
  const coffee = await prisma.category.findUnique({
    where: { slug: "coffee-snacks" },
  });
  const shopping = await prisma.category.findUnique({
    where: { slug: "shopping" },
  });

  console.log("\n# 1. The screenshot case: PROJECT SEOUL");
  {
    // Fresh merchant the heuristics don't recognise -> miscellaneous, no flag.
    const before = await simulateImport("PROJECT SEOUL T", null, 677);
    check(
      "before learning: guessed miscellaneous / no need-want",
      before.categorySlug === "miscellaneous" && before.needWant === null,
      JSON.stringify(before),
    );

    // User corrects it to Coffee/Snacks + Want and marks reviewed.
    await reviewOne("PROJECT SEOUL T", "coffee-snacks", "Want");

    // Next import of the SAME merchant on a DIFFERENT day/amount.
    const after = await simulateImport("PROJECT SEOUL T", null, 1299);
    check(
      "after learning: auto-fills Coffee/Snacks",
      after.categorySlug === "coffee-snacks" && after.categoryId === coffee!.id,
      JSON.stringify(after),
    );
    check("after learning: auto-fills Want", after.needWant === "Want", JSON.stringify(after));
  }

  console.log("\n# 2. Store-number / punctuation variations collapse");
  {
    await reviewOne("SQUARE *PROJECT SEOUL #0421", "coffee-snacks", "Want");
    // A later charge with a different store number but same merchant words.
    const after = await simulateImport("SQUARE *PROJECT SEOUL #9999", null, 500);
    check(
      "different store number still matches",
      after.categorySlug === "coffee-snacks" && after.needWant === "Want",
      JSON.stringify(after),
    );
  }

  console.log("\n# 3. Sticky per-field merge");
  {
    // First teach only a category (no need-want).
    await reviewOne("MYSTERY BODEGA", "shopping", null);
    let rule = (await getMerchantRuleMap()).get(merchantKey("MYSTERY BODEGA"));
    check("category learned, need-want still null", rule?.categoryId === shopping!.id && rule?.needWant === null, JSON.stringify(rule));

    // Later teach only a need-want (category left blank in this review).
    await reviewOne("MYSTERY BODEGA", null, "Want");
    rule = (await getMerchantRuleMap()).get(merchantKey("MYSTERY BODEGA"));
    check(
      "need-want added WITHOUT erasing the learned category",
      rule?.categoryId === shopping!.id && rule?.needWant === "Want",
      JSON.stringify(rule),
    );
  }

  console.log("\n# 4. Re-teaching changes a remembered value");
  {
    await reviewOne("FLIP FLOP", "shopping", "Want");
    await reviewOne("FLIP FLOP", "coffee-snacks", "Need"); // user changes their mind
    const rule = (await getMerchantRuleMap()).get(merchantKey("FLIP FLOP"));
    check(
      "latest non-null choice wins",
      rule?.categoryId === coffee!.id && rule?.needWant === "Need",
      JSON.stringify(rule),
    );
    const hits = await prisma.merchantRule.findUnique({
      where: { merchantKey: merchantKey("FLIP FLOP") },
    });
    check("hit count increments on re-confirm", hits?.hits === 2, `hits=${hits?.hits}`);
  }

  console.log("\n# 5. Need-want-only rule keeps the heuristic category");
  {
    // STARBUCKS is heuristically coffee-snacks/Want. Teach only a need-want of
    // "Comfort" and confirm category stays heuristic, need-want overridden.
    await reviewOne("STARBUCKS COFFEE", null, "Comfort");
    const after = await simulateImport("STARBUCKS COFFEE", null, 800);
    check(
      "category from heuristic, need-want from memory",
      after.categorySlug === "coffee-snacks" && after.needWant === "Comfort",
      JSON.stringify(after),
    );
  }

  console.log("\n# 6. Junk descriptions never create a rule");
  {
    const beforeCount = await prisma.merchantRule.count();
    await learnMerchantRule({ description: "12345", categoryId: shopping!.id, needWant: "Want" });
    await learnMerchantRule({ description: "   ", categoryId: shopping!.id, needWant: "Want" });
    // Nothing to remember (no category AND no need-want):
    await learnMerchantRule({ description: "REAL STORE", categoryId: null, needWant: null });
    const afterCount = await prisma.merchantRule.count();
    check("numbers-only / blank / empty-choice are no-ops", afterCount === beforeCount, `${beforeCount} -> ${afterCount}`);
  }

  console.log("\n# 7. Bulk review learns every selected row (learnFromExpenseIds)");
  {
    const mk = (desc: string) =>
      prisma.expense.create({
        data: {
          description: desc,
          date: ymdToDate("2026-02-02"),
          amountCents: 1000,
          categoryId: coffee!.id,
          needWant: "Want",
          reviewed: true,
          dedupeHash: makeDedupeHash("2026-02-02", 1000, desc),
        },
      });
    const a = await mk("BULK CAFE ALPHA");
    const b = await mk("BULK CAFE BETA");
    await learnFromExpenseIds([a.id, b.id]);
    const map = await getMerchantRuleMap();
    check(
      "both bulk-reviewed merchants are remembered",
      map.has(merchantKey("BULK CAFE ALPHA")) && map.has(merchantKey("BULK CAFE BETA")),
    );
    const after = await simulateImport("BULK CAFE ALPHA", null, 1200);
    check("bulk-learned merchant pre-fills on import", after.categorySlug === "coffee-snacks" && after.needWant === "Want", JSON.stringify(after));
  }

  console.log("\n# 8. Deleting the remembered category degrades gracefully");
  {
    // Teach a brand-new category, then delete that category. SetNull should
    // null the rule's categoryId; import must fall back to the heuristic
    // without crashing on a dangling id.
    const temp = await prisma.category.create({
      data: { name: "Temp Cat", slug: "temp-cat", color: "#000000", sortOrder: 99 },
    });
    await prisma.expense.create({
      data: {
        description: "GHOST MART",
        date: ymdToDate("2026-03-03"),
        amountCents: 900,
        categoryId: temp.id,
        needWant: "Want",
        reviewed: true,
        dedupeHash: makeDedupeHash("2026-03-03", 900, "GHOST MART"),
      },
    });
    await learnMerchantRule({ description: "GHOST MART", categoryId: temp.id, needWant: "Want" });
    await prisma.category.delete({ where: { id: temp.id } });

    const rule = (await getMerchantRuleMap()).get(merchantKey("GHOST MART"));
    check("rule's categoryId nulled after category delete", rule?.categoryId === null, JSON.stringify(rule));
    const after = await simulateImport("GHOST MART", null, 900);
    check(
      "import falls back to heuristic category, keeps remembered need-want",
      after.categorySlug === "miscellaneous" && after.needWant === "Want",
      JSON.stringify(after),
    );
  }

  console.log("\n# 9. Unknown merchant is untouched (no false positives)");
  {
    const after = await simulateImport("TOTALLY NEW NEVER SEEN LLC", null, 1500);
    check("no rule -> pure heuristic", after.categorySlug === "miscellaneous" && after.needWant === null, JSON.stringify(after));
  }

  console.log("\n# 10. Negative amounts import as income (refund by default)");
  {
    const after = await simulateImport("UNIQLO CANADA POS", "Retail and Grocery", -6769);
    check(
      "credit gets an income type, not a need-want",
      after.incomeType === "Refund" && after.needWant === null,
      JSON.stringify(after),
    );
    const salary = await simulateImport("ACME CORP PAYROLL DEPOSIT", null, -300000);
    check("payroll-ish deposit guessed as Salary", salary.incomeType === "Salary", JSON.stringify(salary));
  }

  console.log("\n# 11. Learned income type pre-fills future credits");
  {
    // Heuristic would guess Refund; user re-labels this credit as Salary.
    await reviewOne("UNIQLO CANADA POS", "shopping", null, -6769, "Salary");
    const after = await simulateImport("UNIQLO CANADA POS", "Retail and Grocery", -2000);
    check(
      "remembered income type applied; still no need-want",
      after.incomeType === "Salary" && after.needWant === null,
      JSON.stringify(after),
    );
  }

  console.log("\n# 12. One merchant, both a charge and a credit, remembered apart");
  {
    await reviewOne("ZARA STORE", "shopping", "Want", 5000, null);
    await reviewOne("ZARA STORE", "shopping", null, -5000, "Refund");
    const charge = await simulateImport("ZARA STORE", null, 4200);
    const credit = await simulateImport("ZARA STORE", null, -4200);
    check("charge recalls Want (no income type)", charge.needWant === "Want" && charge.incomeType === null, JSON.stringify(charge));
    check("credit recalls Refund (no need-want)", credit.incomeType === "Refund" && credit.needWant === null, JSON.stringify(credit));
  }

  console.log("\n# 13. Analytics separate income from spend entirely");
  {
    const d = ymdToDate("2026-04-15");
    const rows = [
      { date: d, amountCents: 5000, needWant: "Want", incomeType: null, categoryId: "c1", categoryName: "Shopping", categorySlug: "shopping", reviewed: true, recurring: false },
      { date: d, amountCents: 2000, needWant: "Need", incomeType: null, categoryId: "c2", categoryName: "Groceries", categorySlug: "groceries", reviewed: true, recurring: false },
      { date: d, amountCents: -6769, needWant: null, incomeType: "Refund", categoryId: "c1", categoryName: "Shopping", categorySlug: "shopping", reviewed: true, recurring: false },
      { date: d, amountCents: -300000, needWant: null, incomeType: "Salary", categoryId: null, categoryName: null, categorySlug: null, reviewed: true, recurring: false },
    ];
    const sum = monthlySummary(rows, "2026-04");
    check("spend total counts expenses only", sum.totalCents === 7000, `total=${sum.totalCents}`);
    check("expense count excludes income rows", sum.count === 2, `count=${sum.count}`);
    check("need/want split unaffected by income", sum.needsCents === 2000 && sum.wantsCents === 5000, JSON.stringify({ n: sum.needsCents, w: sum.wantsCents }));
    check("income surfaced separately as positive total", sum.incomeCents === 6769 + 300000, `income=${sum.incomeCents}`);

    const inc = incomeSummary(rows);
    const byType = Object.fromEntries(inc.byType.map((t) => [t.type, t.totalCents]));
    check("income broken down by type", byType.Salary === 300000 && byType.Refund === 6769, JSON.stringify(byType));
    const shopping = sum.byCategory.find((c) => c.categoryId === "c1");
    check("refund does not net against its category", shopping?.totalCents === 5000, JSON.stringify(shopping));
  }

    console.log(`\n${"=".repeat(48)}`);
    console.log(`Result: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  }

  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);
  }
})();

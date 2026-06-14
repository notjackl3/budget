import { NextResponse } from "next/server";
import { parseStatementPdf } from "@/lib/parse-pdf";
import { guessCategory } from "@/lib/categorize";
import { guessIncomeType, isIncomeAmount } from "@/lib/categories";
import { merchantKey } from "@/lib/merchant-key";
import { getMerchantRuleMap, overrideWithRule } from "@/lib/merchant-rules";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { getExistingHashes } from "@/lib/queries";
import { centsToDecimalString } from "@/lib/money";

export const runtime = "nodejs";
export const maxDuration = 60;

export interface PreviewRow {
  date: string;
  description: string;
  amountCents: number;
  amount: string; // dollars string for editable inputs
  bankCategory: string | null;
  categoryId: string | null;
  categorySlug: string;
  needWant: string | null;
  incomeType: string | null;
  isIncome: boolean;
  isDuplicate: boolean;
  dedupeHash: string;
}

export interface PreviewStatement {
  filename: string;
  label: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  rows: PreviewRow[];
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No PDF files uploaded." }, { status: 400 });
  }

  const categories = await prisma.category.findMany({
    where: { archived: false },
    select: { id: true, slug: true },
  });
  const slugToId = new Map(categories.map((c) => [c.slug, c.id]));
  const idToSlug = new Map(categories.map((c) => [c.id, c.slug]));
  const miscId = slugToId.get("miscellaneous") ?? categories[0]?.id ?? null;

  // Learned per-merchant preferences from past reviews; applied on top of the
  // heuristic guess so the user only re-confirms instead of re-correcting.
  const ruleMap = await getMerchantRuleMap();

  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { mealNeedCents: true },
  });
  const mealNeedCents = settings?.mealNeedCents ?? 1500;

  const existing = await getExistingHashes();
  // Track hashes seen within this batch too (so two uploaded files that overlap
  // flag the later occurrence as a duplicate).
  const seenInBatch = new Set<string>();

  const statements: PreviewStatement[] = [];

  for (const file of files) {
    let parsed;
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      parsed = await parseStatementPdf(buf);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Could not read "${file.name}". Is it a text-based CIBC statement PDF? (${
            err instanceof Error ? err.message : "parse error"
          })`,
        },
        { status: 422 },
      );
    }

    const rows: PreviewRow[] = parsed.transactions.map((t) => {
      const income = isIncomeAmount(t.amountCents);
      const guess = guessCategory(t.description, t.bankCategory, {
        amountCents: t.amountCents,
        mealNeedCents,
      });
      // Charges carry a need-want guess; credits carry an income-type guess and
      // no need-want. Learned merchant rules then refine whichever applies.
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
      const isDuplicate =
        existing.has(t.dedupeHash) || seenInBatch.has(t.dedupeHash);
      seenInBatch.add(t.dedupeHash);
      return {
        date: t.date,
        description: t.description,
        amountCents: t.amountCents,
        amount: centsToDecimalString(t.amountCents),
        bankCategory: t.bankCategory,
        categoryId: resolved.categoryId,
        categorySlug: resolved.categorySlug,
        needWant: resolved.needWant,
        incomeType: resolved.incomeType,
        isIncome: income,
        isDuplicate,
        dedupeHash: t.dedupeHash,
      };
    });

    statements.push({
      filename: file.name,
      label: parsed.label,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      rows,
    });
  }

  return NextResponse.json({ statements });
}

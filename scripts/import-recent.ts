// One-off seed of recent online-activity transactions (May 26 → Jun 12, 2026)
// that post-date the latest PDF statement. Same pipeline as the PDF import:
// clean description -> auto-categorize -> dedupe-hash -> dedupe vs existing DB.
//
//   npx tsx scripts/import-recent.ts
//
// Idempotent: re-running skips anything already present (matched by the
// date|cents|normalized-description fingerprint). The "PAYMENT THANK YOU"
// bill-payment credit is intentionally excluded (it isn't spending), matching
// how the statement parser drops the "Your payments" section.
import { PrismaClient } from "@prisma/client";
import { guessCategory } from "../src/lib/categorize";
import { guessIncomeType, isIncomeAmount } from "../src/lib/categories";
import { merchantKey } from "../src/lib/merchant-key";
import { getMerchantRuleMap, overrideWithRule } from "../src/lib/merchant-rules";
import { makeDedupeHash } from "../src/lib/parse-statement";
import { formatMoney } from "../src/lib/money";
import { ymdToDate } from "../src/lib/dates";

const prisma = new PrismaClient();

// [date, bankCategory, description, amountCents]  (cents negative = credit)
type Row = [string, string, string, number];

const ROWS: Row[] = [
  // Jun 12
  ["2026-06-12", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 612],
  ["2026-06-12", "Retail and Grocery", "NAYAX CANADA INC MASTER FREDERICTON, NB", 500],
  ["2026-06-12", "Restaurants", "PHO BIG BOWL MISSISSAUGA, ON", 2034],
  ["2026-06-12", "Personal and Household Expenses", "AMZN Mktp CA 866-216-1072, ON", 5999],
  // Jun 11
  ["2026-06-11", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 869],
  ["2026-06-11", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 1608],
  ["2026-06-11", "Retail and Grocery", "GOOGLE *Google One g.co/helppay#, NS", 315],
  ["2026-06-11", "Transportation", "Lyft *Temp Auth Hold Vancouver, BC", 907],
  ["2026-06-11", "Transportation", "PRESTO MOBI/RWTRJQJLL5 TORONTO, ON", 1000],
  ["2026-06-11", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 750],
  ["2026-06-11", "Restaurants", "SQ *MEAN BAO Toronto, ON", 1130],
  ["2026-06-11", "Restaurants", "SQ *THE POKE BOX YORKDALE Toronto, ON", 2283],
  ["2026-06-11", "Restaurants", "TIM HORTONS #9436 TORONTO, ON", 419],
  ["2026-06-11", "Restaurants", "TST-Pai Northern Thai Toronto, ON", 2486],
  // Jun 10
  ["2026-06-10", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 526],
  ["2026-06-10", "Restaurants", "SZECHUAN EXPRESS TORONTO, ON", 1463],
  // Jun 9
  ["2026-06-09", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 2361],
  ["2026-06-09", "Retail and Grocery", "T&T SUPERMARKET 042 MISSISSAUGA, ON", 1323],
  ["2026-06-09", "Transportation", "Lyft *Temp Auth Hold Vancouver, BC", 847],
  // Jun 8
  ["2026-06-08", "Transportation", "SQ *TORONTO HARBOUR WATER TORONTO, ON", 4500],
  ["2026-06-08", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 814],
  // Jun 7
  ["2026-06-07", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 650],
  ["2026-06-07", "Transportation", "PRESTO MOBI/RW5HWFXW2J TORONTO, ON", 1000],
  ["2026-06-07", "Retail and Grocery", "DOLLARAMA # 268 MISSISSAUGA, ON", 1846],
  ["2026-06-07", "Restaurants", "PHO BIG BOWL MISSISSAUGA, ON", 2209],
  // Jun 6
  ["2026-06-06", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 2550],
  ["2026-06-06", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 858],
  ["2026-06-06", "Retail and Grocery", "T&T SUPERMARKET 042 MISSISSAUGA, ON", 2615],
  ["2026-06-06", "Restaurants", "UBER CANADA/UBEREATS TORONTO, ON", 3838],
  ["2026-06-06", "Restaurants", "TST-Thaifoon Downtown Toronto, ON", 2254],
  ["2026-06-06", "Personal and Household Expenses", "ROGERS ******6305 888-764-3771, ON", 11841],
  // Jun 5
  ["2026-06-05", "Restaurants", "FRESHLY SQUEEZED PREM HALTON HILLS, ON", 1045],
  ["2026-06-05", "Health and Education", "SHOPPERS DRUG MART #82 TORONTO, ON", 1582],
  ["2026-06-05", "Retail and Grocery", "SAMSONITE 460 HALTON HILLS, ON", 8475],
  ["2026-06-05", "Transportation", "UBER *TRIP HELP.UBER.COM Toronto, ON", 645],
  ["2026-06-05", "Professional and Financial Services", "Amazon.ca Prime Member amazon.ca/pri, BC", 1129],
  ["2026-06-05", "Transportation", "PRESTO MOBI/RVPKMC5V7R TORONTO, ON", 1000],
  ["2026-06-05", "Retail and Grocery", "Kate Spade 31852 HALTON HILLS, ON", 21357],
  ["2026-06-05", "Restaurants", "TST-Soul Burger Toronto, ON", 1907],
  ["2026-06-05", "Foreign Currency Transactions", "OPENAI *CHATGPT SUBSCR OPENAI.COM, CA", 3227],
  // Jun 4
  ["2026-06-04", "Transportation", "Lyft *Temp Auth Hold Vancouver, BC", 1192],
  ["2026-06-04", "Restaurants", "UBER CANADA/UBEREATS TORONTO, ON", 1968],
  ["2026-06-04", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 825],
  // Jun 3
  ["2026-06-03", "Restaurants", "THE HAAM TORONTO, ON", 2147],
  ["2026-06-03", "Restaurants", "RAMEN RYU TORONTO, ON", 1807],
  ["2026-06-03", "Retail and Grocery", "CapCut SINGAPORE", 3163],
  // (PAYMENT THANK YOU/PAIEMENT MERCI -$1,414.90 intentionally excluded)
  // Jun 2
  ["2026-06-02", "Restaurants", "UBER CANADA/UBEREATS TORONTO, ON", 1976],
  ["2026-06-02", "Retail and Grocery", "T&T SUPERMARKET 042 MISSISSAUGA, ON", 1125],
  ["2026-06-02", "Retail and Grocery", "T&T SUPERMARKET 042 MISSISSAUGA, ON", 5805],
  ["2026-06-02", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 621],
  // Jun 1
  ["2026-06-01", "Retail and Grocery", "NAYAX CANADA INC MASTER FREDERICTON, NB", 500],
  ["2026-06-01", "Transportation", "PRESTO MOBI/RTWMFRCHGM TORONTO, ON", 1000],
  ["2026-06-01", "Restaurants", "UBER CANADA/UBEREATS TORONTO, ON", 2342],
  ["2026-06-01", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 2496],
  ["2026-06-01", "Restaurants", "UTM DAVIS FOOD COURT MISSISSAUGA, ON", 2065],
  // May 30
  ["2026-05-30", "Restaurants", "KitchenMate 4811716 Toronto, ON", 1610],
  // May 29
  ["2026-05-29", "Transportation", "UBER *TRIP HELP.UBER.COM Toronto, ON", 2359],
  ["2026-05-29", "Restaurants", "UBER CANADA/UBEREATS TORONTO, ON", 3144],
  ["2026-05-29", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 1108],
  // May 28
  ["2026-05-28", "Restaurants", "MCDONALD'S # 41431 TORONTO, ON", 419],
  ["2026-05-28", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 701],
  ["2026-05-28", "Transportation", "UBER *TRIP HELP.UBER.COM Toronto, ON", 1316],
  // May 27
  ["2026-05-27", "Retail and Grocery", "ZARA TEC #3194 3194 TORONTO, ON", 7899],
  ["2026-05-27", "Retail and Grocery", "ZARA TEC #3194 3194 TORONTO, ON", -7899], // refund
  ["2026-05-27", "Retail and Grocery", "DUE WEST CLOTHING CO TORONTO, ON", 22487],
  ["2026-05-27", "Restaurants", "TRE VIET HERITAGE TORONTO, ON", 5085],
  ["2026-05-27", "Transportation", "PRESTO MOBI/RSWZFBSR5Z TORONTO, ON", 1000],
  ["2026-05-27", "Restaurants", "SQ *ISLE OF COFFEE (QUEEN Toronto, ON", 1378],
  // May 26
  ["2026-05-26", "Restaurants", "WAREHOUSE QUEEN ST VANCOUVER, BC", 2207],
  ["2026-05-26", "Transportation", "PRESTO MOBI/RSRDT7VKP5 TORONTO, ON", 1000],
  ["2026-05-26", "Restaurants", "BELEAF TORONTO, ON", 2146],
  ["2026-05-26", "Restaurants", "KUNG FU TEA ON ADELAIDE TORONTO, ON", 791],
  ["2026-05-26", "Health and Education", "SHOPPERS DRUG MART #82 TORONTO, ON", 2767],
  ["2026-05-26", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 1045],
  ["2026-05-26", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 848],
  ["2026-05-26", "Transportation", "UBER CANADA/UBERTRIP TORONTO, ON", 857],
];

const PROV = "ON|BC|AB|QC|NS|NB|MB|SK|PE|NL|YT|NT|NU";
/** Clean a merchant string: collapse spaces, drop a trailing ", PROV". */
function clean(desc: string): string {
  return desc
    .replace(/\s+/g, " ")
    .replace(new RegExp(`,?\\s*(${PROV})$`, "i"), "")
    .trim();
}

async function main() {
  const categories = await prisma.category.findMany({
    select: { id: true, slug: true },
  });
  const slugToId = new Map(categories.map((c) => [c.slug, c.id]));
  const idToSlug = new Map(categories.map((c) => [c.id, c.slug]));
  const miscId = slugToId.get("miscellaneous") ?? categories[0].id;
  const ruleMap = await getMerchantRuleMap();

  const existing = await prisma.expense.findMany({ select: { dedupeHash: true } });
  const seen = new Set(existing.map((e) => e.dedupeHash));

  const dates = ROWS.map((r) => r[0]).sort();
  const statement = await prisma.statement.create({
    data: {
      filename: "online-activity-2026-05-26_2026-06-12",
      label: "CIBC Dividend Visa — recent activity (May–Jun 2026)",
      periodStart: ymdToDate(dates[0]),
      periodEnd: ymdToDate(dates[dates.length - 1]),
    },
  });

  const data = [];
  let skipped = 0;
  for (const [date, bankCategory, rawDesc, cents] of ROWS) {
    const description = clean(rawDesc);
    const hash = makeDedupeHash(date, cents, description);
    if (seen.has(hash)) {
      skipped++;
      continue;
    }
    seen.add(hash);
    const income = isIncomeAmount(cents);
    const guess = guessCategory(description, bankCategory);
    const resolved = overrideWithRule(
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
    data.push({
      description,
      date: ymdToDate(date),
      amountCents: cents,
      categoryId: resolved.categoryId,
      needWant: resolved.needWant,
      incomeType: resolved.incomeType,
      recurring: false,
      reviewed: false,
      sourceStatementId: statement.id,
      dedupeHash: hash,
    });
  }

  if (data.length === 0) {
    await prisma.statement.delete({ where: { id: statement.id } });
    console.log(`Nothing new — all ${ROWS.length} rows already imported.`);
    return;
  }

  await prisma.expense.createMany({ data });
  const total = data.reduce((a, d) => a + d.amountCents, 0);
  console.log(
    `Imported ${data.length} recent transactions (${formatMoney(total)})` +
      (skipped ? `, skipped ${skipped} already present.` : "."),
  );
  console.log("Categorization preview:");
  for (const d of data.slice(0, 8)) {
    const name = categories.find((c) => c.id === d.categoryId);
    console.log(
      `  ${formatMoney(d.amountCents).padStart(9)}  ${(name ? name.slug : "").padEnd(13)}  ${d.description}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

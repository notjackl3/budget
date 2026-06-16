// Near-real-time expense ingestion from CIBC transaction-alert emails.
//
// Runs the same pipeline as the PDF importer, sourced from the per-purchase
// alert emails CIBC sends within minutes of a card swipe. Designed to be woken
// periodically by cron/launchd (see scripts/com.budget.pollemail.plist): it
// reads new alerts over the Gmail API, ingests them as PROVISIONAL rows, and
// exits. When the official monthly statement later imports, those provisional
// rows are reconciled away (see lib/ingest.ts → reconcileProvisional).
//
// Auth is the Composio connection set up in-app (Settings → Email connection),
// so this script just reuses it. Nothing to configure here beyond having
// connected Gmail once in the app and setting COMPOSIO_API_KEY in .env.
//
//   npx tsx scripts/poll-email.ts            # fetch + ingest
//   npx tsx scripts/poll-email.ts --dry-run  # parse + print only; no DB writes

import "dotenv/config"; // load GOOGLE_* / AUTH_SECRET / DATABASE_URL from .env
import { fetchAlertTransactions, markSynced } from "../src/lib/gmail";
import { ingestTransactions } from "../src/lib/ingest";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  let result;
  try {
    result = await fetchAlertTransactions();
  } catch (err) {
    if (err instanceof Error && /not connected/i.test(err.message)) {
      console.error(
        "Gmail isn't connected. Open the app → Settings → Email connection → " +
          "Connect Gmail, then re-run.",
      );
      process.exit(1);
    }
    throw err;
  }

  const { txns, scanned } = result;
  for (const t of txns) {
    console.log(`  • ${t.date}  ${t.description}  ${(t.amountCents / 100).toFixed(2)}`);
  }
  console.log(`Scanned ${scanned} email(s); parsed ${txns.length} alert(s).`);

  if (DRY_RUN) {
    // Dump the raw Composio response so the field-extraction in lib/gmail.ts can
    // be confirmed/tuned against a live fetch.
    if (process.argv.includes("--raw")) {
      console.log("\n--- raw GMAIL_FETCH_EMAILS response ---");
      console.log(JSON.stringify(result.raw, null, 2));
    }
    console.log("Dry run — nothing written.");
    return;
  }

  if (txns.length > 0) {
    const ingested = await ingestTransactions(txns, { provisional: true });
    console.log(
      `Ingested ${ingested.created} new provisional expense(s); ` +
        `${ingested.skippedDuplicate} already present.`,
    );
  }
  await markSynced();
}

main().catch((err) => {
  console.error("poll-email failed:", err);
  process.exit(1);
});

// One-off: verify the Composio API key works and the Gmail connect path is wired.
//   npx tsx scripts/composio-verify.ts
import "dotenv/config";
import { ensureGmailAuthConfig, initiateGmailConnection } from "../src/lib/gmail";

async function main() {
  console.log("API key present:", Boolean(process.env.COMPOSIO_API_KEY));
  const authConfigId = await ensureGmailAuthConfig();
  console.log("Gmail auth config id:", authConfigId);

  const { redirectUrl, id } = await initiateGmailConnection(
    "http://localhost:3000/api/gmail/callback",
  );
  console.log("connection request id:", id);
  console.log("consent URL starts with:", redirectUrl?.slice(0, 60), "…");
  console.log("\nOK — key works and the connect flow returns a consent URL.");
}

main().catch((e) => {
  console.error("composio-verify failed:", e?.message ?? e);
  process.exit(1);
});

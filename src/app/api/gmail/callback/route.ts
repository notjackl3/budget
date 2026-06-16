import { NextResponse } from "next/server";
import { finalizeGmailConnection } from "@/lib/gmail";

export const runtime = "nodejs";

// Composio redirects here after consent with e.g.
//   ?status=success&connected_account_id=ca_xyz&user_id=…
// We persist the connected-account id and bounce back to Settings with a status
// flag the UI turns into a toast.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const connectedAccountId =
    url.searchParams.get("connected_account_id") ??
    url.searchParams.get("connectedAccountId");

  const back = new URL("/settings", req.url);

  if (status && status !== "success") {
    back.searchParams.set("gmail", status === "failed" ? "error" : "denied");
    return NextResponse.redirect(back);
  }
  if (!connectedAccountId) {
    back.searchParams.set("gmail", "error");
    return NextResponse.redirect(back);
  }

  try {
    await finalizeGmailConnection(connectedAccountId);
    back.searchParams.set("gmail", "connected");
  } catch {
    back.searchParams.set("gmail", "error");
  }
  return NextResponse.redirect(back);
}

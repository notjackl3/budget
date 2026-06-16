import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { initiateGmailConnection } from "@/lib/gmail";

export const runtime = "nodejs";

// Kicks off the OAuth flow via Composio: ask Composio for a hosted consent URL
// (telling it to return the user to our callback), then redirect there. Composio
// brokers the Google credentials, so there's no client secret or state to manage
// here. Gated by the app session so a stranger can't initiate a connect.
export async function GET(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  try {
    const { redirectUrl } = await initiateGmailConnection(`${origin}/api/gmail/callback`);
    if (!redirectUrl) throw new Error("No redirect URL returned by Composio.");
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    const back = new URL("/settings", req.url);
    back.searchParams.set(
      "gmail",
      err instanceof Error && /COMPOSIO_API_KEY/.test(err.message)
        ? "notconfigured"
        : "error",
    );
    return NextResponse.redirect(back);
  }
}

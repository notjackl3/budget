"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Mail, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { disconnectGmailAction, syncGmailNow } from "@/app/actions";

const FLAG_TOASTS: Record<
  string,
  { title: string; description?: string; variant: "success" | "error" | "default" }
> = {
  connected: { title: "Gmail connected", variant: "success" },
  error: { title: "Couldn't connect Gmail", description: "Please try again.", variant: "error" },
  denied: { title: "Connection cancelled", variant: "default" },
  notconfigured: {
    title: "Gmail OAuth isn't configured",
    description: "Set COMPOSIO_API_KEY in .env (see README).",
    variant: "error",
  },
};

export function GmailConnectionCard({
  connected,
  configured,
  email,
  lastSyncLabel,
  statusFlag,
}: {
  connected: boolean;
  configured: boolean;
  email: string | null;
  lastSyncLabel: string | null;
  statusFlag?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);

  // Surface the OAuth round-trip result (passed as ?gmail=… on return), then
  // strip the query param so a refresh doesn't re-toast.
  React.useEffect(() => {
    if (!statusFlag) return;
    const t = FLAG_TOASTS[statusFlag];
    if (t) toast(t);
    router.replace("/settings");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFlag]);

  async function handleSync() {
    setBusy(true);
    try {
      const r = await syncGmailNow();
      toast({
        title: `Synced ${r.created.length} new transaction${r.created.length === 1 ? "" : "s"}`,
        description: `Scanned ${r.scanned} email${r.scanned === 1 ? "" : "s"}; ${r.duplicates.length} already imported.`,
        variant: "success",
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await disconnectGmailAction();
      toast({ title: "Gmail disconnected" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Couldn't disconnect",
        description: err instanceof Error ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" /> Email connection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect Gmail so new CIBC purchase alerts import automatically as
          provisional expenses — your monthly statement reconciles them later.
        </p>

        {connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="font-medium">Connected</span>
              {email && <span className="text-muted-foreground">· {email}</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              {lastSyncLabel ? `Last synced ${lastSyncLabel}` : "Not synced yet"}
            </p>
            <div className="flex gap-2">
              <Button onClick={handleSync} disabled={busy}>
                <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                Sync now
              </Button>
              <Button variant="outline" onClick={handleDisconnect} disabled={busy}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {!configured && (
              <p className="text-xs text-amber-600">
                Set <code>COMPOSIO_API_KEY</code> in <code>.env</code> first (see
                README).
              </p>
            )}
            <Button
              onClick={() => {
                window.location.href = "/api/gmail/connect";
              }}
              disabled={!configured}
            >
              Connect Gmail
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

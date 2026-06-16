import { formatDistanceToNow } from "date-fns";
import { getCategories, getSettings } from "@/lib/queries";
import { getGmailStatus } from "@/lib/gmail";
import { SettingsView } from "@/components/settings-view";
import { GmailConnectionCard } from "@/components/gmail-connection-card";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  const [categories, settings, gmail, params] = await Promise.all([
    getCategories(),
    getSettings(),
    getGmailStatus(),
    searchParams,
  ]);

  const cats = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    color: c.color,
    sortOrder: c.sortOrder,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure currency and manage your categories.
        </p>
      </div>
      <GmailConnectionCard
        connected={gmail.connected}
        configured={gmail.configured}
        email={gmail.email}
        lastSyncLabel={
          gmail.lastSyncAt
            ? formatDistanceToNow(gmail.lastSyncAt, { addSuffix: true })
            : null
        }
        statusFlag={params.gmail ?? null}
      />
      <SettingsView
        currencyCode={settings.currencyCode}
        currencySymbol={settings.currencySymbol}
        mealNeedCents={settings.mealNeedCents}
        categories={cats}
      />
    </div>
  );
}

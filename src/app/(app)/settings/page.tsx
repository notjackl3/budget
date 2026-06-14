import { getCategories, getPaymentMethods, getSettings } from "@/lib/queries";
import { SettingsView } from "@/components/settings-view";

export default async function SettingsPage() {
  const [categories, paymentMethods, settings] = await Promise.all([
    getCategories(),
    getPaymentMethods(),
    getSettings(),
  ]);

  const cats = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    color: c.color,
    sortOrder: c.sortOrder,
  }));
  const methods = paymentMethods.map((p) => ({
    id: p.id,
    name: p.name,
    sortOrder: p.sortOrder,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure currency and manage your categories and payment methods.
        </p>
      </div>
      <SettingsView
        currencyCode={settings.currencyCode}
        currencySymbol={settings.currencySymbol}
        mealNeedCents={settings.mealNeedCents}
        categories={cats}
        paymentMethods={methods}
      />
    </div>
  );
}

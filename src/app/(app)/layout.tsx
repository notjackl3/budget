import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getCategories, getPaymentMethods, getSettings } from "@/lib/queries";
import { CurrencyProvider } from "@/components/currency-provider";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) redirect("/login");

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
    <CurrencyProvider symbol={settings.currencySymbol}>
      <AppShell categories={cats} paymentMethods={methods}>
        {children}
      </AppShell>
    </CurrencyProvider>
  );
}

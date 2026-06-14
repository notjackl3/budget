import { getCategories, getPaymentMethods, getStatements } from "@/lib/queries";
import { ImportView } from "@/components/import/import-view";
import { formatDistanceToNow } from "date-fns";

export default async function ImportPage() {
  const [categories, paymentMethods, statements] = await Promise.all([
    getCategories(),
    getPaymentMethods(),
    getStatements(),
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import statements
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload bank statement PDFs. We extract each transaction, guess a
          category, and flag likely duplicates — review and edit before saving.
        </p>
      </div>

      <ImportView categories={cats} paymentMethods={methods} />

      {statements.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            Previously imported
          </h2>
          <ul className="divide-y rounded-xl border">
            {statements.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="font-medium">{s.label ?? s.filename}</span>
                <span className="text-muted-foreground">
                  {s._count.expenses} expenses ·{" "}
                  {formatDistanceToNow(s.createdAt, { addSuffix: true })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

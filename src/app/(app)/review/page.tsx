import { getCategories, getUnreviewedExpenses } from "@/lib/queries";
import { getGmailStatus } from "@/lib/gmail";
import { ReviewView } from "@/components/review-view";
import { FetchEmailsPanel } from "@/components/fetch-emails-panel";

export default async function ReviewPage() {
  const [expenses, categories, gmail] = await Promise.all([
    getUnreviewedExpenses(),
    getCategories(),
    getGmailStatus(),
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
        <h1 className="text-2xl font-semibold tracking-tight">Weekly Review</h1>
        <p className="text-sm text-muted-foreground">
          Confirm the category and need/want for each unreviewed expense, then
          tick it off.
        </p>
      </div>
      {gmail.connected && <FetchEmailsPanel />}
      <ReviewView expenses={expenses} categories={cats} />
    </div>
  );
}

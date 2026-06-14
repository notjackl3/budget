import { getCategories, getUnreviewedExpenses } from "@/lib/queries";
import { ReviewView } from "@/components/review-view";

export default async function ReviewPage() {
  const [expenses, categories] = await Promise.all([
    getUnreviewedExpenses(),
    getCategories(),
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
      <ReviewView expenses={expenses} categories={cats} />
    </div>
  );
}

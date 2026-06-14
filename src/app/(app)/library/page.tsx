import { getSettings } from "@/lib/queries";
import { PortfolioLibraryView } from "@/components/portfolio-library-view";

export default async function LibraryPage() {
  const settings = await getSettings();
  const base = settings.currencyCode;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portfolio Library</h1>
        <p className="text-sm text-muted-foreground">
          A sandbox of common investing strategies — tech-heavy, balanced, all-weather
          and more. Pick one to see what it&apos;s built from, swap the ETFs for your
          region, then model a starting amount and recurring contribution across
          best / average / worst scenarios. Nothing here touches your real holdings.
        </p>
      </div>

      <PortfolioLibraryView base={base} />
    </div>
  );
}

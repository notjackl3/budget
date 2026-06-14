import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sublabel,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  sublabel?: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <p className="eyebrow text-muted-foreground">{label}</p>
        <p
          className={cn(
            "tabular mt-2 text-2xl font-semibold tracking-tight",
            valueClassName,
          )}
        >
          {value}
        </p>
        {sublabel && (
          <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

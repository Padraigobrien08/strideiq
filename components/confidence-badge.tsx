import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ConfidenceBadge({ level }: { level: "low" | "medium" | "high" }) {
  const labels = {
    low: "Limited data: trends are indicative",
    medium: "Moderate sample: trends are reasonably reliable",
    high: "Solid sample: trends are reliable",
  };
  const colors = {
    low: "border-amber-500/30 bg-amber-500/10 text-amber-400/90",
    medium: "border-sky-500/30 bg-sky-500/10 text-sky-400/90",
    high: "border-accent/30 bg-accent/10 text-accent/90",
  };

  return (
    <Badge
      variant="outline"
      // Wraps on narrow screens: the medium label alone is ~300px on one line.
      className={cn(
        "h-auto max-w-full whitespace-normal rounded-full px-3 py-1 text-left",
        colors[level],
      )}
    >
      {labels[level]}
    </Badge>
  );
}

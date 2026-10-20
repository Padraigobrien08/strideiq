import { AlertCircle, CheckCircle2, Clock, Footprints, Moon, Shuffle, XCircle } from "lucide-react";
import { DAY_STATUS_LABELS, type WeekDayStatus } from "@/lib/training-week/weekView";
import { cn } from "@/lib/utils";

/** Status always carries an icon and a word, never colour alone (SPEC §13, A11Y-02). */
const STATUS_STYLE: Record<WeekDayStatus, { icon: typeof Clock; className: string }> = {
  today: { icon: Footprints, className: "bg-[var(--accent)]/12 text-[var(--accent)]" },
  upcoming: { icon: Clock, className: "bg-[var(--surface)] text-muted-foreground" },
  completed: {
    icon: CheckCircle2,
    className: "bg-[var(--positive-wash)] text-[var(--positive)]",
  },
  variance: { icon: AlertCircle, className: "bg-[var(--caution-wash)] text-[var(--caution)]" },
  changed: { icon: Shuffle, className: "bg-[var(--caution-wash)] text-[var(--caution)]" },
  skipped: { icon: XCircle, className: "bg-[var(--surface)] text-muted-foreground" },
  rest: { icon: Moon, className: "bg-[var(--surface)] text-muted-foreground" },
};

export function DayStatusChip({
  status,
  long = false,
  className,
}: {
  status: WeekDayStatus;
  long?: boolean;
  className?: string;
}) {
  const { icon: Icon, className: tone } = STATUS_STYLE[status];
  const label = DAY_STATUS_LABELS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {long ? label.long : label.short}
    </span>
  );
}

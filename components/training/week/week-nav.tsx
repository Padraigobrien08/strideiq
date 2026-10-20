"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

const iconButton =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-muted-foreground transition-colors hover:bg-[var(--surface-hover)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Previous / next week, and a way back to the current week when away from it. */
export function WeekNav({
  isCurrent,
  onPrev,
  onNext,
  onCurrent,
}: {
  isCurrent: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCurrent: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label="Previous week" onClick={onPrev} className={iconButton}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" aria-label="Next week" onClick={onNext} className={iconButton}>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
      {!isCurrent ? (
        <button
          type="button"
          onClick={onCurrent}
          className="ml-1 min-h-9 rounded-lg px-2 text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
        >
          This week
        </button>
      ) : null}
    </div>
  );
}

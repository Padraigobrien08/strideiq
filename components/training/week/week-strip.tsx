"use client";

import { useEffect, useRef } from "react";
import type { WeekDay } from "@/lib/training-week/weekView";
import { cn } from "@/lib/utils";
import { DayStatusChip } from "./day-status";

export const DAY_DETAIL_ID = "training-day-detail";

/**
 * The seven-day strip (SPEC §7.3). Desktop: seven equal columns. Phones: a strip that
 * scrolls on its own, never the page, with today in view on open (§7.7, TRAIN-06).
 * Each day is a button that selects it; the detail below follows the selection.
 */
export function WeekStrip({
  days,
  selectedDate,
  onSelect,
}: {
  days: WeekDay[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const scroller = useRef<HTMLUListElement>(null);

  // Bring today (or the selection) into view inside the strip only: scrolling the
  // container, not calling scrollIntoView, so the page itself never moves.
  const anchor = days.find((d) => d.isToday)?.date ?? selectedDate;
  useEffect(() => {
    const el = scroller.current;
    const cell = el?.querySelector<HTMLElement>(`[data-date="${anchor}"]`);
    if (!el || !cell || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = cell.offsetLeft - (el.clientWidth - cell.offsetWidth) / 2;
  }, [anchor]);

  return (
    <ul
      ref={scroller}
      aria-label="Days this week"
      className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-7 lg:overflow-visible"
    >
      {days.map((day) => {
        const selected = day.date === selectedDate;
        return (
          <li
            key={day.date}
            data-date={day.date}
            className="w-[9.5rem] shrink-0 snap-start lg:w-auto"
          >
            <button
              type="button"
              onClick={() => onSelect(day.date)}
              aria-pressed={selected}
              aria-controls={DAY_DETAIL_ID}
              aria-label={`${day.label}: ${day.title}${day.amount ? `, ${day.amount}` : ""}${
                day.isToday ? ", today" : ""
              }`}
              className={cn(
                "flex h-full w-full flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-[var(--accent)] bg-[var(--accent)]/[0.06]"
                  : "border-transparent hover:bg-[var(--surface-hover)]",
              )}
            >
              <span
                className={cn(
                  "text-sm font-semibold",
                  day.isToday ? "text-[var(--accent)]" : "text-foreground",
                )}
              >
                {day.label}
                {/* Today in words even when its chip shows a result (TRAIN-01, A11Y-02). */}
                {day.isToday && day.status !== "today" ? " · Today" : null}
              </span>
              <span className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                {day.title}
              </span>
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {day.amount ?? "—"}
              </span>
              <DayStatusChip status={day.status} className="mt-1" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

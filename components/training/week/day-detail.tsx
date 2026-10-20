"use client";

import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";
import type { Comparison, DayDetail as DayDetailView } from "@/lib/training-week/weekView";
import { SessionFigures } from "@/components/home/today/today-page";
import { DayStatusChip } from "./day-status";
import { DAY_DETAIL_ID } from "./week-strip";

const eyebrow = "text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted-subtle)]";

/**
 * The selected day (SPEC §7.4). Days still to run show the prescription; days with a
 * logged run show planned against completed, and only for that day (TRAIN-02…04).
 */
export function DayDetail({ detail }: { detail: DayDetailView }) {
  const hasRun = detail.comparison !== null;
  return (
    <section
      id={DAY_DETAIL_ID}
      aria-labelledby="training-day-title"
      aria-live="polite"
      className="grid gap-y-8 border-t border-[var(--border-subtle)] pt-8 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]"
    >
      <div className="min-w-0 lg:pr-12">
        <p className={eyebrow}>{detail.dateLabel}</p>
        <h2
          id="training-day-title"
          className="mt-3 text-[2rem] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[2.5rem]"
        >
          {detail.title}
        </h2>

        {detail.prescription ? <SessionFigures figures={detail.prescription.figures} /> : null}

        {detail.prescription?.structure ? (
          <div className="mt-8 border-t border-[var(--border-subtle)] pt-6">
            <h3 className="text-lg font-semibold text-foreground">Suggested structure</h3>
            {detail.prescription.structure.steps ? (
              <ol className="mt-3 divide-y divide-[var(--border-subtle)]">
                {detail.prescription.structure.steps.map((step, i) => (
                  <li
                    key={step.name}
                    className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-3 sm:grid-cols-[auto_9rem_6rem_minmax(0,1fr)] sm:items-baseline"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent)]/10 text-xs font-semibold text-[var(--accent)]">
                      {i + 1}
                    </span>
                    <span className="font-semibold text-foreground">{step.name}</span>
                    <span className="col-start-2 text-sm tabular-nums text-foreground sm:col-start-auto">
                      {step.amount ?? "As planned"}
                    </span>
                    <span className="col-start-2 text-sm text-muted-foreground sm:col-start-auto">
                      {step.effort}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-base text-muted-foreground">
                {detail.prescription.structure.note}
              </p>
            )}
            <p className="mt-2 text-xs text-[var(--muted-subtle)]">
              Suggested from the session type and your pace bands; the plan does not store steps.
            </p>
          </div>
        ) : null}

        {detail.why ? (
          <div className="mt-8 max-w-[65ch] border-t border-[var(--border-subtle)] pt-6">
            <h3 className="text-lg font-semibold text-foreground">Why it&apos;s in the week</h3>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">{detail.why}</p>
          </div>
        ) : null}

        {detail.alsoPlanned.length ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Also planned: {detail.alsoPlanned.join(", ")}
          </p>
        ) : null}
      </div>

      <aside
        aria-label="Session status"
        className="min-w-0 border-t border-[var(--border-subtle)] pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"
      >
        <p className={eyebrow}>Status</p>
        <DayStatusChip status={detail.status} long className="mt-3 px-3 py-1.5 text-sm" />
        {detail.note ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{detail.note}</p>
        ) : null}

        {detail.comparison ? <ComparisonTable comparison={detail.comparison} /> : null}

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          {hasRun && detail.activityHref ? (
            <Link
              href={detail.activityHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              View activity <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
          <Link
            href={detail.coachHref}
            className={
              hasRun
                ? "inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-medium text-[var(--accent)] underline-offset-4 hover:underline"
                : "inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            }
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Ask Coach
          </Link>
        </div>
      </aside>
    </section>
  );
}

function ComparisonTable({ comparison }: { comparison: Comparison }) {
  const rows = [
    { label: "Distance", ...comparison.distance },
    { label: "Pace", ...comparison.pace },
    { label: "Duration", ...comparison.duration },
  ];
  return (
    <table className="mt-6 w-full text-sm">
      <caption className="sr-only">Planned against completed</caption>
      <thead>
        <tr className="text-left text-xs text-[var(--muted-subtle)]">
          <th scope="col" className="pb-2 font-medium">
            <span className="sr-only">Measure</span>
          </th>
          <th scope="col" className="pb-2 font-medium">
            Planned
          </th>
          <th scope="col" className="pb-2 font-medium">
            Completed
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--border-subtle)]">
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row" className="py-2.5 pr-3 text-left font-normal text-muted-foreground">
              {r.label}
            </th>
            <td className="py-2.5 pr-3 tabular-nums text-foreground">{r.planned ?? "—"}</td>
            <td className="py-2.5 font-semibold tabular-nums text-foreground">{r.actual ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Clock,
  Gauge,
  MessageCircle,
  Moon,
  PersonStanding,
  RefreshCw,
  Route,
  UtensilsCrossed,
} from "lucide-react";
import { coachUrl } from "@/lib/coach/domainLinks";
import type {
  TodayFigures,
  TodayRestSession,
  TodayRunSession,
  TodayView,
} from "@/lib/today/todayView";
import { cn } from "@/lib/utils";
import { RaceOutlook, RaceStatusChip, RecentProgress } from "./race-outlook";
import { ReadinessException } from "./readiness-exception";

/**
 * Today (docs/ui-overhaul/SPEC.md §6): one question — what should I do now — answered
 * before anything else. Session first, at a size that reads in five seconds; why, and
 * how it serves the race; one primary action. The race outlook or recent progress sits
 * in the secondary column, and readiness only appears when it changed the session.
 *
 * Everything shown comes from `TodayView` (lib/today/todayView.ts); this file decides
 * layout, not content. Built on the Phase 1b tokens only.
 */
export function TodayPage({ view, below }: { view: TodayView; below?: ReactNode }) {
  const askHref = coachUrl({
    source: "today",
    date: view.isoDate,
    ...(view.session.calendarWorkoutId ? { workout: view.session.calendarWorkoutId } : {}),
  });

  return (
    // Capped and centred on wide screens (viewport contract rule 5), and sized so the
    // whole page fits one laptop screen of 1280×720 and up (rule 3).
    <div data-content-cap className="mx-auto w-full max-w-[1360px] pb-6">
      <div className="grid gap-y-8 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:gap-x-0">
        <section aria-labelledby="today-session" className="min-w-0 lg:pr-12">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted-subtle)]">
              Today · {view.dateLabel}
            </p>
            {/* Phones and tablets put the outlook below the session; the race status
                still belongs on the first screen (rule 2). */}
            {view.outlook.kind === "race" ? (
              <RaceStatusChip outlook={view.outlook} className="lg:hidden" />
            ) : null}
          </div>
          {view.session.kind === "run" ? (
            <RunPrescription session={view.session} />
          ) : (
            <RestPrescription session={view.session} />
          )}

          {view.readinessException ? (
            <ReadinessException
              impact={view.readinessException}
              coachHref={coachUrl({ source: "today", date: view.isoDate })}
            />
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-6">
            <Link
              href={askHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 text-[0.9375rem] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {view.session.kind === "run" ? "Ask about this run" : "Ask about today"}
            </Link>
            <Link
              href="/training"
              className="inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-medium text-[var(--accent)] underline-offset-4 hover:underline"
            >
              View this week <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {!view.hasPlan ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No plan saved for this week, so StrideIQ chose today from your recent training.{" "}
              <Link
                href="/training"
                className="font-medium text-[var(--accent)] underline-offset-4 hover:underline"
              >
                Plan your week
              </Link>
            </p>
          ) : null}
        </section>

        <aside
          aria-label={view.outlook.kind === "race" ? "Race outlook" : "Recent progress"}
          className="min-w-0 border-t border-[var(--border-subtle)] pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"
        >
          {view.outlook.kind === "race" ? (
            <RaceOutlook outlook={view.outlook} />
          ) : (
            <RecentProgress progress={view.outlook} />
          )}
        </aside>
      </div>

      {below ? (
        <div className="mt-8 space-y-4 border-t border-[var(--border-subtle)] pt-5">{below}</div>
      ) : null}
    </div>
  );
}

function RunPrescription({ session }: { session: TodayRunSession }) {
  return (
    <>
      <h1
        id="today-session"
        className="mt-3 text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[3rem]"
      >
        {session.title}
      </h1>
      <SessionFigures figures={session.figures} />
      {/* Tighter on phones so the primary action stays on a 375×667 first screen. */}
      <div className="mt-5 max-w-[65ch] space-y-4 border-t border-[var(--border-subtle)] pt-5 sm:mt-6 sm:space-y-5 sm:pt-6">
        <div>
          <h2 className="text-base font-semibold text-foreground sm:text-lg">Why today</h2>
          <p className="mt-1.5 text-base leading-relaxed text-muted-foreground sm:mt-2">
            {session.why}
          </p>
        </div>
        {session.raceRelevance ? (
          <div>
            <h2 className="text-base font-semibold text-foreground sm:text-lg">Race relevance</h2>
            <p className="mt-1.5 text-base leading-relaxed text-muted-foreground sm:mt-2">
              {session.raceRelevance}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}

/** Distance, duration and pace with their labels; shared with Training's selected day. */
export function SessionFigures({ figures }: { figures: TodayFigures }) {
  const items: { icon: typeof Route; label: string; value: string; wide?: boolean }[] = [];
  if (figures.distance) items.push({ icon: Route, label: "Distance", value: figures.distance });
  if (figures.duration) {
    items.push({
      icon: Clock,
      label: figures.duration.estimated ? "Duration (est.)" : "Duration",
      value: figures.duration.text,
    });
  }
  // A pace range is the widest figure; on phones it takes its own row rather than wrap.
  if (figures.pace)
    items.push({ icon: Gauge, label: "Pace", value: figures.pace.text, wide: true });
  if (items.length === 0) return null;

  return (
    <div className="mt-6">
      {/* One column on the narrowest phones (320px), where two would clip "45–50 min". */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap sm:gap-x-10 sm:gap-y-5">
        {items.map(({ icon: Icon, label, value, wide }) => (
          <div
            key={label}
            className={cn("flex min-w-0 items-start gap-3", wide && "min-[360px]:col-span-2")}
          >
            <Icon className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
            {/* dt before dd in the DOM (valid, and read label-first); value shown on top. */}
            <div className="flex min-w-0 flex-col-reverse">
              <dt className="mt-1 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-[var(--muted-subtle)]">
                {label}
              </dt>
              <dd className="whitespace-nowrap text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-foreground tabular-nums sm:text-[1.75rem]">
                {value}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      {figures.pace ? (
        <p className="mt-3 text-xs text-[var(--muted-subtle)]">
          Pace {lowerFirst(figures.pace.basis)}.
        </p>
      ) : null}
    </div>
  );
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function RestPrescription({ session }: { session: TodayRestSession }) {
  const guidance = [
    { icon: PersonStanding, title: "Mobility", text: session.guidance.mobility },
    { icon: Moon, title: "Sleep", text: session.guidance.sleep },
    { icon: UtensilsCrossed, title: "Fuel", text: session.guidance.fuel },
  ];
  return (
    <>
      <h1
        id="today-session"
        className="mt-3 text-[2.25rem] font-semibold leading-[1.05] tracking-[-0.03em] text-foreground sm:text-[3rem]"
      >
        {session.title}
      </h1>
      <p className="mt-4 max-w-[65ch] text-base leading-relaxed text-muted-foreground">
        {session.why}
      </p>
      <ul className="mt-8 grid gap-5 border-t border-[var(--border-subtle)] pt-8 sm:grid-cols-3">
        {guidance.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--positive)]" aria-hidden />
            <div>
              <p className="font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ul>
      {session.tomorrow ? (
        <div className="mt-8 rounded-xl bg-[var(--surface)] px-5 py-4">
          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-[var(--muted-subtle)]">
            Tomorrow
          </p>
          <p className="mt-1 font-semibold text-foreground">{session.tomorrow.title}</p>
          <p className="text-sm text-muted-foreground">
            {[
              session.tomorrow.figures.distance,
              session.tomorrow.figures.duration?.text,
              session.tomorrow.figures.pace?.text,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : null}
    </>
  );
}

/** Data source and sync, kept available but out of the way (IMPLEMENTATION-PLAN Phase 2). */
export function TodaySourceStatus({
  apiConnected,
  dataSourceLabel,
  syncing,
  syncError,
  onSync,
}: {
  apiConnected: boolean;
  dataSourceLabel: string | null;
  syncing: boolean;
  syncError: string | null;
  onSync: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
      <span>{dataSourceLabel ?? (apiConnected ? "Strava" : "Local import")}</span>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 font-medium transition-colors disabled:opacity-60",
          syncError ? "text-[var(--risk)]" : "text-[var(--accent)] hover:bg-[var(--surface-hover)]",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} aria-hidden />
        {syncing ? "Syncing" : syncError ? "Retry sync" : apiConnected ? "Sync" : "Connect Strava"}
      </button>
      {syncError ? (
        <p role="status" className="w-full text-[var(--risk)]">
          {syncError}
        </p>
      ) : null}
    </div>
  );
}

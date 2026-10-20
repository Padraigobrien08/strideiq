"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, HelpCircle } from "lucide-react";
import type { RaceStatus } from "@/lib/progress/raceStatus";
import type { TodayRaceOutlook, TodayRecentProgress } from "@/lib/today/todayView";
import { cn } from "@/lib/utils";

const eyebrow = "text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted-subtle)]";
const statLabel =
  "mt-1 whitespace-nowrap text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-[var(--muted-subtle)]";

/** Status always carries an icon and a word, never colour alone (SPEC §13, A11Y-02). */
const STATUS_STYLE: Record<RaceStatus, { icon: typeof CheckCircle2; className: string }> = {
  ahead: { icon: CheckCircle2, className: "bg-[var(--positive-wash)] text-[var(--positive)]" },
  on_track: { icon: CheckCircle2, className: "bg-[var(--positive-wash)] text-[var(--positive)]" },
  at_risk: { icon: AlertTriangle, className: "bg-[var(--risk-wash)] text-[var(--risk)]" },
  not_enough_evidence: {
    icon: HelpCircle,
    className: "bg-[var(--caution-wash)] text-[var(--caution)]",
  },
};

/**
 * Status and days to race in one chip: the outlook's headline where the full outlook
 * sits below the fold (Today on phones and tablets). Links to the projection.
 */
export function RaceStatusChip({
  outlook,
  className,
}: {
  outlook: TodayRaceOutlook;
  className?: string;
}) {
  const status = outlook.status;
  const style = status ? STATUS_STYLE[status.status] : null;
  const days = `${outlook.daysToRace} ${outlook.daysToRace === 1 ? "day" : "days"}`;
  return (
    <Link
      href="/progress"
      aria-label={`Race status: ${outlook.name}, ${status ? `${status.label}, ` : ""}${days} to go`}
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-semibold",
        style ? style.className : "bg-[var(--surface)] text-muted-foreground",
        className,
      )}
    >
      {style ? <style.icon className="h-3.5 w-3.5" aria-hidden /> : null}
      {status ? `${status.label} · ` : ""}
      {days}
    </Link>
  );
}

export function RaceOutlook({ outlook }: { outlook: TodayRaceOutlook }) {
  const status = outlook.status;
  const style = status ? STATUS_STYLE[status.status] : null;
  return (
    <div>
      <p className={eyebrow}>Race outlook</p>
      <h2 className="mt-3 text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-foreground">
        {outlook.name}
      </h2>

      {/* Wraps the goal onto a second line on the narrowest phones rather than break words. */}
      <dl className="mt-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
        <div className="flex flex-col-reverse">
          <dt className={statLabel}>To race</dt>
          <dd className="whitespace-nowrap text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums">
            {outlook.daysToRace} <span className="text-lg font-medium">days</span>
          </dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className={statLabel}>Status</dt>
          <dd>
            {status && style ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em]",
                  style.className,
                )}
              >
                <style.icon className="h-4 w-4" aria-hidden />
                {status.label}
              </span>
            ) : (
              <Link
                href="/progress"
                className="text-sm font-medium text-[var(--accent)] underline-offset-4 hover:underline"
              >
                Add a goal time
              </Link>
            )}
          </dd>
        </div>
        <div className="flex flex-col-reverse">
          <dt className={statLabel}>Goal</dt>
          <dd className="whitespace-nowrap text-[1.75rem] font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums">
            {outlook.goalTime ?? "—"}
          </dd>
        </div>
      </dl>

      {outlook.likelyRange ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Estimated range{" "}
          <span className="font-medium text-foreground tabular-nums">{outlook.likelyRange}</span>
        </p>
      ) : null}

      <div className="mt-6 space-y-4 border-t border-[var(--border-subtle)] pt-6">
        <Link
          href="/progress"
          className="inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-semibold text-[var(--accent)] underline-offset-4 hover:underline"
        >
          View projection <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        {outlook.provenance ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <BarChart3 className="h-4 w-4 shrink-0 text-[var(--muted-subtle)]" aria-hidden />
            {outlook.provenance}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function RecentProgress({ progress }: { progress: TodayRecentProgress }) {
  return (
    <div>
      <p className={eyebrow}>Recent progress</p>
      <p className="mt-3 text-lg font-semibold leading-snug text-foreground">
        {progress.direction}
      </p>
      {progress.trajectory.length >= 4 ? <Trajectory values={progress.trajectory} /> : null}
      {progress.observation ? (
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{progress.observation}</p>
      ) : null}
      <div className="mt-6 border-t border-[var(--border-subtle)] pt-6">
        {progress.pastRace ? (
          <p className="mb-3 text-sm text-muted-foreground">
            {progress.pastRace.name} has passed. Set your next race to see an outlook here.
          </p>
        ) : null}
        <Link
          href="/progress"
          className="inline-flex min-h-11 items-center gap-1.5 text-[0.9375rem] font-semibold text-[var(--accent)] underline-offset-4 hover:underline"
        >
          Set a race goal <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

/** Twelve weeks of fitness (chronic load). Decorative: the sentence above states it. */
function Trajectory({ values }: { values: number[] }) {
  const w = 240;
  const h = 56;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 4 - ((v - min) / span) * (h - 8)}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-4 h-14 w-full max-w-[240px]"
      aria-hidden
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

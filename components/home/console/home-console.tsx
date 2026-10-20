"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { coachUrl, topicCoachLink } from "@/lib/coach/domainLinks";
import {
  DecisionColumn,
  Eyebrow,
  formatDuration,
  LoadRow,
  Meter,
  Panel,
  PanelHeader,
  ProgressBar,
  Readout,
  Sparkline,
  StatItem,
  verdictTone,
  ZONE_COLOR,
  ZoneLegend,
} from "@/components/console/console-kit";
import { LegFeelCard } from "@/components/home/console/leg-feel-card";
import { JargonTerm } from "@/components/jargon-term";
import { ReturningCard } from "@/components/home/console/returning-card";
import type { DashboardInsights } from "@/lib/analytics";
import type { HomeOperatingSystemView } from "@/lib/home/operatingSystemView";
import type {
  CalendarIntensity,
  CalendarWorkout,
  TrainingCalendarWeek,
} from "@/lib/training-calendar";

/* ----------------------------------------------------------------------------
 * Home console — "instrument" direction, composed from components/console kit.
 * Wired to real data only (analytics + operating-system view + saved week).
 * -------------------------------------------------------------------------- */

const CONSENSUS_LABEL: Record<string, string> = {
  "5k": "5K",
  "10k": "10K",
  hm: "Half Marathon",
  marathon: "Marathon",
};

/**
 * Today's planned session, matched on the actual date. Matching the weekday
 * *name* as a fallback meant a saved week for a different week (the planner
 * targets next week) surfaced that week's same-named day as today's session.
 */
function findTodayWorkout(week: TrainingCalendarWeek | null): CalendarWorkout | null {
  if (!week) return null;
  const todayIso = format(new Date(), "yyyy-MM-dd");
  if (todayIso < week.weekStart.slice(0, 10) || todayIso > week.weekEnd.slice(0, 10)) {
    return null;
  }
  return week.workouts.find((w) => w.date.slice(0, 10) === todayIso) ?? null;
}

export function HomeConsole({
  vm,
  analytics,
  savedWeek,
  calendarHydrated,
  onGeneratePlan,
  planLoading,
  onSync,
  syncing,
  apiConnected,
  dataSourceLabel,
  pastRace,
  syncError,
}: {
  vm: HomeOperatingSystemView;
  analytics: DashboardInsights;
  savedWeek: TrainingCalendarWeek | null;
  calendarHydrated: boolean;
  onGeneratePlan?: () => void;
  planLoading?: boolean;
  onSync?: () => void;
  syncing?: boolean;
  apiConnected?: boolean;
  dataSourceLabel?: string | null;
  pastRace?: { label: string; date: string } | null;
  syncError?: string | null;
}) {
  const today = useMemo(() => findTodayWorkout(savedWeek), [savedWeek]);

  return (
    <div className="home-console flex w-full flex-col gap-3 font-sans">
      <StatusBar
        hero={vm.hero}
        onSync={onSync}
        syncing={syncing}
        syncError={syncError}
        apiConnected={apiConnected}
        confidence={analytics.dataConfidence}
      />

      {/* items-start: grid rows stretch by default, so the verdict panel grew to
          match the taller right column and left a large empty block under its
          actions.

          Leg-feel sits with the verdict, not with Readiness. Measured at 1440px the
          three cards are 237 / 306 / 178, so stacking the two tallest on the right
          left a 259px void beside a 237px verdict card — the single worst piece of
          dead space on the page. Pairing the shortest with the shortest balances the
          columns at 427 vs 306 and more than halves the gap. It also reads better:
          the verdict and "how do the legs feel?" are both things you act on, while
          Readiness is the number they are derived from. */}
      <div className="grid items-start gap-3 lg:grid-cols-[1.65fr_1fr]">
        <div className="flex flex-col gap-3">
          <TheCall
            vm={vm}
            today={today}
            onGeneratePlan={onGeneratePlan}
            planLoading={planLoading}
            hasSavedPlan={vm.hero.hasSavedPlan}
          />
          <LegFeelCard />
        </div>
        <Readiness analytics={analytics} hero={vm.hero} />
      </div>

      {/* After a gap, load-based advice has nothing recent to reason about, so the
          comeback takes the lead instead of sitting below the fold. */}
      {analytics.returning ? <ReturningCard plan={analytics.returning} /> : null}

      <WeekStrip
        savedWeek={savedWeek}
        hydrated={calendarHydrated}
        onGeneratePlan={onGeneratePlan}
        planLoading={planLoading}
      />

      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <Trajectory analytics={analytics} pastRace={pastRace} />
        <ChangeFeed items={vm.changeFeed} />
      </div>

      <Panel>
        <Eyebrow className="mb-3">Decision support</Eyebrow>
        <div className="grid gap-2.5 lg:grid-cols-3">
          <DecisionColumn
            title="Risks"
            items={vm.risks.map((r) => r.text)}
            color="var(--hz-moderate)"
            href={topicCoachLink(
              "intensity-stacking",
              "What risks should I address in my current training?",
            )}
          />
          <DecisionColumn
            title="Opportunities"
            items={vm.opportunities.map((o) => o.text)}
            color="var(--home-good)"
            href={topicCoachLink("opportunities", "Which opportunities should I act on this week?")}
          />
          <DecisionColumn
            title="Primary action"
            items={vm.primaryActionBullets}
            color="var(--home-signal)"
            href={topicCoachLink("recommendation", vm.primaryActionBullets[0] ?? "")}
          />
        </div>
      </Panel>

      <p className="border-t border-[var(--border-subtle)] pt-3 text-[10px] text-zinc-600">
        {dataSourceLabel ? `${dataSourceLabel} · ` : ""}
        Deeper analysis →{" "}
        <Link href="/intelligence" className="text-zinc-500 hover:text-[var(--home-signal)]">
          Intelligence
        </Link>
        {" · "}
        <Link href="/coach" className="text-zinc-500 hover:text-[var(--home-signal)]">
          Coach
        </Link>
      </p>
    </div>
  );
}

/* ---------------------------------- Status bar ---------------------------- */

function StatusBar({
  hero,
  onSync,
  syncing,
  syncError,
  apiConnected,
  confidence,
}: {
  hero: HomeOperatingSystemView["hero"];
  onSync?: () => void;
  syncing?: boolean;
  syncError?: string | null;
  apiConnected?: boolean;
  confidence: "low" | "medium" | "high";
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--surface-shadow-subtle)] ring-1 ring-[var(--border-subtle)]">
      {/* No wordmark here: the app shell already carries it, and repeating it
          read as two logos stacked on top of each other. */}
      <Eyebrow>Console</Eyebrow>

      <div className="flex-1" />

      <StatItem label="Today" value={format(new Date(), "EEE · d MMM")} />
      {hero.raceName && hero.daysUntilRace != null ? (
        <StatItem
          label={hero.raceName}
          value={`${hero.daysUntilRace} day${hero.daysUntilRace === 1 ? "" : "s"} out`}
          hot={hero.daysUntilRace <= 21}
        />
      ) : null}
      <StatItem label="Confidence" value={confidence} />

      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        aria-label={
          syncError ? "Retry sync" : apiConnected ? "Sync with Strava" : "Connect Strava to sync"
        }
        className={cn(
          "flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-xs ring-1 transition disabled:opacity-60",
          syncError
            ? "text-[var(--home-redline)] ring-[color-mix(in_srgb,var(--home-redline)_45%,transparent)] hover:ring-[var(--home-redline)]"
            : "text-zinc-400 ring-[var(--border-subtle)] hover:text-foreground hover:ring-[var(--border-default)]",
        )}
      >
        <span
          className={cn("inline-block h-1.5 w-1.5 rounded-full", syncing && "animate-pulse")}
          style={{
            background: syncError
              ? "var(--home-redline)"
              : apiConnected
                ? "var(--home-good)"
                : "var(--hz-moderate)",
          }}
        />
        {syncing ? (
          <>
            <RefreshCw className="h-3 w-3 animate-spin" /> Syncing
          </>
        ) : syncError ? (
          <>
            <RefreshCw className="h-3 w-3" /> Retry sync
          </>
        ) : (
          <>
            <RefreshCw className="h-3 w-3" /> {apiConnected ? "Sync" : "Not connected"}
          </>
        )}
      </button>

      {syncError ? (
        <p
          role="alert"
          className="basis-full font-mono text-[11px] leading-snug text-[var(--home-redline)]"
        >
          Couldn&apos;t sync with Strava: {syncError}. Your data is unchanged. Retry above, or{" "}
          <Link href="/import" className="underline underline-offset-2 hover:text-foreground">
            import manually
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

/* ---------------------------------- The Call ------------------------------ */

function TheCall({
  vm,
  today,
  onGeneratePlan,
  planLoading,
  hasSavedPlan,
}: {
  vm: HomeOperatingSystemView;
  today: CalendarWorkout | null;
  onGeneratePlan?: () => void;
  planLoading?: boolean;
  hasSavedPlan: boolean;
}) {
  const tone = verdictTone(vm.hero.freshnessLabel);
  const isRest = today?.modality === "rest" || today?.intensity === "rest";
  const zone: CalendarIntensity = today?.intensity ?? "moderate";

  // Structured readout when a planned session exists; otherwise the heuristic focus.
  const readoutValue = today
    ? isRest
      ? "Rest"
      : today.distanceKm != null
        ? today.distanceKm.toFixed(today.distanceKm % 1 === 0 ? 0 : 1)
        : today.durationMin != null
          ? String(today.durationMin)
          : null
    : null;
  const readoutUnit =
    today && !isRest
      ? today.distanceKm != null
        ? "km"
        : today.durationMin != null
          ? "min"
          : ""
      : "";

  const typeLabel = today
    ? isRest
      ? "Recovery"
      : (today.type || today.intensity).toString()
    : vm.today.fromPlan
      ? "Session"
      : "Focus";
  const sessionTitle = today ? today.title : vm.today.title;
  const why = today ? today.purpose || today.reasoning || vm.today.why : vm.today.why;

  return (
    <Panel bare className="overflow-hidden">
      {/* verdict */}
      <div
        className="flex flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 sm:px-5"
        style={{ background: `linear-gradient(180deg, ${tone.wash}, transparent)` }}
      >
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wide"
          style={{
            color: tone.color,
            background: tone.wash,
            boxShadow: `inset 0 0 0 1px ${tone.color}`,
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone.color }} />
          {vm.hero.freshnessLabel}
        </span>
        <span className="text-[13px] text-muted-foreground">{vm.today.stateLine}</span>
      </div>

      {/* session readout */}
      <div className="flex gap-4 px-4 py-5 sm:px-5">
        <span
          className="w-[5px] shrink-0 self-stretch rounded-full"
          style={{ background: ZONE_COLOR[zone] }}
        />
        <div className="min-w-0">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ color: isRest ? "var(--muted-subtle)" : "var(--home-signal)" }}
          >
            {typeLabel}
          </p>
          {readoutValue ? (
            <Readout
              value={readoutValue}
              unit={readoutUnit}
              className="mt-1.5 text-[clamp(32px,6vw,52px)]"
            />
          ) : (
            <p className="mt-1.5 font-display text-2xl font-semibold leading-tight tracking-tight text-foreground">
              {sessionTitle}
            </p>
          )}
          {readoutValue ? (
            <p className="mt-1.5 text-sm font-medium text-zinc-300">{sessionTitle}</p>
          ) : null}
          <p className="mt-2.5 max-w-[48ch] text-[13px] leading-snug text-muted-foreground">
            <span className="text-zinc-300">Why this: </span>
            {why}
          </p>
        </div>
      </div>

      {/* actions */}
      <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
        {hasSavedPlan ? (
          <Link href="/training">
            <Button
              size="sm"
              className="h-8 gap-1 border-0 text-xs text-[var(--home-signal-ink)]"
              style={{ background: "var(--home-signal)" }}
            >
              Open in plan
            </Button>
          </Link>
        ) : (
          <Button
            size="sm"
            disabled={planLoading}
            onClick={onGeneratePlan}
            className="h-8 gap-1 border-0 text-xs text-[var(--home-signal-ink)]"
            style={{ background: "var(--home-signal)" }}
          >
            <Sparkles className="h-3 w-3" />
            {planLoading ? "Generating…" : "Generate this week"}
          </Button>
        )}
        <Link href={coachUrl({ q: "Refine my session for today" })}>
          <Button size="sm" variant="outline" className="h-8 text-xs">
            Refine in Coach
          </Button>
        </Link>
        <Link href={coachUrl()}>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-zinc-500">
            Ask why <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
    </Panel>
  );
}

/* ---------------------------------- Readiness ----------------------------- */

function Readiness({
  analytics,
  hero,
}: {
  analytics: DashboardInsights;
  hero: HomeOperatingSystemView["hero"];
}) {
  const { fatigue, summary } = analytics;
  // High freshness = fresh (left, good); low = fatigued (right, redline).
  const needlePct = 100 - hero.freshness;

  return (
    <Panel>
      {/* The TSB readout keeps its place; the link is the drill-in to the load detail
          behind these numbers. Without it /training had no inbound link anywhere in the
          app, which made the command palette its only route in. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <Eyebrow>Readiness</Eyebrow>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-zinc-500">
            <JargonTerm term="tsb">TSB</JargonTerm> {fatigue.tsb > 0 ? "+" : ""}
            {fatigue.tsb}
          </span>
          <Link
            href="/progress/load"
            className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Load detail →
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <Meter pct={needlePct} labels={["Fresh", "Neutral", "Fatigued"]} active={fatigue.label} />
      </div>

      <div className="divide-y divide-[var(--border-subtle)]">
        <LoadRow
          k={<JargonTerm term="freshness">Freshness</JargonTerm>}
          v={String(hero.freshness)}
        />
        <LoadRow
          k={<JargonTerm term="ctl">Chronic load (CTL)</JargonTerm>}
          v={String(fatigue.ctl)}
        />
        <LoadRow
          k="7-day volume"
          v={`${summary.last7DaysKm.toFixed(0)} km`}
          sub={`${summary.last7DaysRuns} runs`}
        />
        <LoadRow
          k="Rest since last run"
          v={`${fatigue.restDaysSinceLastRun} day${fatigue.restDaysSinceLastRun === 1 ? "" : "s"}`}
        />
      </div>

      {fatigue.evidence[0] ? (
        <p className="mt-3 text-[11px] leading-snug text-zinc-500">{fatigue.evidence[0]}</p>
      ) : null}
    </Panel>
  );
}

/* ---------------------------------- Week strip ---------------------------- */

function WeekStrip({
  savedWeek,
  hydrated,
  onGeneratePlan,
  planLoading,
}: {
  savedWeek: TrainingCalendarWeek | null;
  hydrated: boolean;
  onGeneratePlan?: () => void;
  planLoading?: boolean;
}) {
  const workouts = useMemo(
    () => (savedWeek ? [...savedWeek.workouts].sort((a, b) => a.date.localeCompare(b.date)) : []),
    [savedWeek],
  );
  const todayIso = format(new Date(), "yyyy-MM-dd");

  if (hydrated && !savedWeek) {
    return (
      <Panel>
        <Eyebrow className="mb-2">This week</Eyebrow>
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-sm text-muted-foreground">
            No plan saved for this week yet. Generate one to see the week laid out by effort.
          </p>
          <Button
            size="sm"
            disabled={planLoading}
            onClick={onGeneratePlan}
            className="h-8 gap-1 border-0 text-xs text-[var(--home-signal-ink)]"
            style={{ background: "var(--home-signal)" }}
          >
            <Sparkles className="h-3 w-3" />
            {planLoading ? "Generating…" : "Generate this week"}
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title={
          <>
            This week
            {savedWeek?.totalRunDistanceKm != null ? (
              <span className="ml-2 font-mono text-zinc-400">
                {savedWeek.totalRunDistanceKm.toFixed(0)} km
              </span>
            ) : null}
          </>
        }
        href="/training"
        action="Open plan"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {workouts.map((w) => {
          const isToday = w.date.slice(0, 10) === todayIso;
          const isRest = w.modality === "rest" || w.intensity === "rest";
          return (
            <div
              key={w.id}
              className={cn(
                "relative flex min-h-[104px] flex-col gap-1.5 rounded-lg bg-[var(--surface-subdued)] p-2.5 ring-1",
                isToday ? "ring-[var(--home-signal-line)]" : "ring-[var(--border-subtle)]",
              )}
              style={isToday ? { background: "var(--home-signal-wash)" } : undefined}
            >
              {w.status === "completed" ? (
                <span
                  className="absolute right-2 top-2 font-mono text-[9px]"
                  style={{ color: "var(--home-good)" }}
                >
                  done
                </span>
              ) : null}
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-wide",
                  isToday ? "text-[var(--home-signal)]" : "text-zinc-500",
                )}
              >
                {w.day.slice(0, 3)}
                {isToday ? " · today" : ""}
              </span>
              <span
                className={cn(
                  "text-[12px] font-semibold leading-tight",
                  isRest ? "text-zinc-500" : "text-foreground",
                )}
              >
                {isRest ? "Rest" : w.type || w.title}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {isRest
                  ? "—"
                  : w.distanceKm != null
                    ? `${w.distanceKm.toFixed(0)} km`
                    : w.durationMin != null
                      ? `${w.durationMin} min`
                      : ""}
              </span>
              <span
                className="mt-auto h-1 rounded-full"
                style={{ background: ZONE_COLOR[w.intensity] }}
              />
            </div>
          );
        })}
      </div>

      <ZoneLegend className="mt-3" />
    </Panel>
  );
}

/* ---------------------------------- Trajectory ---------------------------- */

function Trajectory({
  analytics,
  pastRace,
}: {
  analytics: DashboardInsights;
  pastRace?: { label: string; date: string } | null;
}) {
  const rr = analytics.raceReadiness;
  const projectedSec = rr
    ? (analytics.racePredictionAnalysis.consensus.find(
        (c) => c.label === CONSENSUS_LABEL[rr.distance],
      )?.timeSec ?? null)
    : null;
  const targetSec = rr?.targetTimeSec ?? null;
  const deltaSec = projectedSec != null && targetSec != null ? targetSec - projectedSec : null;
  const confPct =
    analytics.racePredictionAnalysis.confidence === "high"
      ? 90
      : analytics.racePredictionAnalysis.confidence === "medium"
        ? 68
        : 42;

  // Real fitness (CTL) trend sparkline from load history.
  const ctlSeries = analytics.loadHistory.slice(-16).map((p) => p.ctl);

  return (
    <Panel>
      <PanelHeader
        title={rr ? `Projected finish · ${rr.distanceLabel}` : "Fitness trajectory"}
        href="/goals"
        action={rr ? "Race view" : "Set a race"}
      />

      {rr && projectedSec != null ? (
        <div className="flex items-end gap-4">
          <Readout value={formatDuration(projectedSec)} className="text-[clamp(28px,5vw,44px)]" />
          {deltaSec != null ? (
            <span
              className="mb-1.5 font-mono text-[13px]"
              style={{ color: deltaSec >= 0 ? "var(--home-good)" : "var(--home-redline)" }}
            >
              {deltaSec >= 0 ? "−" : "+"}
              {formatDuration(Math.abs(deltaSec))} vs goal
            </span>
          ) : (
            <span className="mb-1.5 font-mono text-[12px] text-zinc-500">{rr.probabilityBand}</span>
          )}
        </div>
      ) : pastRace ? (
        <div
          className="rounded-lg p-3"
          style={{
            background: "var(--home-signal-wash)",
            boxShadow: "inset 0 0 0 1px var(--home-signal-line)",
          }}
        >
          <p className="text-[13px] text-foreground">
            Your {pastRace.label.toLowerCase()} on{" "}
            <span className="font-mono">{format(parseISO(pastRace.date), "d MMM")}</span> has
            passed.
          </p>
          <Link
            href="/goals"
            className="mt-1 inline-flex items-center gap-0.5 text-[12px] font-medium text-[var(--home-signal)] hover:underline"
          >
            Set your next goal <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Set a race goal to see a projected finish. Fitness trend shown below.
        </p>
      )}

      {ctlSeries.length > 1 ? (
        <div className="mt-4">
          <Sparkline values={ctlSeries} />
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-500">
            Fitness (CTL) · last {ctlSeries.length} wk
          </p>
        </div>
      ) : null}

      {rr && projectedSec != null ? <ProgressBar pct={confPct} className="mt-4" /> : null}
    </Panel>
  );
}

/* ---------------------------------- Change feed --------------------------- */

function ChangeFeed({ items }: { items: HomeOperatingSystemView["changeFeed"] }) {
  const toneColor = (t: string) =>
    t === "positive"
      ? "var(--home-good)"
      : t === "warning"
        ? "var(--hz-moderate)"
        : "var(--hz-easy)";
  return (
    <Panel>
      {/* The printable change summary is the long form of this list, and had no inbound
          link either. Pairing them puts /report where a reader already is. */}
      <PanelHeader title="What changed recently" href="/report" action="Full report" />
      {items.length === 0 ? (
        <p className="text-[13px] text-zinc-500">No notable changes this block.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
          {items.slice(0, 6).map((it) => (
            <li key={it.id} className="flex items-start gap-2.5 py-2">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: toneColor(it.tone) }}
              />
              <span className="text-[13px] leading-snug text-zinc-200">{it.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

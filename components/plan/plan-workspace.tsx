"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { useWeeklyPlan } from "@/hooks/use-weekly-plan";
import { useTrainingCalendar } from "@/hooks/use-training-calendar";
import { useTrainingIntelligence } from "@/hooks/use-training-intelligence";
import { useStrava } from "@/lib/context/strava-context";
import { useGoalStore } from "@/stores/goal-store";
import {
  formatWeekRange,
  weekEndFromStart,
  weeklyPlanToCalendarWeek,
  calendarWeekToWeeklyPlan,
  saveCalendarWeek,
  dateForWeekDay,
  targetPlanWeekStart,
} from "@/lib/training-calendar";
import type { TrainingCalendarWeek } from "@/lib/training-calendar";
import {
  historyCount,
  pushWeekSnapshot,
  revertCalendarWeek,
} from "@/lib/training-calendar/calendarHistory";
import {
  buildWeekTelemetry,
  buildIntegrityItems,
  sessionExplainability,
  goalContextLabel,
  planPhaseLabel,
} from "@/lib/plan/planWorkspaceView";
import { coachUrl } from "@/lib/coach/domainLinks";
import { planErrorPresentation } from "@/lib/plan/planErrorPresentation";
import { PlanHeader, type PlanHeaderStatus } from "./plan-header";
import { PlanWeekBoard } from "./plan-week-board";
import { PlanWeekTelemetryStrip } from "./plan-week-telemetry";
import { PlanOperationalSidebar } from "./plan-operational-sidebar";
import { PlanSavedStateCard } from "./plan-saved-state";
import { PlanPlanningContext } from "./plan-planning-context";
import { currentWeekStart } from "@/lib/today/todayView";
import { buildTrainingWeekView, summaryLine } from "@/lib/training-week/weekView";
import { WeekStrip } from "@/components/training/week/week-strip";
import { DayDetail } from "@/components/training/week/day-detail";
import { WeekNav } from "@/components/training/week/week-nav";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CalendarPlus, RefreshCw } from "lucide-react";
import type { RunActivity } from "@/lib/strava/types";

// Stable empty reference so the week view memo below doesn't re-run every render
// when there's no import data (a fresh `[]` literal would break memoization).
const EMPTY_RUNS: RunActivity[] = [];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The week containing `?date=`, else the current week (TRAIN-01). */
function initialWeekStart(date: string | null): string {
  return date && ISO_DATE.test(date) ? currentWeekStart(parseISO(date)) : currentWeekStart();
}

/**
 * Mirror the selected day into the URL (`?date=`) so it survives a reload or a shared
 * link, without a navigation; other params (e.g. `debug`) survive.
 */
function replaceDateParam(date: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (date) params.set("date", date);
  else params.delete("date");
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
}

export function PlanWorkspace() {
  const searchParams = useSearchParams();
  const debugMode =
    searchParams.get("debug") === "true" ||
    (typeof window !== "undefined" &&
      process.env.NODE_ENV === "development" &&
      searchParams.get("debug") !== "false");

  const { analytics } = useTrainingIntelligence();
  const { importData } = useStrava();
  const raceGoal = useGoalStore((s) => s.raceGoal);
  const {
    generate,
    loading,
    error,
    errorStatus,
    result: preview,
    reset: resetPreview,
    lastPlanningContext,
  } = useWeeklyPlan();
  const requestedDate = searchParams.get("date");
  // Read from the URL once, then owned here; the URL only mirrors it.
  const [selectedDate, setSelectedDate] = useState<string | null>(requestedDate);
  // Training opens on the current week (SPEC §7.2); generation still targets next week.
  const [viewWeekStart, setViewWeekStart] = useState(() => initialWeekStart(requestedDate));
  const calendar = useTrainingCalendar(viewWeekStart);
  const [planningContext, setPlanningContext] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const [clearOpen, setClearOpen] = useState(false);

  useEffect(() => {
    if (calendar.savedWeek?.planningContext) {
      setPlanningContext(calendar.savedWeek.planningContext);
    }
  }, [calendar.savedWeek?.weekStart, calendar.savedWeek?.planningContext]);

  const previewWeek = useMemo(() => {
    if (!preview) return null;
    return weeklyPlanToCalendarWeek(preview.plan, preview);
  }, [preview]);

  // Generation always builds next week, so follow a fresh preview to the week it is for;
  // otherwise it would arrive off screen while the current week is in view. Adjusted
  // during render (React's "storing information from previous renders"), not in an effect.
  const [followedPreview, setFollowedPreview] = useState<string | null>(null);
  if (previewWeek && previewWeek.weekStart !== followedPreview) {
    setFollowedPreview(previewWeek.weekStart);
    setViewWeekStart(previewWeek.weekStart);
  }

  const previewAppliesToView =
    previewWeek?.weekStart === viewWeekStart || previewWeek?.weekStart === calendar.targetWeek;

  const showingPreview = Boolean(
    previewAppliesToView && previewWeek && (confirmReplace || !calendar.savedWeek),
  );

  const displayWeek: TrainingCalendarWeek | null = useMemo(
    () => (showingPreview ? previewWeek : calendar.savedWeek),
    [showingPreview, previewWeek, calendar.savedWeek],
  );

  const status: PlanHeaderStatus = useMemo(() => {
    if (!displayWeek && !preview && !calendar.savedWeek) return "empty";
    if (calendar.savedWeek?.workouts.some((w) => w.status !== "planned")) {
      return "modified";
    }
    if (preview && calendar.savedWeek && !confirmReplace) {
      return "saved_with_preview";
    }
    if (preview && !calendar.hasSaved) return "preview";
    if (calendar.savedWeek && !preview) return "saved";
    if (preview) return "preview";
    return "empty";
  }, [displayWeek, preview, calendar.savedWeek, calendar.hasSaved, confirmReplace]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "saved":
        return "Saved · your week";
      case "preview":
        return preview?.source === "fallback" ? "Unsaved preview (fallback)" : "Unsaved preview";
      case "saved_with_preview":
        return "Saved · new preview ready";
      case "modified":
        return "Saved · edited";
      default:
        return "No plan";
    }
  }, [status, preview?.source]);

  const weekRange = displayWeek
    ? formatWeekRange(displayWeek.weekStart, displayWeek.weekEnd)
    : formatWeekRange(calendar.targetWeek, weekEndFromStart(calendar.targetWeek));

  const phaseLabel = displayWeek
    ? planPhaseLabel(displayWeek.planType)
    : preview?.plan.planType
      ? planPhaseLabel(preview.plan.planType)
      : "Adaptive week";

  const goalContext = goalContextLabel(raceGoal, analytics);
  const errorInfo = useMemo(() => planErrorPresentation(error, errorStatus), [error, errorStatus]);

  const telemetry = displayWeek ? buildWeekTelemetry(displayWeek, analytics) : null;
  const integrityItems = displayWeek ? buildIntegrityItems(displayWeek, preview) : [];
  const explainLines = displayWeek ? sessionExplainability(displayWeek) : [];

  const runs = importData?.runs ?? EMPTY_RUNS;
  const physiology = analytics?.physiology ?? null;
  // The strip and selected day (SPEC §7). A preview has no runs against it: nothing in
  // an unsaved plan has been done yet.
  const weekView = useMemo(
    () =>
      displayWeek
        ? buildTrainingWeekView({
            week: displayWeek,
            runs: showingPreview ? EMPTY_RUNS : runs,
            physiology,
            selectedDate,
          })
        : null,
    [displayWeek, showingPreview, runs, physiology, selectedDate],
  );

  const selectDay = useCallback((date: string) => {
    setSelectedDate(date);
    replaceDateParam(date);
  }, []);

  const shiftViewWeek = useCallback((deltaWeeks: number) => {
    setViewWeekStart((current) => format(addDays(parseISO(current), deltaWeeks * 7), "yyyy-MM-dd"));
    setConfirmReplace(false);
    setHighlightIds([]);
    // A new week starts on today (if it is in it) or its Monday.
    setSelectedDate(null);
    replaceDateParam(null);
  }, []);

  const showCurrentWeek = useCallback(() => {
    setViewWeekStart(currentWeekStart());
    setConfirmReplace(false);
    setHighlightIds([]);
    setSelectedDate(null);
    replaceDateParam(null);
  }, []);

  // Generating a preview never touches the saved week (it lives beside it until
  // you save over it), so this needs no confirmation step.
  const handleGenerate = useCallback(async () => {
    setSaveError(null);
    await generate({
      planningContext: planningContext.trim() || undefined,
    });
    setConfirmReplace(false);
  }, [generate, planningContext]);

  const handleSave = useCallback(() => {
    if (!preview) return;
    setSaveError(null);
    const outcome = calendar.saveFromGenerated(preview, {
      planningContext: planningContext.trim() || lastPlanningContext || undefined,
    });
    if (!outcome.ok) {
      const high = outcome.validation.issues.filter((i) => i.severity === "high");
      setSaveError(high[0]?.message ?? "Cannot save: fix the critical issues, or regenerate.");
      return;
    }
    resetPreview();
    setConfirmReplace(false);
    setHistoryTick((n) => n + 1);
    toast.success("Week saved", {
      description: `${weekRange} is now your living plan on Today and Training.`,
    });
  }, [preview, calendar, resetPreview, planningContext, lastPlanningContext, weekRange]);

  // Clearing is the one destructive action here, so snapshot first: that makes
  // the toast's Undo real rather than decorative.
  const handleClearConfirmed = useCallback(() => {
    const cleared = calendar.savedWeek;
    if (cleared) pushWeekSnapshot(cleared);
    calendar.clearWeek();
    resetPreview();
    setConfirmReplace(false);
    setSaveError(null);
    setHighlightIds([]);
    setClearOpen(false);
    setHistoryTick((n) => n + 1);
    toast.success("Saved week cleared", {
      description: weekRange,
      action: cleared
        ? {
            label: "Undo",
            onClick: () => {
              saveCalendarWeek(cleared);
              revertCalendarWeek(cleared.weekStart);
              calendar.refresh();
              setHistoryTick((n) => n + 1);
              toast.success("Week restored");
            },
          }
        : undefined,
    });
  }, [calendar, resetPreview, weekRange]);

  const handleRevert = useCallback(() => {
    const previous = revertCalendarWeek(calendar.targetWeek);
    if (!previous) {
      toast.info("No earlier version to restore for this week.");
      return;
    }
    saveCalendarWeek(previous);
    calendar.refresh();
    setHistoryTick((n) => n + 1);
    toast.success("Restored the previous version of this week");
  }, [calendar]);

  const handleDuplicate = useCallback(() => {
    if (!calendar.savedWeek) return;
    const nextStart = format(addDays(parseISO(calendar.savedWeek.weekStart), 7), "yyyy-MM-dd");
    const now = new Date().toISOString();
    const duplicated: TrainingCalendarWeek = {
      ...JSON.parse(JSON.stringify(calendar.savedWeek)),
      id: `week-${nextStart}`,
      weekStart: nextStart,
      weekEnd: weekEndFromStart(nextStart),
      revision: 1,
      savedAt: now,
      updatedAt: now,
      workouts: calendar.savedWeek.workouts.map((w) => ({
        ...w,
        id: `w-${nextStart}-${w.day.slice(0, 3).toLowerCase()}`,
        date: dateForWeekDay(nextStart, w.day),
        createdAt: now,
        updatedAt: now,
      })),
    };
    saveCalendarWeek(duplicated);
    toast.success("Week duplicated", {
      description: `Copied to the week of ${format(parseISO(nextStart), "MMM d")}.`,
      action: {
        label: "View it",
        onClick: () => shiftViewWeek(1),
      },
    });
  }, [calendar.savedWeek, shiftViewWeek]);

  const coachPlan = calendar.savedWeek
    ? calendarWeekToWeeklyPlan(calendar.savedWeek)
    : preview?.plan;

  const coachHref = coachUrl({
    q: calendar.savedWeek
      ? "Modify my saved week plan, keeping changes conservative"
      : "Build my next week plan for Mon/Wed/Fri/Sun only",
  });

  const histCount = calendar.savedWeek ? historyCount(calendar.savedWeek.weekStart) : 0;

  return (
    // Capped and centred on wide screens (viewport contract rule 5).
    <div data-content-cap className="plan-workspace mx-auto w-full max-w-[1360px] space-y-3 pb-10">
      <PlanHeader
        eyebrow={weekEyebrow(viewWeekStart)}
        title={weekView?.rangeLabel ?? weekRange}
        summary={
          weekView ? (
            <p className="text-base tabular-nums text-muted-foreground">
              {showingPreview ? "Preview · " : ""}
              {summaryLine(weekView)}
            </p>
          ) : undefined
        }
        nav={
          <WeekNav
            isCurrent={viewWeekStart === currentWeekStart()}
            onPrev={() => shiftViewWeek(-1)}
            onNext={() => shiftViewWeek(1)}
            onCurrent={showCurrentWeek}
          />
        }
        weekRange={weekRange}
        status={status}
        statusLabel={statusLabel}
        phaseLabel={phaseLabel}
        goalContext={goalContext}
        confidence={
          analytics?.dataConfidence ??
          (displayWeek?.confidence === "medium_high"
            ? "medium"
            : displayWeek?.confidence === "high"
              ? "high"
              : displayWeek?.confidence === "low"
                ? "low"
                : "medium")
        }
        canSave={Boolean(preview && showingPreview)}
        canRevert={histCount > 0 && !showingPreview}
        hasSaved={calendar.hasSaved}
        loading={loading}
        onGenerate={() => void handleGenerate()}
        onSave={handleSave}
        onClear={() => setClearOpen(true)}
        onDuplicate={calendar.hasSaved ? handleDuplicate : undefined}
        onRevert={handleRevert}
        onViewPreview={() => setConfirmReplace(true)}
        onViewSaved={() => setConfirmReplace(false)}
        showingPreview={showingPreview}
        coachHref={coachHref}
      />

      {!displayWeek ? (
        <PlanPlanningContext
          value={planningContext}
          onChange={setPlanningContext}
          disabled={loading}
        />
      ) : null}

      {showingPreview && (planningContext.trim() || lastPlanningContext) ? (
        <p className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]/30 px-3 py-1.5 text-[11px] text-zinc-500">
          <span className="text-zinc-600">Context for this preview: </span>
          {planningContext.trim() || lastPlanningContext}
        </p>
      ) : null}

      {showingPreview && preview ? (
        <Alert className="border-amber-500/20 bg-amber-500/[0.05] px-3 py-1.5 text-[11px] text-amber-200/85">
          <AlertDescription className="text-[11px] text-amber-200/85">
            Preview only. Save it to make this your persistent training week.
          </AlertDescription>
        </Alert>
      ) : null}

      {saveError ? (
        <Alert className="border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-200/90">
          <AlertDescription className="text-[12px] text-amber-200/90">{saveError}</AlertDescription>
        </Alert>
      ) : null}

      {errorInfo ? (
        <Alert role="alert" className="border-red-500/20 bg-red-500/5 px-3 py-2.5">
          <AlertDescription className="text-sm text-red-300/90">
            <span className="font-medium text-red-200">{errorInfo.title}</span>
            <span className="mt-0.5 block text-[13px] text-red-300/80">{errorInfo.detail}</span>
          </AlertDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {errorInfo.fallbackLabel ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={loading}
                onClick={() => void generate({ forceFallback: true })}
              >
                {errorInfo.fallbackLabel}
              </Button>
            ) : null}
            {errorInfo.link ? (
              <Link href={errorInfo.link.href}>
                <Button size="sm" variant="outline" className="h-8">
                  {errorInfo.link.label}
                </Button>
              </Link>
            ) : null}
            {errorInfo.canRetry ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-zinc-400"
                disabled={loading}
                onClick={() => void handleGenerate()}
              >
                Try again
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}

      {loading && !displayWeek ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
          <div className="skeleton-shimmer h-40 rounded-lg" />
          <div className="skeleton-shimmer h-32 rounded-lg" />
        </div>
      ) : null}

      {!loading && status === "empty" && !displayWeek ? (
        <div className="rounded-lg border border-dashed border-[var(--border-default)] px-5 py-12 text-center">
          <CalendarPlus className="mx-auto h-9 w-9 text-zinc-700" />
          <p className="mt-2 text-[15px] font-medium text-zinc-300">
            Your training week starts here
          </p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-zinc-600">
            Generate a week, edit sessions on the board, then save. It becomes your living plan on
            Today and Training.
          </p>
          <Button className="mt-4 h-9 gap-1.5" onClick={() => void handleGenerate()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Generate plan
          </Button>
        </div>
      ) : null}

      {!displayWeek && !loading && status !== "empty" ? (
        <div className="rounded-lg border border-dashed border-[var(--border-default)] px-4 py-6 text-center">
          <p className="text-[13px] text-zinc-500">No saved plan for this week.</p>
          {/* Plans are generated for next week only; say so rather than imply this one. */}
          <Button className="mt-3 h-8 gap-1.5" size="sm" onClick={() => void handleGenerate()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {viewWeekStart === targetPlanWeekStart()
              ? "Generate for this week"
              : "Generate next week's plan"}
          </Button>
        </div>
      ) : null}

      {displayWeek && weekView ? (
        <div className="space-y-6 pt-1">
          <WeekStrip
            days={weekView.days}
            selectedDate={weekView.selected.date}
            onSelect={selectDay}
          />
          <DayDetail detail={weekView.selected} />

          <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-6 xl:grid-cols-[1fr_272px]">
            <div className="min-w-0 space-y-3">
              {/* Direct edits stay on the board until 3b moves them to the selected day. */}
              <Collapsible className="rounded-lg border border-[var(--border-subtle)]">
                <CollapsibleTrigger className="flex w-full min-h-11 items-center justify-between px-4 text-left text-sm font-semibold text-foreground">
                  {showingPreview ? "Preview the whole week" : "Edit this week"}
                  <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
                    Edit, move or remove sessions
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t border-[var(--border-subtle)] p-2 sm:p-3">
                  <PlanWeekBoard
                    week={displayWeek}
                    variant="full"
                    editable={!showingPreview && Boolean(calendar.savedWeek)}
                    draggable={!showingPreview && Boolean(calendar.savedWeek)}
                    highlightWorkoutIds={highlightIds}
                    onPatchWorkout={!showingPreview ? calendar.patchWorkout : undefined}
                    onDeleteWorkout={!showingPreview ? calendar.removeWorkout : undefined}
                    onSwapWorkouts={!showingPreview ? calendar.swapWorkouts : undefined}
                    onSwipePastStart={() => shiftViewWeek(-1)}
                    onSwipePastEnd={() => shiftViewWeek(1)}
                  />
                </CollapsibleContent>
              </Collapsible>

              {telemetry ? <PlanWeekTelemetryStrip telemetry={telemetry} /> : null}

              {calendar.savedWeek?.planningContext && !showingPreview ? (
                <p className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]/30 px-3 py-1.5 text-[11px] text-zinc-500">
                  <span className="text-zinc-600">Context used for this week: </span>
                  {calendar.savedWeek.planningContext}
                </p>
              ) : null}

              {calendar.savedWeek && !showingPreview ? (
                <PlanSavedStateCard
                  week={calendar.savedWeek}
                  historyAvailable={histCount}
                  modified={status === "modified"}
                  key={historyTick}
                />
              ) : null}
            </div>

            <PlanOperationalSidebar
              week={!showingPreview ? calendar.savedWeek : null}
              preview={showingPreview ? preview : null}
              integrityItems={integrityItems}
              explainLines={explainLines}
              onHighlightWorkouts={setHighlightIds}
            />
          </div>
        </div>
      ) : null}

      {debugMode && preview ? (
        <Collapsible className="rounded border border-[var(--border-subtle)] px-2 py-1 text-[10px] text-zinc-700">
          <CollapsibleTrigger className="cursor-pointer text-left">
            Advanced (dev)
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-1 max-h-32 overflow-auto">
              {JSON.stringify(
                { validation: preview.validation, integrity: preview.integrity },
                null,
                2,
              )}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {coachPlan ? (
        <p className="text-[10px] text-zinc-700">
          Coach uses {calendar.savedWeek ? "your saved calendar" : "the current preview"}. Plans
          persist in this browser only.
        </p>
      ) : null}

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear the saved week?</DialogTitle>
            <DialogDescription>
              {weekRange} will be removed from Today and Training. You can undo this straight
              afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setClearOpen(false)}>
              Keep the week
            </Button>
            <Button
              size="sm"
              onClick={handleClearConfirmed}
              className="border-0 bg-[var(--home-redline)] text-white hover:opacity-90"
            >
              Clear saved week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function weekEyebrow(weekStart: string): string {
  const current = currentWeekStart();
  if (weekStart === current) return "Current week";
  if (weekStart === targetPlanWeekStart()) return "Next week";
  return weekStart < current ? "Past week" : "Upcoming week";
}

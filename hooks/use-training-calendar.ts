"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerateWeeklyPlanResult } from "@/lib/ai-planning";
import {
  deleteCalendarWeek,
  getCalendarWeek,
  mergeServerWeeks,
  saveCalendarWeek,
  targetPlanWeekStart,
  updateCalendarWorkout,
  deleteCalendarWorkout,
  swapCalendarWorkouts,
  weeklyPlanToCalendarWeek,
  validateBeforeSave,
  type CalendarWorkout,
  type TrainingCalendarWeek,
} from "@/lib/training-calendar";

type PendingSync = { type: "put"; week: TrainingCalendarWeek } | { type: "del"; weekStart: string };

export function useTrainingCalendar(weekStart?: string) {
  const targetWeek = weekStart ?? targetPlanWeekStart();
  const [savedWeek, setSavedWeek] = useState<TrainingCalendarWeek | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setSavedWeek(getCalendarWeek(targetWeek));
    setHydrated(true);
  }, [targetWeek]);

  // Local cache first (instant), then reconcile with the durable server copy.
  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me/training-calendar", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { weeks?: TrainingCalendarWeek[] } | null) => {
        if (cancelled || !data?.weeks) return;
        if (mergeServerWeeks(data.weeks)) refresh();
      })
      .catch(() => {
        /* offline / no DB — localStorage cache stands */
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Debounced, fire-and-forget push of the latest local change to the server.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<PendingSync | null>(null);
  const scheduleSync = useCallback((action: PendingSync) => {
    pending.current = action;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      const p = pending.current;
      pending.current = null;
      if (!p) return;
      if (p.type === "put") {
        void fetch("/api/me/training-calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ week: p.week }),
        }).catch(() => {});
      } else {
        void fetch(`/api/me/training-calendar?weekStart=${encodeURIComponent(p.weekStart)}`, {
          method: "DELETE",
          credentials: "include",
        }).catch(() => {});
      }
    }, 800);
  }, []);

  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    },
    [],
  );

  const saveFromGenerated = useCallback(
    (result: GenerateWeeklyPlanResult, opts?: { planningContext?: string }) => {
      const week = weeklyPlanToCalendarWeek(result.plan, result, {
        generatedAt: new Date().toISOString(),
        planningContext: opts?.planningContext,
      });
      const validation = validateBeforeSave(
        week,
        result.plan,
        result.guardrails,
        result.integrity?.severity,
        { source: result.source },
      );
      if (!validation.canSave) {
        return { ok: false as const, validation, week };
      }
      saveCalendarWeek(week);
      const stored = getCalendarWeek(week.weekStart);
      setSavedWeek(stored ?? week);
      if (stored) scheduleSync({ type: "put", week: stored });
      return { ok: true as const, validation, week };
    },
    [scheduleSync],
  );

  const clearWeek = useCallback(() => {
    deleteCalendarWeek(targetWeek);
    setSavedWeek(null);
    scheduleSync({ type: "del", weekStart: targetWeek });
  }, [targetWeek, scheduleSync]);

  const patchWorkout = useCallback(
    (
      workoutId: string,
      patch: Partial<
        Pick<
          CalendarWorkout,
          "title" | "durationMin" | "distanceKm" | "status" | "intensity" | "purpose"
        >
      >,
    ) => {
      const updated = updateCalendarWorkout(targetWeek, workoutId, patch);
      if (updated) {
        const stored = getCalendarWeek(targetWeek);
        setSavedWeek(stored ?? updated);
        if (stored) scheduleSync({ type: "put", week: stored });
      }
      return updated;
    },
    [targetWeek, scheduleSync],
  );

  const removeWorkout = useCallback(
    (workoutId: string) => {
      const updated = deleteCalendarWorkout(targetWeek, workoutId);
      if (updated) {
        const stored = getCalendarWeek(targetWeek);
        setSavedWeek(stored ?? updated);
        if (stored) scheduleSync({ type: "put", week: stored });
      }
      return updated;
    },
    [targetWeek, scheduleSync],
  );

  /**
   * Save an edited copy of the week in one step (Training's session editor). Goes
   * through `saveCalendarWeek`, so the previous version is snapshotted for Revert and
   * Undo, and syncs to the server like every other change.
   */
  const replaceWeek = useCallback(
    (next: TrainingCalendarWeek) => {
      saveCalendarWeek(next);
      const stored = getCalendarWeek(next.weekStart);
      if (next.weekStart === targetWeek) setSavedWeek(stored ?? next);
      if (stored) scheduleSync({ type: "put", week: stored });
      return stored;
    },
    [targetWeek, scheduleSync],
  );

  const swapWorkouts = useCallback(
    (fromWorkoutId: string, toWorkoutId: string) => {
      const updated = swapCalendarWorkouts(targetWeek, fromWorkoutId, toWorkoutId);
      if (updated) {
        const stored = getCalendarWeek(targetWeek);
        setSavedWeek(stored ?? updated);
        if (stored) scheduleSync({ type: "put", week: stored });
      }
      return updated;
    },
    [targetWeek, scheduleSync],
  );

  return {
    targetWeek,
    savedWeek,
    hydrated,
    // Derived from state, not a parallel localStorage read: the two could
    // disagree, which left the header offering Duplicate/Clear for a week that
    // had already been cleared. It also keeps first render hydration-safe.
    hasSaved: savedWeek !== null,
    refresh,
    saveFromGenerated,
    clearWeek,
    patchWorkout,
    replaceWeek,
    removeWorkout,
    swapWorkouts,
  };
}

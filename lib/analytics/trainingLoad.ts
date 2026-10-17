import type { RunActivity } from "@/lib/strava/types";
import { parseISO, format, startOfWeek } from "date-fns";
import { resolveLoadModel } from "./loadModel";

export interface LoadPoint {
  date: string;
  label: string;
  trainingLoad: number | null;
  relativeEffort: number | null;
}

export interface FitnessIndexPoint {
  weekStart: string;
  label: string;
  ctl: number;
}

/**
 * Simple CTL-style EMA on weekly sum of load. Per-run load follows the same one-source
 * rule as `weeklyLoadSeries` (`lib/analytics/loadModel.ts`); it used to read raw Training
 * Load and skip every run without it, so an API-synced athlete had no index at all.
 */
export function fitnessIndex(runs: RunActivity[], tauWeeks = 6): FitnessIndexPoint[] {
  const { loadOf } = resolveLoadModel(runs);
  const weekly = new Map<string, number>();
  for (const run of runs) {
    const d = parseISO(run.date);
    const key = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
    weekly.set(key, (weekly.get(key) ?? 0) + loadOf(run));
  }

  const sorted = [...weekly.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const alpha = 2 / (tauWeeks + 1);
  let ctl = 0;
  const points: FitnessIndexPoint[] = [];

  for (const [weekStart, load] of sorted) {
    ctl = alpha * load + (1 - alpha) * ctl;
    points.push({
      weekStart,
      label: format(parseISO(weekStart), "MMM d"),
      ctl: Math.round(ctl),
    });
  }

  return points;
}

export function loadByRun(runs: RunActivity[]): LoadPoint[] {
  return runs
    .filter((r) => r.trainingLoad !== null || r.relativeEffort !== null)
    .map((r) => ({
      date: r.date,
      label: format(parseISO(r.date), "MMM d"),
      trainingLoad: r.trainingLoad,
      relativeEffort: r.relativeEffort,
    }));
}

import type { RunActivity } from "@/lib/strava/types";
import { differenceInCalendarDays, parseISO } from "date-fns";

/**
 * What one run costs, in a single unit per athlete.
 *
 * The old rule took Strava's Training Load where a run had it and `distance × 10`
 * where it didn't, and averaged the two together. They were never calibrated against
 * each other, so a CSV export with Training Load on two runs in three mixed scales in
 * one average — and an API-synced athlete, whose runs never carry Training Load, got
 * distance only. On identical training that moved freshness by up to 25 points
 * depending on how the data arrived (see `__tests__/__snapshots__/load-balance-baseline.txt`).
 *
 * Now each athlete gets one source: the first of Relative Effort, Training Load and
 * distance that covers at least `COVERAGE_MIN` of recent runs. Relative Effort comes
 * first because both import paths carry it (the API as `suffer_score`).
 *
 * The chosen source is then **rescaled onto the distance-proxy scale** by a per-athlete
 * factor, the median of `distance × 10 ÷ source` over runs that carry both. Every
 * load-balance threshold downstream (and there are dozens) was tuned on that scale, so
 * this keeps them meaningful while adding the intensity that distance alone cannot see:
 * a hard 10 km now costs more than an easy one. A run missing the source falls back to
 * distance, which is now the same unit rather than a different one.
 */

export type LoadSource = "relative_effort" | "training_load" | "distance";

export interface LoadModel {
  source: LoadSource;
  /** Multiplier taking the source onto the distance-proxy scale; 1 for distance. */
  scale: number;
  /** Share of recent runs that carry the chosen source (1 for distance). */
  coverage: number;
  loadOf(run: RunActivity): number;
}

/** Share of recent runs that must carry a source before it is used. */
export const COVERAGE_MIN = 0.8;
/** "Recent" for coverage: twelve weeks, matching the volume-currency baseline. */
const COVERAGE_WINDOW_DAYS = 84;

export const distanceLoad = (run: RunActivity): number => (run.distanceM / 1000) * 10;

const CANDIDATES: {
  source: Exclude<LoadSource, "distance">;
  value: (r: RunActivity) => number | null;
}[] = [
  { source: "relative_effort", value: (r) => r.relativeEffort },
  { source: "training_load", value: (r) => r.trainingLoad },
];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const DISTANCE_MODEL: LoadModel = {
  source: "distance",
  scale: 1,
  coverage: 1,
  loadOf: distanceLoad,
};

export function resolveLoadModel(runs: RunActivity[], now: Date = new Date()): LoadModel {
  const windowed = runs.filter(
    (r) => differenceInCalendarDays(now, parseISO(r.date)) < COVERAGE_WINDOW_DAYS,
  );
  // An athlete with nothing recent is judged on what they have.
  const recent = windowed.length > 0 ? windowed : runs;
  if (recent.length === 0) return DISTANCE_MODEL;

  for (const { source, value } of CANDIDATES) {
    const has = (r: RunActivity) => (value(r) ?? 0) > 0;
    const coverage = recent.filter(has).length / recent.length;
    if (coverage < COVERAGE_MIN) continue;
    const ratios = runs
      .filter((r) => has(r) && r.distanceM > 0)
      .map((r) => distanceLoad(r) / (value(r) as number));
    if (ratios.length === 0) continue;
    const scale = median(ratios);
    return {
      source,
      scale,
      coverage,
      loadOf: (r) => (has(r) ? (value(r) as number) * scale : distanceLoad(r)),
    };
  }
  return DISTANCE_MODEL;
}

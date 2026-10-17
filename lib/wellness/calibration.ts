import type { LegFeel } from "./types";

/**
 * Per-athlete calibration of the leg-feel nudge (P3).
 *
 * v1 heuristic — deliberately conservative:
 *  - Below a history threshold, everyone gets the proven default (−12 / +5).
 *  - Once there's enough history, an athlete whose reports reliably track the
 *    objective load model (when it has a clear view) earns MORE trust — the
 *    nudge is amplified within a hard cap.
 *  - It is **amplify-only**: it never dampens below the default, so a reporter
 *    who diverges from the model (the case the feature exists for) keeps full
 *    weight. Safety-first.
 *
 * "Agreement with the load model" is a proxy for thoughtful reporting, not a
 * requirement — a future version can replace this with true feel↔outcome
 * calibration once enough outcome data has accrued.
 */

export interface FeelCalibration {
  /** Applied to freshness on a "heavy" report (negative). */
  heavyDelta: number;
  /** Applied to freshness on a "fresh" report (positive). */
  freshDelta: number;
  /** Directional check-ins that could be matched to a load window. */
  sampleCount: number;
  /** 0..1 — fraction of reports whose direction matched the load model. */
  reliability: number;
  confidence: "low" | "medium" | "high";
  /** Human-readable explanation for the evidence line / UI. */
  basis: string;
}

export interface FeelHistoryPoint {
  /** yyyy-MM-dd */
  date: string;
  legs: LegFeel;
}

/** Minimal weekly-load shape (matches acuteChronicLoad history points). */
export interface WeeklyLoadLite {
  weekStart: string; // yyyy-MM-dd, first day of a seven-day window
  ctl: number;
  atl: number;
}

const BASE_HEAVY = -12;
const BASE_FRESH = 5;
const HEAVY_CAP = -17;
const FRESH_CAP = 8;
const MAX_BONUS = 0.4;
const MIN_SAMPLES = 4; // directional check-ins needed before deviating from default
const MIN_WEEKS = 3; // load-history weeks needed for a stable TSB distribution

export const DEFAULT_FEEL_CALIBRATION: FeelCalibration = {
  heavyDelta: BASE_HEAVY,
  freshDelta: BASE_FRESH,
  sampleCount: 0,
  reliability: 0.5,
  confidence: "low",
  basis: "Default nudge: not enough history to personalise.",
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** TSB of the load week covering `date` (latest week whose start is on/before it). */
function tsbForDate(date: string, weeksSortedDesc: WeeklyLoadLite[]): number | null {
  for (const w of weeksSortedDesc) {
    if (w.weekStart <= date) return w.ctl - w.atl;
  }
  return null;
}

export function computeFeelCalibration(
  reports: FeelHistoryPoint[],
  weeks: WeeklyLoadLite[],
): FeelCalibration {
  if (weeks.length < MIN_WEEKS) return DEFAULT_FEEL_CALIBRATION;

  const med = median(weeks.map((w) => w.ctl - w.atl));
  const weeksSortedDesc = [...weeks].sort((a, b) => b.weekStart.localeCompare(a.weekStart));

  const directional = reports.filter((r) => r.legs === "heavy" || r.legs === "fresh");
  let aligned = 0;
  let counted = 0;
  for (const r of directional) {
    const tsb = tsbForDate(r.date, weeksSortedDesc);
    if (tsb == null) continue;
    counted++;
    const belowMedian = tsb <= med;
    const feltHeavy = r.legs === "heavy";
    // Heavy legs "agree" with a low-balance week; fresh legs with a high-balance week.
    if ((feltHeavy && belowMedian) || (!feltHeavy && !belowMedian)) aligned++;
  }

  if (counted < MIN_SAMPLES) {
    return { ...DEFAULT_FEEL_CALIBRATION, sampleCount: counted };
  }

  const reliability = aligned / counted;
  // Amplify-only: reliability at/below chance (0.5) yields no bonus (default weight).
  const bonus = Math.max(0, Math.min(MAX_BONUS, (reliability - 0.5) * 0.8));
  const scale = 1 + bonus;
  const heavyDelta = Math.round(Math.max(HEAVY_CAP, BASE_HEAVY * scale));
  const freshDelta = Math.round(Math.min(FRESH_CAP, BASE_FRESH * scale));
  const confidence = counted >= 10 ? "high" : "medium";
  const basis =
    bonus > 0
      ? `Personalised: your reports tracked training load ${Math.round(
          reliability * 100,
        )}% of the time across ${counted} check-ins, so they carry a little more weight.`
      : `Default weight: ${counted} check-ins so far, not enough agreement with the load model to trust reports more.`;

  return { heavyDelta, freshDelta, sampleCount: counted, reliability, confidence, basis };
}

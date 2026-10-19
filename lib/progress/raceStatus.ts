import type { RaceForecastV2 } from "@/lib/forecasting-v2/forecastTypes";

/**
 * Ahead / On track / At risk / Not enough evidence (SPEC §8.3, overhaul decision D7).
 *
 * Deterministic: it compares the goal time with the forecast's likely range and
 * confidence. Nothing here is written by the LLM, and nothing the LLM says can change it
 * (ACCEPTANCE-TESTS PROGRESS-04). Built in Phase 2 for Today's race outlook; Progress
 * (Phase 4) reuses it.
 *
 * Lower times are better, so the goal is compared against the edges of the likely
 * (inner) range:
 *   goal slower than the slow edge  → Ahead     (the athlete is likely to beat it)
 *   goal inside the range           → On track
 *   goal faster than the fast edge  → At risk   (it needs more than current evidence shows)
 * and a missing forecast, or one with low confidence, is Not enough evidence.
 */

export type RaceStatus = "ahead" | "on_track" | "at_risk" | "not_enough_evidence";

export const RACE_STATUS_LABELS: Record<RaceStatus, string> = {
  ahead: "Ahead",
  on_track: "On track",
  at_risk: "At risk",
  not_enough_evidence: "Not enough evidence",
};

export interface RaceStatusAssessment {
  status: RaceStatus;
  label: string;
  /** Likely range the goal was compared with, sec; null without a usable forecast. */
  likelyRangeSec: [fast: number, slow: number] | null;
}

type ForecastForStatus = Pick<RaceForecastV2, "confidence" | "predictionIntervalSec">;

/**
 * Null when there is no goal time: there is nothing to be ahead of or behind, and the
 * caller asks for a goal time instead of showing a status.
 */
export function assessRaceStatus(opts: {
  targetTimeSec: number | null | undefined;
  forecast: ForecastForStatus | null;
}): RaceStatusAssessment | null {
  const target = opts.targetTimeSec;
  if (target == null || !(target > 0)) return null;

  const f = opts.forecast;
  if (!f || f.confidence === "low") {
    return {
      status: "not_enough_evidence",
      label: RACE_STATUS_LABELS.not_enough_evidence,
      likelyRangeSec: f
        ? [f.predictionIntervalSec.innerLowSec, f.predictionIntervalSec.innerHighSec]
        : null,
    };
  }

  const { innerLowSec: fast, innerHighSec: slow } = f.predictionIntervalSec;
  const status: RaceStatus = target > slow ? "ahead" : target >= fast ? "on_track" : "at_risk";
  return { status, label: RACE_STATUS_LABELS[status], likelyRangeSec: [fast, slow] };
}

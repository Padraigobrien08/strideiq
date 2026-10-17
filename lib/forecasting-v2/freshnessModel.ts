import type { RaceForecastInput } from "./forecastTypes";
import type { FreshnessAssessment } from "./forecastTypes";

export function assessFreshness(input: RaceForecastInput): FreshnessAssessment {
  const ctx = input.athleteContext ?? {};
  const evidence: string[] = [];
  const risks: string[] = [];
  let score = 55;
  let timeAdjustmentSec = 0;

  const freshness = ctx.freshnessScore ?? 50;
  const tsb = ctx.tsb ?? 0;
  // Thresholds read form (TSB as % of CTL). Inputs that carry only raw TSB (older
  // callers, evaluation fixtures) go through the same mapping the snapshot uses.
  const formPct = ctx.formPct ?? 1.25 * tsb - 2.5;
  const hard14 = ctx.hardRunsLast14d ?? 0;

  // Currency comes from the shared readiness model. Without it this model read a
  // layoff's positive balance as taper sharpness: it would speed the forecast up
  // and never charge for lost fitness. See docs/proposals/readiness-model.md.
  const currency = ctx.currency;
  const restDays = ctx.restDaysSinceLastRun;
  const stale =
    currency === "rusty" ||
    currency === "detrained" ||
    currency === "returning" ||
    // Fallback for inputs built before currency existed.
    (currency === undefined && restDays !== undefined && restDays >= 8);

  score = Math.round(Math.max(0, Math.min(100, freshness)));

  if (stale) {
    // Detraining costs race time; it does not buy sharpness. Same order as the
    // model's other adjustments, scaled by how long the athlete has been away.
    const penalty = currency === "returning" ? 160 : currency === "detrained" ? 100 : 45;
    timeAdjustmentSec += penalty;
    const gap = restDays != null ? `${restDays} days without a run` : "an extended gap";
    evidence.push(
      `Freshness ${Math.round(freshness)} reflects ${gap}, not taper sharpness: fitness has been decaying.`,
    );
    risks.push(
      currency === "returning"
        ? "Returning from a long layoff: treat any race target as provisional until volume rebuilds."
        : "Training is not current: expect race pace to sit behind recent-block evidence.",
    );
  } else if (freshness >= 70) {
    evidence.push(`Freshness ${Math.round(freshness)}: supports quality execution.`);
    timeAdjustmentSec -= Math.round(Math.min(45, (freshness - 65) * 0.8));
  } else if (freshness < 45) {
    evidence.push(`Freshness ${Math.round(freshness)}: fatigue may suppress race-day pace.`);
    timeAdjustmentSec += Math.round((45 - freshness) * 1.2);
    risks.push("Elevated fatigue heading into race window.");
  } else {
    evidence.push(`Freshness ${Math.round(freshness)}: neutral race-day modifier.`);
  }

  if (formPct > 8) {
    evidence.push(`TSB +${Math.round(tsb)}: training balance favors recovery.`);
    // Currency answers taper-vs-detraining directly, so only guess from TSB when
    // the caller could not tell us.
    if (formPct > 23 && currency === undefined) {
      risks.push("Very positive TSB after sharp volume drop: confirm taper vs detraining.");
    }
  } else if (formPct < -17) {
    evidence.push(`TSB ${Math.round(tsb)}: acute load may outweigh freshness.`);
    // Two seconds per legacy-TSB point, as before, read through the mapping.
    timeAdjustmentSec += Math.round(Math.min(90, Math.abs((formPct + 2.5) / 1.25) * 2));
    risks.push("Fatigue balance strained: late-race fade risk elevated.");
  }

  if (hard14 >= 5) {
    score -= 8;
    timeAdjustmentSec += 25;
    risks.push(`${hard14} hard sessions in 14 days: intensity stacking elevated.`);
  } else if (hard14 <= 2 && freshness >= 65) {
    evidence.push("Hard-session density is controlled.");
  }

  if (input.goal.raceDate) {
    const days = Math.ceil((new Date(input.goal.raceDate).getTime() - Date.now()) / 86400000);
    if (days > 0 && days <= 14) {
      evidence.push(`${days} days to race: freshness window matters.`);
    }
  }

  let label: FreshnessAssessment["label"] = "neutral";
  if (score >= 68 && timeAdjustmentSec <= 0) label = "fresh";
  else if (score < 42 || timeAdjustmentSec > 40) label = "fatigued";
  // Stale training can never read as fresh here either, which is the same
  // guarantee the shared readiness model makes.
  if (stale) label = "fatigued";

  return {
    score,
    label,
    timeAdjustmentSec,
    evidence,
    risks,
    currency,
  };
}

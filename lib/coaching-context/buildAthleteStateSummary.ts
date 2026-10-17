import type { DashboardInsights } from "@/lib/analytics";
import { RACE_READINESS_CONFIG } from "@/lib/analytics/readiness";
import { buildActiveObservations, deriveCurrentFocus } from "@/lib/coach/activeIntelligence";
import type {
  CoachingCurrentState,
  DurabilityLabel,
  FatigueStateLabel,
  IntensityBalanceLabel,
  SpecificityLabel,
} from "./types";

function mapFatigueState(freshness: number, formPct: number): FatigueStateLabel {
  if (freshness >= 65 && formPct > -9) return "fresh";
  if (freshness < 45 || formPct < -21) return "fatigued";
  if (freshness >= 45 && freshness < 65) return "neutral";
  return "unknown";
}

function mapDurability(insights: DashboardInsights): DurabilityLabel {
  const eco = insights.trainingEcosystem;
  const score = eco?.scores.durabilitySupport;
  if (score == null) {
    const long =
      insights.raceReadiness?.longestRunKm ?? insights.halfMarathonReadiness.longestRunKm ?? 0;
    if (long >= 18) return "strong";
    if (long >= 12) return "moderate";
    if (long > 0) return "weak";
    return "unknown";
  }
  if (score >= 65) return "strong";
  if (score >= 45) return "moderate";
  if (score > 0) return "weak";
  return "unknown";
}

function mapSpecificity(insights: DashboardInsights): SpecificityLabel {
  const rr = insights.raceReadiness;
  if (!rr) return "unknown";
  if (rr.daysUntilRace != null && rr.daysUntilRace <= 21) {
    if (rr.score >= 70) return "high";
    if (rr.score >= 50) return "moderate";
    return "low";
  }
  const long = rr.longestRunKm;
  const dist = rr.distance;
  const raceKm = RACE_READINESS_CONFIG[dist].raceDistanceKm;
  const ratio = raceKm > 0 ? long / raceKm : 0;
  if (ratio >= 0.85) return "high";
  if (ratio >= 0.6) return "moderate";
  return "low";
}

function mapIntensityBalance(insights: DashboardInsights): IntensityBalanceLabel {
  const status = insights.intensityAdvice.status;
  if (status === "too_hard") return "intensity_heavy";
  if (status === "too_easy") return "easy_biased";
  if (status === "balanced") return "balanced";
  return "unknown";
}

export function buildAthleteStateSummary(insights: DashboardInsights): CoachingCurrentState {
  const observations = buildActiveObservations(insights, []);
  const { focus, rationale } = deriveCurrentFocus(insights, observations);
  const freshness = insights.fatigue.freshness;
  const readiness = insights.raceReadiness?.score;

  const fatigueState = mapFatigueState(freshness, insights.fatigue.formPct);
  const durability = mapDurability(insights);
  const specificity = mapSpecificity(insights);
  const intensityBalance = mapIntensityBalance(insights);

  const reportedLegFeel = insights.fatigue.reportedLegFeel;

  const parts: string[] = [];
  parts.push(`Freshness ${Math.round(freshness)} (TSB ${insights.fatigue.tsb.toFixed(0)}).`);
  if (reportedLegFeel) parts.push(`Athlete reports ${reportedLegFeel} legs today.`);
  if (readiness != null) parts.push(`Readiness signal ~${Math.round(readiness)}.`);
  parts.push(`${focus}: ${rationale}`);
  const intRec = insights.intensityAdvice.recommendations[0];
  if (intRec) parts.push(intRec);

  return {
    readiness: readiness != null ? Math.round(readiness) : undefined,
    freshness: Math.round(freshness),
    reportedLegFeel,
    fatigueState,
    durability,
    specificity,
    intensityBalance,
    primaryFocus: focus,
    stateSummary: parts.join(" "),
  };
}

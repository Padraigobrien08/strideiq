import type { DashboardInsights } from "@/lib/analytics";
import type { CoachingConstraints } from "./types";

export function buildConstraints(
  insights: DashboardInsights,
  maxWeeklyKm?: number,
): CoachingConstraints {
  const notes: string[] = [];
  const days = insights.raceReadiness?.daysUntilRace;
  const raceWeek = days != null && days <= 7 && days >= 0;
  const tapering =
    raceWeek ||
    (days != null &&
      days <= 21 &&
      insights.currentWeek.distanceKm <
        (insights.previousWeek?.distanceKm ?? insights.currentWeek.distanceKm));

  if (raceWeek) {
    notes.push("Race week: prioritize freshness over load accumulation.");
  }
  if (tapering && !raceWeek) {
    notes.push("Taper or reduced-volume phase detected in recent weeks.");
  }
  if (insights.intensityAdvice.status === "too_hard") {
    notes.push("Cap hard sessions; easy aerobic volume should lead the week.");
  }
  if (insights.fatigue.formPct < -17) {
    notes.push("Negative TSB: avoid stacking quality days back-to-back.");
  }

  const maxHardSessions =
    insights.intensityAdvice.status === "too_hard"
      ? 1
      : insights.intensityAdvice.hardRunsLast14d >= 4
        ? 2
        : undefined;

  return {
    maxWeeklyVolumeKm: maxWeeklyKm && maxWeeklyKm > 0 ? maxWeeklyKm : undefined,
    maxHardSessions,
    raceWeek,
    tapering,
    avoidIntensityStacking:
      insights.intensityAdvice.status === "too_hard" ||
      insights.trainingEcosystem.scores.interferenceRisk >= 50,
    notes,
  };
}

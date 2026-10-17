import type { RunActivity } from "@/lib/strava/types";
import type { FitRunDetail } from "@/lib/strava/fitTypes";
import type { WorkoutClassification } from "@/lib/analytics/workoutType";
import type { DashboardInsights } from "@/lib/analytics";
import { computeLateFadePct, scoreSessionExecution } from "@/lib/reasoning/executionScore";
import type { ExecutionQuality, SessionIntelligence } from "./types";
import { compareToHistoricalSessions } from "./compareToHistoricalSessions";
import { inferLikelyAdaptation } from "./inferLikelyAdaptation";
import { buildSessionNarrative } from "./buildSessionNarrative";

function mapQuality(score: number): ExecutionQuality {
  if (score >= 78) return "excellent";
  if (score >= 65) return "strong";
  if (score >= 48) return "moderate";
  return "poor";
}

function fatigueCostFromContext(
  analytics: DashboardInsights | null,
  workout: WorkoutClassification,
  lateFade: number | null,
): SessionIntelligence["fatigueCost"] {
  if (workout.type === "easy" || workout.type === "recovery") return "low";
  if (analytics && analytics.fatigue.formPct < -21) return "high";
  if (lateFade != null && lateFade > 10) return "high";
  if (workout.type === "interval" || workout.type === "race") return "moderate";
  return "low";
}

function goalAlignment(
  workout: WorkoutClassification,
  analytics: DashboardInsights | null,
): SessionIntelligence["goalAlignment"] {
  if (!analytics?.raceReadiness) {
    return workout.type === "easy" ? "moderate" : "weak";
  }
  const days = analytics.raceReadiness.daysUntilRace;
  if (days <= 10) {
    if (workout.type === "easy" || workout.type === "recovery") return "strong";
    if (workout.type === "race") return "strong";
    return "weak";
  }
  if (days <= 42) {
    if (["tempo", "interval", "long"].includes(workout.type)) return "strong";
    return "moderate";
  }
  return workout.type === "easy" ? "moderate" : "strong";
}

export function evaluateSessionExecution(
  run: RunActivity,
  fit: FitRunDetail | null,
  workout: WorkoutClassification,
  opts?: {
    analytics?: DashboardInsights | null;
    historicalRuns?: RunActivity[];
  },
): SessionIntelligence {
  const scored = scoreSessionExecution(run, fit, workout);
  const lateFade = computeLateFadePct(fit);
  const executionQuality = mapQuality(scored.qualityScore);
  const peers = (opts?.historicalRuns ?? []).filter((r) => r.date < run.date);
  const historicalComparison = compareToHistoricalSessions(run, workout, peers);
  const likelyAdaptations = inferLikelyAdaptation(workout, executionQuality, lateFade);

  const evidence: string[] = [
    `Workout classified as ${workout.type}`,
    `Execution score ${scored.qualityScore}/100`,
  ];
  if (lateFade != null) evidence.push(`Late-session fade ~${lateFade.toFixed(1)}%`);
  if (scored.hrDriftPct != null) {
    evidence.push(`HR drift ~${scored.hrDriftPct}%`);
  }
  if (historicalComparison) evidence.push(historicalComparison);

  let hrAssessment: string | undefined;
  if (scored.hrDriftPct != null && scored.hrDriftPct > 8) {
    hrAssessment = "HR drift appears elevated: may indicate heat, fatigue, or pacing early";
  } else if (run.avgHr != null) {
    hrAssessment = `Average HR ${run.avgHr} bpm for session type`;
  }

  const confidence: SessionIntelligence["confidence"] =
    fit?.paceStream && fit.paceStream.length >= 20 ? "medium" : run.avgHr != null ? "low" : "low";

  const session: SessionIntelligence = {
    sessionId: run.id,
    executionQuality,
    likelyAdaptations,
    fatigueCost: fatigueCostFromContext(opts?.analytics ?? null, workout, lateFade),
    pacingAssessment: scored.fatigueInterpretation,
    hrAssessment,
    historicalComparison,
    goalAlignment: goalAlignment(workout, opts?.analytics ?? null),
    recommendationImpact: undefined,
    evidence,
    confidence: fit?.paceStream ? (confidence === "low" ? "medium" : confidence) : "low",
    narrative: "",
  };

  session.narrative = buildSessionNarrative(session, run.name);
  return session;
}

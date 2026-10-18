import type { DashboardInsights } from "@/lib/analytics";
import type { Insight } from "@/lib/insights/types";
import type { ImportQualityReport } from "@/lib/quality/assessImport";
import { buildGoalsPageView } from "@/lib/goals/viewModels";
import { buildTrainingPageView } from "@/lib/training/viewModels";
import type { RaceGoal } from "@/lib/analytics/readiness";
import { formatDuration, formatKmRange } from "@/lib/utils";
import type { IntelligenceBrief } from "./types";
import { trainingLoadBalancePayload } from "./loadBalancePayload";
import { todayLoadImpact } from "@/lib/training/loadBalanceImpact";

export function buildIntelligenceBrief(
  analytics: DashboardInsights,
  insights: Insight[],
  quality: ImportQualityReport,
  raceGoal: RaceGoal | null,
): IntelligenceBrief {
  const training = buildTrainingPageView(analytics, insights);
  const goals = buildGoalsPageView(analytics, raceGoal, insights);
  const readiness = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  const plan = analytics.nextWeekPlan;

  const fitPct =
    quality.runCount > 0 ? Math.round((quality.fitParsed / quality.runCount) * 100) : 0;

  const lo = Math.round(plan.totalKmRange[0] * 10) / 10;
  const hi = Math.round(plan.totalKmRange[1] * 10) / 10;

  const predictions = analytics.racePredictionAnalysis.consensus.map((c) => ({
    label: c.label,
    time: formatDuration(c.timeSec),
    spread: c.spreadSec > 45 ? `±${formatDuration(Math.round(c.spreadSec / 2))}` : "narrow",
  }));

  const limitations = [
    "Not medical advice: adjust by feel and consult a professional if injured.",
    ...quality.warnings.slice(0, 2),
    ...(quality.overallConfidence === "low"
      ? ["Small or incomplete dataset: treat trends as indicative."]
      : []),
  ];

  return {
    briefVersion: 1,
    dataAsOf: new Date().toISOString(),
    confidence: analytics.dataConfidence,
    athleteState: training.hero.classification,
    recommendation: training.hero.recommendation,
    race: {
      hasGoal: !!raceGoal,
      distanceLabel: analytics.raceReadiness?.distanceLabel ?? null,
      daysUntilRace: analytics.raceReadiness?.daysUntilRace ?? null,
      readinessScore: readiness.score,
      readinessLabel: readiness.label,
      projectedFinish: goals.hero.projectedFinish,
      largestRisk: goals.risks[0]?.title ?? goals.hero.biggestLimiter,
    },
    fatigue: {
      freshness: analytics.fatigue.loadEvidence.sufficient ? analytics.fatigue.freshness : null,
      label: analytics.fatigue.label,
      tsb: analytics.fatigue.loadEvidence.sufficient ? analytics.fatigue.tsb : null,
      trainingLoadBalance: trainingLoadBalancePayload(
        analytics.fatigue,
        todayLoadImpact(analytics),
      ),
    },
    weekPlan: {
      weekLabel: plan.weekLabel,
      template: plan.template,
      totalKm: formatKmRange(lo, hi),
      sessions: plan.sessions.map((s) => ({
        day: s.day ?? "—",
        type: s.type,
        description: s.description,
      })),
    },
    predictions: predictions.slice(0, 4),
    topInsights: insights.slice(0, 5).map((i) => ({
      title: i.title,
      evidence: i.evidence.slice(0, 3),
      confidence: i.confidence,
    })),
    dataQuality: {
      runCount: quality.runCount,
      fitParsed: quality.fitParsed,
      fitPct,
      warnings: quality.warnings,
    },
    limitations: [...new Set(limitations)].slice(0, 5),
  };
}

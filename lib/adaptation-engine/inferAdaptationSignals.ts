import type { DashboardInsights } from "@/lib/analytics";
import type { TrackedRecommendationOutcome } from "@/lib/recommendation-learning";
import type { AdaptationSignal } from "./types";

const ISO = () => new Date().toISOString();

function signal(
  partial: Omit<AdaptationSignal, "id" | "stability" | "contradictoryEvidence"> & {
    id?: string;
    stability?: AdaptationSignal["stability"];
    contradictoryEvidence?: string[];
  },
): AdaptationSignal {
  const evidenceCount = partial.supportingEvidence.length;
  let confidence = partial.confidence;
  if (evidenceCount < 2 && confidence === "high") confidence = "medium";
  if (evidenceCount < 1) confidence = "low";

  return {
    id: partial.id ?? `adapt-${partial.category}-${evidenceCount}`,
    category: partial.category,
    statement: partial.statement,
    confidence,
    supportingEvidence: partial.supportingEvidence,
    contradictoryEvidence: partial.contradictoryEvidence ?? [],
    stability:
      partial.stability ??
      (evidenceCount >= 3 && !(partial.contradictoryEvidence?.length ?? 0) ? "stable" : "emerging"),
  };
}

export function inferAdaptationSignals(
  analytics: DashboardInsights,
  outcomes: TrackedRecommendationOutcome[] = [],
): AdaptationSignal[] {
  const out: AdaptationSignal[] = [];

  if (analytics.efficiencySummary.trend === "improving") {
    out.push(
      signal({
        category: "threshold",
        statement:
          "Aerobic efficiency appears to improve under stable volume and consistent easy running",
        confidence: analytics.efficiencyMoM.comparableCount >= 6 ? "medium" : "low",
        supportingEvidence: [
          "Efficiency trend improving",
          ...(analytics.efficiencyMoM.narrative ? [analytics.efficiencyMoM.narrative] : []),
        ],
        contradictoryEvidence:
          analytics.fatigue.formPct < -17 ? ["TSB negative: load may mask adaptation"] : [],
      }),
    );
  }

  if (analytics.intensityAdvice.status === "too_hard" || analytics.fatigue.formPct < -15) {
    out.push(
      signal({
        category: "freshness",
        statement: "Freshness appears sensitive to hard-session density in recent blocks",
        confidence: analytics.intensityAdvice.hardRunsLast14d >= 4 ? "medium" : "low",
        supportingEvidence: [
          `${analytics.intensityAdvice.hardRunsLast14d} hard runs / 14d`,
          `Freshness ${Math.round(analytics.fatigue.freshness)}`,
          analytics.intensityAdvice.recommendations[0] ?? "Intensity elevated",
        ],
      }),
    );
  }

  if (analytics.consistencyScore.overall >= 65) {
    out.push(
      signal({
        category: "durability",
        statement: "Long-run consistency appears to support race readiness",
        confidence: analytics.consistencyScore.overall >= 75 ? "medium" : "low",
        supportingEvidence: [
          `Consistency ${analytics.consistencyScore.overall}/100`,
          analytics.consistencyScore.label,
        ],
      }),
    );
  }

  const eco = analytics.trainingEcosystem;
  if (eco.scores.interferenceRisk >= 50) {
    out.push(
      signal({
        category: "modality",
        statement: "Modality interference likely when hard cross-training clusters near key runs",
        confidence: eco.scores.interferenceRisk >= 60 ? "medium" : "low",
        supportingEvidence: eco.ecosystemInsights
          .slice(0, 3)
          .map((i) => (i.evidence[0] ? `${i.title}: ${i.evidence[0]}` : i.title)),
        contradictoryEvidence:
          eco.scores.strengthSupport >= 60 ? ["Strength support score still adequate"] : [],
      }),
    );
  }

  const r = analytics.raceReadiness;
  if (r && r.daysUntilRace <= 14 && analytics.fatigue.freshness >= 55) {
    out.push(
      signal({
        category: "recovery",
        statement: "Recent taper pattern appears to preserve freshness before race",
        confidence: r.daysUntilRace <= 7 ? "medium" : "low",
        supportingEvidence: [
          `${r.daysUntilRace}d to race`,
          `Freshness ${Math.round(analytics.fatigue.freshness)}`,
        ],
      }),
    );
  }

  for (const o of outcomes) {
    if (o.evaluation !== "supported" && o.evaluation !== "partially_supported") {
      continue;
    }
    out.push(
      signal({
        id: `outcome-${o.recommendationId}`,
        category: "volume",
        statement: `Past recommendation appears supported: ${o.recommendation.slice(0, 80)}`,
        confidence: o.evaluation === "supported" ? "medium" : "low",
        supportingEvidence: o.observedSignals.slice(0, 4),
        stability: "emerging",
      }),
    );
  }

  void ISO;
  return dedupeSignals(out).slice(0, 12);
}

function dedupeSignals(signals: AdaptationSignal[]): AdaptationSignal[] {
  const seen = new Set<string>();
  return signals.filter((s) => {
    const key = s.statement.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

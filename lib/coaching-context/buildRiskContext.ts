import type { DashboardInsights } from "@/lib/analytics";
import { buildRisksAndOpportunities } from "@/lib/coach/activeIntelligence";
import type { ActiveObservation } from "@/lib/coach/types";
import type { CoachingOpportunityItem, CoachingRiskItem, ConfidenceLevel } from "./types";

const MAX_RISKS = 5;
const MAX_OPPORTUNITIES = 4;

function severityFromText(text: string): "low" | "medium" | "high" {
  const t = text.toLowerCase();
  if (
    t.includes("outpacing") ||
    t.includes("stacking") ||
    t.includes("race week") ||
    t.includes("overload")
  ) {
    return "high";
  }
  if (t.includes("elevated") || t.includes("clustered")) return "medium";
  return "low";
}

function confidenceFromInsights(insights: DashboardInsights): ConfidenceLevel {
  const c = insights.trainingEcosystem?.confidence;
  if (c === "high") return "high";
  if (c === "low") return "low";
  return "medium";
}

export function buildRiskContext(
  insights: DashboardInsights,
  observations: ActiveObservation[] = [],
): { risks: CoachingRiskItem[]; opportunities: CoachingOpportunityItem[] } {
  const baseConf = confidenceFromInsights(insights);
  const ro = buildRisksAndOpportunities(insights, observations);

  const risks: CoachingRiskItem[] = ro
    .filter((r) => r.kind === "risk")
    .map((r) => ({
      label: r.text,
      severity: severityFromText(r.text),
      evidence: [r.domain ? `Domain: ${r.domain}` : "Derived from training analytics"],
      confidence: baseConf,
    }));

  if (insights.fatigue.formPct < -25) {
    risks.push({
      label: "Deep negative training stress balance",
      severity: "high",
      evidence: [
        `TSB ${insights.fatigue.tsb.toFixed(0)}`,
        `CTL ${insights.fatigue.ctl.toFixed(0)}`,
      ],
      confidence: "medium",
    });
  }

  const eco = insights.trainingEcosystem;
  if (eco && eco.scores.interferenceRisk >= 55) {
    const flags = eco.interferenceFlags?.slice(0, 2) ?? [];
    risks.push({
      label: "Cross-training interference near key runs",
      severity: eco.scores.interferenceRisk >= 70 ? "high" : "medium",
      evidence:
        flags.length > 0
          ? flags.flatMap((f) => f.evidence).slice(0, 3)
          : [`Interference risk score ${eco.scores.interferenceRisk}`],
      confidence: eco.confidence ?? "medium",
    });
  }

  const opportunities: CoachingOpportunityItem[] = ro
    .filter((r) => r.kind === "opportunity")
    .map((r) => ({
      label: r.text,
      evidence: [r.domain ? `Domain: ${r.domain}` : "Derived from positive signals"],
      confidence: baseConf,
    }));

  const seen = new Set<string>();
  const dedupeRisks = risks.filter((r) => {
    if (seen.has(r.label)) return false;
    seen.add(r.label);
    return true;
  });

  return {
    risks: dedupeRisks.slice(0, MAX_RISKS),
    opportunities: opportunities.slice(0, MAX_OPPORTUNITIES),
  };
}

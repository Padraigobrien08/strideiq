import type { DashboardInsights } from "@/lib/analytics";
import { createBelief } from "./beliefUtils";
import { isTrainingCurrent } from "@/lib/insights/consistency";
import type { AthleteBelief } from "./types";

export function inferFatiguePatterns(analytics: DashboardInsights): AthleteBelief[] {
  const out: AthleteBelief[] = [];
  const { fatigue, intensityAdvice } = analytics;

  if (intensityAdvice.status === "too_hard" || intensityAdvice.hardRunsLast14d >= 3) {
    out.push(
      createBelief({
        id: "fatigue-hard-density",
        category: "fatigue",
        statement: "Freshness appears sensitive to hard-session density in a short window.",
        evidence: [
          `${intensityAdvice.hardRunsLast14d} hard runs in 14 days`,
          intensityAdvice.recommendations[0] ?? "Intensity stacking signal",
          `TSB ${Math.round(fatigue.tsb)}`,
        ].filter(Boolean),
        confidence:
          intensityAdvice.hardRunsLast14d >= 4 && fatigue.formPct < -15 ? "medium" : "low",
        recommendedUse: "Space quality sessions and cap hard days when planning the next week.",
      }),
    );
  }

  if (fatigue.formPct < -17) {
    out.push(
      createBelief({
        id: "fatigue-negative-tsb",
        category: "fatigue",
        statement:
          "Acute load is outpacing recovery: freshness tends to compress until volume or intensity eases.",
        evidence: [
          `TSB ${Math.round(fatigue.tsb)}`,
          `Freshness ${Math.round(fatigue.freshness)} (${fatigue.label})`,
        ],
        confidence: fatigue.formPct < -25 ? "medium" : "low",
        counterEvidence: fatigue.freshness >= 60 ? ["Freshness still moderate despite TSB"] : [],
        recommendedUse: "Bias plans toward recovery or maintenance until TSB improves.",
      }),
    );
  }

  // Only a fresh window if the freshness came from recovering between sessions.
  // After a layoff the same number is just rest, and reading it as "quality is
  // absorbable" points the athlete at exactly the wrong first week back.
  if (fatigue.freshness >= 65 && fatigue.formPct > -9 && isTrainingCurrent(fatigue)) {
    out.push(
      createBelief({
        id: "fatigue-fresh-window",
        category: "fatigue",
        statement:
          "When freshness is high, quality sessions tend to be absorbable without immediate regression.",
        evidence: [`Freshness ${Math.round(fatigue.freshness)}`, `TSB ${Math.round(fatigue.tsb)}`],
        confidence: "low",
        recommendedUse: "Use fresh windows for one focused quality session, not stacked intensity.",
      }),
    );
  }

  return out;
}

import type { DashboardInsights } from "@/lib/analytics";
import type { AdaptationSignal } from "./types";
import { isTrainingCurrent, stalenessClause } from "@/lib/insights/consistency";

export function inferFatigueResponses(analytics: DashboardInsights): AdaptationSignal[] {
  const out: AdaptationSignal[] = [];
  const trainingCurrent = isTrainingCurrent(analytics.fatigue);

  if (analytics.fatigue.formPct < -21) {
    out.push({
      id: "fatigue-deep-negative-tsb",
      category: "freshness",
      statement: "Deep negative TSB suggests accumulated fatigue may suppress quality",
      confidence: "medium",
      supportingEvidence: [`TSB ${Math.round(analytics.fatigue.tsb)}`, analytics.fatigue.label],
      contradictoryEvidence: [],
      stability: "emerging",
    });
  }

  if (analytics.fatigue.freshness >= 65 && analytics.fatigue.tsb > 0) {
    out.push({
      id: "fatigue-positive-balance",
      category: "freshness",
      // A positive balance means recovered-between-sessions only while sessions
      // are happening. During a layoff the same numbers mean detrained.
      statement: trainingCurrent
        ? "Load balance appears to support freshness for quality sessions"
        : `Load balance reads positive only because training stopped: ${stalenessClause(analytics.fatigue)}`,
      confidence: "low",
      supportingEvidence: [
        `Freshness ${Math.round(analytics.fatigue.freshness)}`,
        `TSB +${Math.round(analytics.fatigue.tsb)}`,
      ],
      contradictoryEvidence: [],
      stability: "emerging",
    });
  }

  return out;
}

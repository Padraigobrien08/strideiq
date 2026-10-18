import type { FatigueSnapshot, LoadEvidence, ReadinessCurrency } from "@/lib/analytics/fatigue";
import type { LoadSource } from "@/lib/analytics/loadModel";
import type { TodayLoadImpact } from "@/lib/training/loadBalanceImpact";

/**
 * The training load balance as Coach and MCP see it — the same reading the app's
 * decisions use, so the LLM cannot describe a state the app does not.
 *
 * Decisions read form (TSB as a share of chronic load), not raw TSB or the 0–100
 * freshness score, and ignore the balance entirely without enough history. Raw TSB
 * stays in tool payloads for continuity, but this object is the one to quote.
 */
export interface TrainingLoadBalancePayload {
  status: "not_enough_evidence" | "fatigued" | "balanced" | "fresh";
  /** TSB as % of chronic load; null when there is not enough evidence. */
  formPct: number | null;
  /** Whether the reading is still about the athlete (rusty/detrained cap it). */
  currency: ReadinessCurrency;
  confidence: LoadEvidence["confidence"];
  source: LoadSource;
  historyDays: number;
  /** Why the reading is limited, when it is. */
  limitations: string[];
  /** Whether the balance changed today's recommended session, when known. */
  todayImpact?: Pick<TodayLoadImpact, "affects" | "actual" | "withoutLoad" | "direction">;
  /** One plain sentence, safe to quote. */
  reading: string;
}

const STATUS: Record<
  FatigueSnapshot["readiness"]["balance"],
  TrainingLoadBalancePayload["status"]
> = { fatigued: "fatigued", neutral: "balanced", fresh: "fresh" };

export function trainingLoadBalancePayload(
  fatigue: FatigueSnapshot,
  impact?: TodayLoadImpact,
): TrainingLoadBalancePayload {
  const e = fatigue.loadEvidence;
  const todayImpact = impact
    ? {
        affects: impact.affects,
        actual: impact.actual,
        withoutLoad: impact.withoutLoad,
        direction: impact.direction,
      }
    : undefined;

  if (!e.sufficient) {
    return {
      status: "not_enough_evidence",
      formPct: null,
      currency: fatigue.readiness.currency,
      confidence: e.confidence,
      source: fatigue.loadSource,
      historyDays: e.historyDays,
      limitations: e.reasons,
      todayImpact,
      reading: `Not enough training history to judge load balance yet (${e.historyDays} days, ${e.runCount} runs); it is not used in today's recommendation.`,
    };
  }

  const status = STATUS[fatigue.readiness.balance];
  const form = `${fatigue.formPct > 0 ? "+" : ""}${Math.round(fatigue.formPct)}%`;
  const impactClause =
    impact?.affects === true
      ? impact.direction === "held_back"
        ? ` It held today back to ${impact.actual} (otherwise ${impact.withoutLoad}).`
        : ` It made today's ${impact.actual} possible (otherwise ${impact.withoutLoad}).`
      : impact
        ? " It did not change today's recommendation."
        : "";
  return {
    status,
    formPct: fatigue.formPct,
    currency: fatigue.readiness.currency,
    confidence: e.confidence,
    source: fatigue.loadSource,
    historyDays: e.historyDays,
    limitations: e.reasons,
    todayImpact,
    reading: `Training load balance is ${status} (form ${form} of chronic load, ${e.confidence} confidence).${impactClause}`,
  };
}

import type { DashboardInsights } from "@/lib/analytics";
import type { RaceGoal } from "@/lib/analytics/readiness";
import type { Insight } from "@/lib/insights/types";
import { buildCoachWorkspaceState } from "@/lib/coach/activeIntelligence";
import {
  buildDefaultInvestigation,
  DEFAULT_INVESTIGATION_QUESTION,
} from "@/lib/coach/defaultInvestigation";
import type {
  ActiveObservation,
  CoachWorkspaceState,
  CoachingDomain,
  RiskOpportunity,
} from "@/lib/coach/types";
import type { MemorySnippet } from "@/lib/coach/memorySnippets";
import { isTrainingCurrent, stalenessClause } from "@/lib/insights/consistency";
import { buildTrainingEcosystemView } from "@/lib/training/ecosystemViewModel";
import type { TrainingEcosystemView } from "@/lib/training/ecosystemViewModel";

export interface IntelligenceSignal {
  id: string;
  type: string;
  severity: "positive" | "neutral" | "warning" | "opportunity";
  text: string;
  headline: string;
  evidence: string;
  confidence: "low" | "medium" | "high";
}

export interface TrajectorySeries {
  id: string;
  label: string;
  values: { label: string; value: number }[];
  trend: "up" | "down" | "flat";
  interpretation: string;
}

function signalHeadline(text: string): string {
  // Clause break: observation copy leads with a headline, then explains after a
  // colon/semicolon/period. (Em dash kept so LLM-authored text still splits.)
  const first = text.split(/[.:;—]/)[0]?.trim();
  return first && first.length < 72 ? first : text.slice(0, 68).trim() + "…";
}

function signalEvidence(o: ActiveObservation, analytics: DashboardInsights): string {
  switch (o.id) {
    case "eff-trend":
      return "Recent HR-backed runs";
    case "eff-down":
      return "Efficiency trend (28d)";
    case "intensity":
      return `${analytics.intensityAdvice.hardRunsLast14d} hard sessions / 14d`;
    case "fresh":
      return `Freshness ${Math.round(analytics.fatigue.freshness)}`;
    case "fatigue":
      return `TSB ${Math.round(analytics.fatigue.tsb)}`;
    case "readiness":
      return `${analytics.raceReadiness?.score ?? analytics.halfMarathonReadiness.score}/100 readiness`;
    default:
      return o.domain;
  }
}

/** Full athlete intelligence model for Intelligence + Coach surfaces */
export function getAthleteIntelligenceState(
  analytics: DashboardInsights | null,
  insights: Insight[],
  raceGoal: RaceGoal | null,
  threadMessages: import("@/lib/coach/types").CoachMessage[] = [],
): CoachWorkspaceState | null {
  if (!analytics) return null;
  return buildCoachWorkspaceState(analytics, insights, raceGoal, threadMessages);
}

export function getActiveSignals(
  state: CoachWorkspaceState,
  analytics: DashboardInsights,
): IntelligenceSignal[] {
  return state.observations.slice(0, 6).map((o) => ({
    id: o.id,
    type: o.domain,
    severity: o.tone,
    text: o.text,
    headline: signalHeadline(o.text),
    evidence: signalEvidence(o, analytics),
    confidence: o.confidence,
  }));
}

export function getLongitudinalMemory(state: CoachWorkspaceState): MemorySnippet[] {
  return state.memory;
}

export function getRisksAndOpportunities(state: CoachWorkspaceState): RiskOpportunity[] {
  return state.risksAndOpportunities;
}

export function getTrainingEcosystem(analytics: DashboardInsights): TrainingEcosystemView {
  return buildTrainingEcosystemView(analytics);
}

export function getCoachDefaultInvestigation(
  analytics: DashboardInsights,
  raceGoal: RaceGoal | null,
) {
  return buildDefaultInvestigation(analytics, raceGoal);
}

export { DEFAULT_INVESTIGATION_QUESTION };

export function getCoachDomainContext(
  state: CoachWorkspaceState,
  domainId: string | null,
): CoachingDomain | null {
  if (!domainId) return state.domains[0] ?? null;
  return state.domains.find((d) => d.id === domainId) ?? null;
}

export function getPrimaryRecommendation(
  state: CoachWorkspaceState,
  analytics: DashboardInsights,
): string {
  // A comeback outranks everything below it. The other branches all answer
  // "how should this week's training be shaped", which is the wrong question
  // for someone whose training has stopped: the answer is to start again, and
  // the returning plan already works out what that looks like from their own
  // pre-gap baseline. Without this the hero recommended protecting an aerobic
  // trend measured a fortnight before the athlete last ran.
  const returning = analytics.returning;
  if (returning) {
    const context = returning.baseline
      ? ` You're rebuilding from ${stalenessClause(analytics.fatigue)}: at this rate you reach ${returning.target?.weeklyKm ?? returning.baseline.weeklyKm} km/wk in about ${returning.weeksToTarget} weeks.`
      : ` You're rebuilding from ${stalenessClause(analytics.fatigue)}: judge next week from how these feel.`;
    return returning.firstStep + context;
  }
  if (analytics.fatigue.formPct < -17) {
    return "Prioritize recovery: cap hard sessions and protect easy aerobic rhythm until freshness rebounds.";
  }
  if (analytics.raceReadiness && analytics.raceReadiness.daysUntilRace <= 14) {
    return "Preserve freshness. Cap hard sessions at one per week and use easy aerobic work to maintain rhythm before race day.";
  }
  if (analytics.intensityAdvice.status === "too_hard") {
    return "Reduce intensity stacking: redistribute hard days and add easy volume between quality sessions.";
  }
  if (analytics.efficiencySummary.trend === "improving") {
    return "Protect the aerobic adaptation trend with polarized easy days between quality work.";
  }
  return (
    state.focusRationale ||
    "Maintain consistent aerobic rhythm and align hard sessions with freshness windows."
  );
}

export function getTrajectorySeries(analytics: DashboardInsights): TrajectorySeries[] {
  // Every interpretation below reads a trend as a training decision ("taper
  // effect", "quality window", "check fatigue"). After a layoff the trends are
  // real but the readings are not: volume is down because nothing was run, not
  // because anything was tapered.
  const current = isTrainingCurrent(analytics.fatigue);
  const gap = stalenessClause(analytics.fatigue);
  const weeks = analytics.weeklyVolume.slice(-8);
  const volTrend =
    weeks.length >= 2 && weeks[weeks.length - 1]!.distanceKm > weeks[weeks.length - 2]!.distanceKm
      ? "up"
      : weeks.length >= 2 &&
          weeks[weeks.length - 1]!.distanceKm < weeks[weeks.length - 2]!.distanceKm
        ? "down"
        : "flat";

  const vol: TrajectorySeries = {
    id: "volume",
    label: "Weekly volume",
    values: weeks.map((w) => ({ label: w.label, value: w.distanceKm })),
    trend: volTrend,
    interpretation: !current
      ? `Paused · ${gap}`
      : volTrend === "down"
        ? "Down this week · taper effect"
        : volTrend === "up"
          ? "Building · load rising"
          : "Steady week to week",
  };

  const eff = analytics.efficiencyTrend.slice(-8);
  const effTrend =
    analytics.efficiencySummary.trend === "improving"
      ? "up"
      : analytics.efficiencySummary.trend === "declining"
        ? "down"
        : "flat";

  const efficiency: TrajectorySeries = {
    id: "efficiency",
    label: "Aerobic efficiency",
    values: eff.map((p) => ({
      label: p.label,
      value: p.efficiency,
    })),
    trend: effTrend,
    // The strip splits interpretations on "·" for its direction chip, so every
    // branch needs both halves or the chip repeats the whole sentence.
    interpretation: !current
      ? `Untested · last read before ${gap}`
      : effTrend === "up"
        ? analytics.efficiencyMoM.narrative
          ? "Improving · MoM gain"
          : "Improving"
        : effTrend === "down"
          ? "Softening · check fatigue"
          : "Flat · hold pattern",
  };

  const rScore = analytics.raceReadiness?.score ?? analytics.halfMarathonReadiness.score;
  const rLabel = analytics.raceReadiness?.label ?? analytics.halfMarathonReadiness.label;

  const readiness: TrajectorySeries = {
    id: "readiness",
    label: "Race readiness",
    values: weeks.map((w) => ({
      label: w.label,
      value: rScore,
    })),
    trend: "flat",
    interpretation: `Stable · ${rLabel.toLowerCase()}`,
  };

  const freshTrend =
    analytics.fatigue.tsb > 0 ? "up" : analytics.fatigue.formPct < -12 ? "down" : "flat";

  const freshness: TrajectorySeries = {
    id: "freshness",
    label: "Freshness",
    values: weeks.map((w, i) => ({
      label: w.label,
      value: Math.max(
        0,
        Math.min(
          100,
          analytics.fatigue.freshness +
            (i - weeks.length + 1) * (analytics.fatigue.tsb > 0 ? 2 : -1),
        ),
      ),
    })),
    trend: freshTrend,
    interpretation: !current
      ? "Rested, not sharp · rebuild first"
      : analytics.fatigue.freshness >= 65
        ? "High · quality window"
        : analytics.fatigue.freshness < 45
          ? "Low · ease intensity"
          : "Moderate · selective quality",
  };

  return [readiness, freshness, efficiency, vol];
}

export function getCoachingStateBullets(
  state: CoachWorkspaceState,
  analytics: DashboardInsights,
): string[] {
  const bullets: string[] = [];
  const current = isTrainingCurrent(analytics.fatigue);
  // "Freshness high" after two weeks off describes rest, not readiness to race;
  // and "intensity stacking" describes a block that has already ended.
  if (!current) bullets.push(`Out of training · ${stalenessClause(analytics.fatigue)}`);
  else if (analytics.fatigue.freshness >= 65) bullets.push("Freshness high");
  else if (analytics.fatigue.freshness < 45) bullets.push("Freshness low");
  if (state.snapshot.readinessScore != null) {
    bullets.push(`Readiness ${state.snapshot.readinessLabel?.toLowerCase() ?? "stable"}`);
  }
  if (current && analytics.efficiencySummary.trend === "improving") {
    bullets.push("Aerobic adaptation improving");
  }
  if (analytics.intensityAdvice.status === "too_hard") {
    bullets.push(current ? "Intensity stacking elevated" : "Last block was intensity-heavy");
  }
  if (state.snapshot.riskLevel !== "low") {
    bullets.push(state.snapshot.riskLabel);
  }
  return bullets.slice(0, 5);
}

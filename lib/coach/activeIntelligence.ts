import type { DashboardInsights } from "@/lib/analytics";
import type { Insight } from "@/lib/insights/types";
import type { RaceGoal } from "@/lib/analytics/readiness";
import { RACE_DISTANCE_LABELS } from "@/lib/analytics/readiness";
import { archetypeDisplayLabel } from "@/lib/ecosystem";
import { ecosystemHeadline } from "@/lib/ecosystem/insights";
import {
  beliefsToMemoryDisplay,
  buildAthleteMemoryProfile,
  selectRelevantBeliefs,
} from "@/lib/athlete-memory";
import type { MemorySnippet } from "./memorySnippets";
import { buildCoachContextSnapshot } from "./viewModel";
import { buildActiveInvestigations, buildContinuityLine } from "./investigations";
import { isTrainingCurrent, stalenessClause } from "@/lib/insights/consistency";
import type {
  ActiveObservation,
  CoachWorkspaceState,
  CoachingDomain,
  ObservationTone,
  PinnedConclusion,
  RiskOpportunity,
} from "./types";
import type { CoachMessage } from "./types";

function toneFromInsight(severity: Insight["severity"]): ObservationTone {
  if (severity === "positive") return "positive";
  if (severity === "warning") return "warning";
  return "neutral";
}

export function buildActiveObservations(
  analytics: DashboardInsights,
  insights: Insight[],
): ActiveObservation[] {
  const out: ActiveObservation[] = [];
  const seen = new Set<string>();

  const push = (o: ActiveObservation) => {
    if (seen.has(o.id)) return;
    seen.add(o.id);
    out.push(o);
  };

  // Lead with the gap when there is one. Everything below is measured from training
  // that stopped, so the reader needs to know that before reading any of it.
  if (!isTrainingCurrent(analytics.fatigue)) {
    push({
      id: "training-gap",
      text: `No running for ${stalenessClause(analytics.fatigue)}: the numbers below describe the block before that, not current form.`,
      tone: "warning",
      domain: "Readiness",
      confidence: "high",
      isNew: true,
    });
  }

  if (analytics.efficiencySummary.trend === "improving") {
    const weeks = analytics.efficiencyTrend.slice(-3);
    // "Recent" and "trending" are present-tense claims. After a gap the gain is
    // something that happened, not something happening, and it is being lost.
    const current = isTrainingCurrent(analytics.fatigue);
    push({
      id: "eff-trend",
      text: current
        ? weeks.length >= 2
          ? "Aerobic efficiency has improved across recent HR-backed runs."
          : "Early signal: pace at comparable heart rate is trending faster."
        : `Aerobic efficiency had improved, measured before ${stalenessClause(analytics.fatigue)}: a starting point to re-establish, not current form.`,
      tone: current ? "positive" : "neutral",
      domain: current ? "Performance" : "Readiness",
      confidence: analytics.dataConfidence,
      isNew: true,
    });
  } else if (analytics.efficiencySummary.trend === "declining") {
    // Attributing the dip to fatigue only makes sense if training is current.
    // After a layoff the same dip is a detraining signal, and blaming fatigue
    // for load that was never absorbed reads as nonsense.
    const current = isTrainingCurrent(analytics.fatigue);
    push({
      id: "eff-down",
      text: current
        ? "Efficiency has dipped: fatigue or heat may be compressing aerobic returns."
        : `Efficiency has dipped, measured before ${stalenessClause(analytics.fatigue)}: read it as lost sharpness rather than fatigue.`,
      tone: "warning",
      domain: current ? "Fatigue" : "Readiness",
      confidence: "medium",
    });
  }

  if (analytics.intensityAdvice.status === "too_hard") {
    push({
      id: "intensity",
      text: `Intensity concentration is elevated: ${analytics.intensityAdvice.hardRunsLast14d} hard sessions in 14 days.`,
      tone: "warning",
      domain: "Fatigue",
      confidence: "medium",
    });
  }

  // No currency guard needed here, unlike the claims above. `CURRENCY_CAP` in
  // lib/analytics/fatigue.ts already clamps freshness to 50 when detrained and 65
  // when rusty, so a stale athlete cannot reach 70 and be told their freshness
  // "supports quality work" — the readiness model closed that off upstream. A guard
  // here would never be false and would imply a live risk that is not.
  if (analytics.fatigue.freshness >= 70) {
    push({
      id: "fresh",
      text: `Freshness supports quality work (${analytics.fatigue.label}, TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${Math.round(analytics.fatigue.tsb)}).`,
      tone: "positive",
      domain: "Readiness",
      confidence: "high",
    });
  } else if (analytics.fatigue.formPct < -17) {
    push({
      id: "fatigue",
      text: "Fatigue balance is strained: acute load is outpacing recovery.",
      tone: "warning",
      domain: "Fatigue",
      confidence: "high",
    });
  }

  if (analytics.raceReadiness && analytics.raceReadiness.score >= 60) {
    // "Stabilized" asserts the score is holding, which requires something to be
    // holding it up. Observed on the live account at 15 days without a run: Home
    // said DETRAINED while this card said "Race readiness stabilized at 67/100
    // (Nearly there)" — two surfaces disagreeing about the same athlete on the same
    // screen, which is worse than either being wrong on its own.
    const current = isTrainingCurrent(analytics.fatigue);
    push({
      id: "race-ready",
      text: current
        ? `Race readiness stabilized at ${analytics.raceReadiness.score}/100 (${analytics.raceReadiness.label}).`
        : `Race readiness was ${analytics.raceReadiness.score}/100 before ${stalenessClause(analytics.fatigue)}: where you left off, not where you are.`,
      tone: current ? "positive" : "neutral",
      domain: "Race prep",
      confidence: analytics.dataConfidence,
    });
  }

  const tempoCount = analytics.workoutTypeMix.find(
    (b) => b.type === "tempo" || b.type === "interval",
  );
  if (tempoCount && tempoCount.runCount >= 2) {
    push({
      id: "threshold",
      // Present continuous only holds while training is current; after a gap the
      // same count is history, not something still happening.
      text: isTrainingCurrent(analytics.fatigue)
        ? `Threshold-style sessions are appearing regularly (${tempoCount.runCount} in recent mix).`
        : `Threshold-style sessions featured in the last block (${tempoCount.runCount}), before ${stalenessClause(analytics.fatigue)}.`,
      tone: "neutral",
      domain: "Training patterns",
      confidence: "medium",
    });
  }

  const eco = analytics.trainingEcosystem;
  const ecoHead = ecosystemHeadline(eco);
  if (ecoHead && eco.totalContext.last28Days.nonRunSessions > 0) {
    push({
      id: "ecosystem",
      text: ecoHead,
      tone: eco.interferenceFlags.some((f) => f.severity !== "low") ? "warning" : "neutral",
      domain: "Cross-training",
      confidence: eco.confidence,
    });
  }

  for (const ins of insights.slice(0, 4)) {
    if (ins.id.startsWith("eco-") || ins.id === "next-week-plan") continue;
    push({
      id: `ins-${ins.id}`,
      text: ins.title,
      tone: toneFromInsight(ins.severity),
      domain: ins.question === "ready" ? "Race prep" : "Training",
      confidence: ins.confidence,
    });
  }

  return out.slice(0, 8);
}

export function deriveCurrentFocus(
  analytics: DashboardInsights,
  observations: ActiveObservation[],
): { focus: string; rationale: string } {
  // A gap outranks everything below it. Load-based advice reasons about training
  // that is not happening, and "protect the block" is incoherent when there is no
  // block: Home already leads with the comeback in this state, so Coach agreeing is
  // the difference between one product and two.
  if (!isTrainingCurrent(analytics.fatigue)) {
    return {
      focus: "Getting back to running",
      rationale: `${stalenessClause(analytics.fatigue)}. Rebuild easy volume first; the block that produced these numbers has stopped.`,
    };
  }

  if (analytics.fatigue.formPct < -21) {
    return {
      focus: "Fatigue management",
      rationale: "TSB and freshness suggest recovery should lead the next decisions.",
    };
  }
  if (analytics.raceReadiness && (analytics.raceReadiness.daysUntilRace ?? 99) <= 21) {
    return {
      focus: "Race-week execution",
      rationale: `${analytics.raceReadiness.daysUntilRace} days to race: prioritize freshness and specificity.`,
    };
  }
  if (analytics.intensityAdvice.status === "too_hard") {
    return {
      focus: "Intensity redistribution",
      rationale: "Hard-day density is high relative to easy aerobic volume.",
    };
  }
  if (analytics.efficiencySummary.trend === "improving") {
    return {
      focus: "Aerobic adaptation",
      rationale: "Efficiency trend is positive: protect the block with polarized easy days.",
    };
  }
  const warn = observations.find((o) => o.tone === "warning");
  if (warn) {
    return { focus: warn.domain, rationale: warn.text };
  }
  return {
    focus: "Training rhythm",
    rationale: `Maintaining ${analytics.consistencyScore.label.toLowerCase()} consistency in the current block.`,
  };
}

export function buildCoachingDomains(
  analytics: DashboardInsights,
  insights: Insight[],
  memory: MemorySnippet[],
): CoachingDomain[] {
  const mem = (cat: string) => memory.find((m) => m.label.toLowerCase() === cat)?.text ?? null;
  const eco = analytics.trainingEcosystem;
  const r = analytics.raceReadiness ?? analytics.halfMarathonReadiness;

  const domains: CoachingDomain[] = [
    {
      id: "readiness",
      title: "Readiness",
      subtitle: "Freshness & race proximity",
      liveInsight: `${r.score}/100 · ${r.label}${analytics.raceReadiness ? ` · ${analytics.raceReadiness.daysUntilRace}d` : ""}`,
      trendBadge:
        analytics.fatigue.freshness >= 65
          ? { label: "Fresh", tone: "up" }
          : analytics.fatigue.formPct < -15
            ? { label: "Loaded", tone: "alert" }
            : { label: "Neutral", tone: "flat" },
      memoryRef: mem("taper") ?? mem("fatigue"),
      suggestedQuery: "Why did my readiness change this week?",
      priority: 10,
    },
    {
      id: "performance",
      title: "Performance",
      subtitle: "Pace, efficiency, PRs",
      liveInsight:
        analytics.efficiencySummary.trend === "improving"
          ? "Aerobic efficiency trending up"
          : analytics.efficiencySummary.trend === "declining"
            ? "Efficiency under pressure"
            : "Stable efficiency signal",
      trendBadge:
        analytics.efficiencySummary.trend === "improving"
          ? { label: "↑ efficiency", tone: "up" }
          : analytics.efficiencySummary.trend === "declining"
            ? { label: "↓ efficiency", tone: "down" }
            : null,
      memoryRef: mem("adaptation"),
      suggestedQuery: "What likely caused my recent improvement?",
      priority: 9,
    },
    {
      id: "fatigue",
      title: "Fatigue & load",
      subtitle: "TSB, freshness, stacking",
      liveInsight: `${analytics.fatigue.label} · TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${Math.round(analytics.fatigue.tsb)}`,
      trendBadge:
        analytics.intensityAdvice.status === "too_hard"
          ? { label: "High intensity", tone: "alert" }
          : null,
      memoryRef: mem("fatigue"),
      suggestedQuery: "Am I stacking too much intensity?",
      priority: 8,
    },
    {
      id: "race",
      title: "Race prep",
      subtitle: "Goal, strategy, taper",
      liveInsight: analytics.raceReadiness
        ? `${analytics.raceReadiness.distanceLabel} · ${analytics.raceReadiness.probabilityBand}`
        : "Set a race goal for mission-specific coaching",
      trendBadge: analytics.raceReadiness
        ? {
            label: `${analytics.raceReadiness.daysUntilRace}d`,
            tone: "flat",
          }
        : null,
      memoryRef: null,
      suggestedQuery: "Am I ready for my race?",
      priority: analytics.raceReadiness ? 11 : 5,
    },
    {
      id: "ecosystem",
      title: "Cross-training",
      subtitle: "Modality balance & interference",
      liveInsight:
        eco.archetype.label.slice(0, 60) +
        (eco.totalContext.last28Days.nonRunSessions > 0
          ? ` · ${eco.totalContext.last28Days.nonRunSessions} non-run sessions`
          : ""),
      trendBadge:
        eco.scores.interferenceRisk >= 50
          ? { label: "Interference", tone: "alert" }
          : eco.scores.strengthSupport >= 60
            ? { label: "Strength OK", tone: "up" }
            : null,
      memoryRef: mem("modality"),
      suggestedQuery: "Is my gym work helping or hurting my running?",
      priority: eco.totalContext.last28Days.nonRunSessions > 0 ? 7 : 3,
    },
    {
      id: "patterns",
      title: "Training patterns",
      subtitle: "Blocks, phases, history",
      liveInsight: analytics.bestBlock
        ? `Best block: ${analytics.bestBlock.label}`
        : `${analytics.summary.runCount} runs in dataset`,
      trendBadge: null,
      memoryRef: mem("durability") ?? mem("adaptation"),
      suggestedQuery: "When was my strongest aerobic training block?",
      priority: 6,
    },
    {
      id: "pacing",
      title: "Pacing",
      subtitle: "Strategy & execution",
      liveInsight: analytics.raceStrategy
        ? `${analytics.raceStrategy.strategy} strategy · fade ${analytics.raceStrategy.fadeRisk}`
        : "Race strategy available after goal + predictions",
      trendBadge: null,
      memoryRef: null,
      suggestedQuery: "What pacing strategy fits my current fitness?",
      priority: analytics.raceStrategy ? 7 : 4,
    },
    {
      id: "recovery",
      title: "Recovery",
      subtitle: "Easy days, mobility, rebound",
      liveInsight: `Recovery behavior score ${eco.scores.recoveryBehavior}/100`,
      trendBadge:
        eco.scores.recoveryBehavior >= 65
          ? { label: "Consistent", tone: "up" }
          : { label: "Sparse", tone: "down" },
      memoryRef: null,
      suggestedQuery: "Did mobility affect my consistency?",
      priority: 5,
    },
    {
      id: "adaptation",
      title: "Long-term adaptation",
      subtitle: "Volume, durability, trends",
      liveInsight: `${analytics.consistencyScore.overall}/100 consistency · ${analytics.currentWeek.distanceKm} km this week`,
      trendBadge: {
        label: analytics.weeklyNarrative.severity === "positive" ? "On track" : "Watch",
        tone: analytics.weeklyNarrative.severity === "positive" ? "up" : "alert",
      },
      memoryRef: mem("pacing"),
      suggestedQuery: "What type of training helps me improve pace most?",
      priority: 6,
    },
  ];

  return domains.sort((a, b) => b.priority - a.priority);
}

export function buildTemporalContext(analytics: DashboardInsights, raceGoal: RaceGoal | null) {
  const prev = analytics.previousWeek;
  const cur = analytics.currentWeek;
  let weekTransition: string | null = null;
  if (prev) {
    const delta = cur.distanceKm - prev.distanceKm;
    weekTransition =
      delta > 2
        ? `Volume up ${Math.round(delta)} km vs ${prev.weekLabel}`
        : delta < -2
          ? `Volume down ${Math.round(Math.abs(delta))} km vs prior week`
          : `Volume steady vs ${prev.weekLabel}`;
  }

  const raceCountdown =
    analytics.raceReadiness?.daysUntilRace != null
      ? `${analytics.raceReadiness.daysUntilRace} days to ${analytics.raceReadiness.distanceLabel}`
      : raceGoal
        ? `${RACE_DISTANCE_LABELS[raceGoal.distance]} goal set`
        : null;

  return {
    currentBlock: analytics.trainingBlocks.at(-1)
      ? `${analytics.trainingBlocks.at(-1)!.label} · ${analytics.trainingBlocks.at(-1)!.distanceKm} km`
      : null,
    raceCountdown,
    weekTransition,
    fatigueRecovery:
      analytics.fatigue.tsb > 0
        ? "Recovery trend positive (TSB positive)"
        : analytics.fatigue.formPct < -17
          ? "Recovery lagging load"
          : "Load and recovery in balance",
  };
}

export function buildRisksAndOpportunities(
  analytics: DashboardInsights,
  observations: ActiveObservation[],
): RiskOpportunity[] {
  const out: RiskOpportunity[] = [];

  if (analytics.intensityAdvice.status === "too_hard") {
    out.push({
      id: "int-stack",
      text: "Elevated intensity stacking across the last 14 days",
      kind: "risk",
      domain: "Fatigue",
    });
  }
  if (analytics.fatigue.formPct < -17) {
    out.push({
      id: "tsb",
      text: "Acute load outpacing recovery: freshness under pressure",
      kind: "risk",
      domain: "Load",
    });
  }
  const eco = analytics.trainingEcosystem;
  if (eco.scores.interferenceRisk >= 50) {
    out.push({
      id: "interference",
      text: "HIIT or hard non-run work clustered near key run sessions",
      kind: "risk",
      domain: "Cross-training",
    });
  }
  if (analytics.efficiencySummary.trend === "improving") {
    out.push({
      id: "eff",
      text: "Aerobic efficiency trend improving: protect with easy volume",
      kind: "opportunity",
      domain: "Adaptation",
    });
  }
  if (analytics.fatigue.freshness >= 68) {
    out.push({
      id: "fresh",
      text: "Freshness supports a quality session window",
      kind: "opportunity",
      domain: "Readiness",
    });
  }
  if (eco.scores.strengthSupport >= 60) {
    out.push({
      id: "strength",
      text: "Strength support appears consistent without overload signal",
      kind: "opportunity",
      domain: "Durability",
    });
  }
  if (analytics.raceReadiness && analytics.raceReadiness.daysUntilRace <= 21) {
    out.push({
      id: "taper",
      text: "Race taper window: specificity and freshness alignment matter",
      kind: "opportunity",
      domain: "Race prep",
    });
  }

  for (const o of observations) {
    if (o.tone === "warning" && !out.some((r) => r.text === o.text)) {
      out.push({
        id: `obs-${o.id}`,
        text: o.text,
        kind: "risk",
        domain: o.domain,
      });
    }
    if (o.tone === "positive" && out.length < 6) {
      out.push({
        id: `opp-${o.id}`,
        text: o.text,
        kind: "opportunity",
        domain: o.domain,
      });
    }
  }

  return out.slice(0, 6);
}

export function extractPinnedConclusions(messages: CoachMessage[]): PinnedConclusion[] {
  return messages
    .filter((m) => m.role === "assistant" && m.parsed?.summary)
    .slice(-3)
    .reverse()
    .map((m) => ({
      id: m.id,
      title: m.parsed!.summary!.slice(0, 72),
      summary: m.parsed!.recommendation ?? m.parsed!.summary ?? "",
      confidence: m.parsed!.confidence,
      createdAt: m.createdAt,
    }));
}

export function buildCoachWorkspaceState(
  analytics: DashboardInsights | null,
  insights: Insight[],
  raceGoal: RaceGoal | null,
  messages: CoachMessage[] = [],
): CoachWorkspaceState | null {
  if (!analytics) return null;

  const memoryProfile = buildAthleteMemoryProfile(analytics);
  const { beliefs } = selectRelevantBeliefs(memoryProfile, {
    goal: raceGoal,
    maxBeliefs: 6,
  });
  const memory = beliefsToMemoryDisplay(beliefs);
  const observations = buildActiveObservations(analytics, insights);
  const { focus, rationale } = deriveCurrentFocus(analytics, observations);
  const domains = buildCoachingDomains(analytics, insights, memory);
  const base = buildCoachContextSnapshot(analytics, raceGoal);
  const temporal = buildTemporalContext(analytics, raceGoal);
  const eco = analytics.trainingEcosystem;

  const riskLevel: "low" | "moderate" | "elevated" =
    analytics.fatigue.formPct < -21 || eco.scores.interferenceRisk >= 60
      ? "elevated"
      : analytics.fatigue.formPct < -12 || analytics.intensityAdvice.status === "too_hard"
        ? "moderate"
        : "low";

  const adaptationTrend: CoachWorkspaceState["snapshot"]["adaptationTrend"] =
    analytics.efficiencySummary.trend === "improving"
      ? "improving"
      : analytics.fatigue.formPct < -17
        ? "strained"
        : "stable";

  const snapshot = {
    ...base,
    currentFocus: focus,
    adaptationTrend,
    adaptationLabel:
      adaptationTrend === "improving"
        ? "Aerobic adaptation improving"
        : adaptationTrend === "strained"
          ? "Recovery under load"
          : "Stable adaptation",
    riskLevel,
    riskLabel:
      riskLevel === "elevated"
        ? "Elevated stacking risk"
        : riskLevel === "moderate"
          ? "Moderate fatigue risk"
          : "Risk contained",
    recommendationConfidence: analytics.dataConfidence,
    blockSummary: temporal.currentBlock,
    archetypeLabel: archetypeDisplayLabel(eco.archetype.archetype),
    modalityHeadline: ecosystemHeadline(eco),
    weekLabel: analytics.currentWeek.weekLabel,
  };

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.parsed?.summary);

  const risksAndOpportunities = buildRisksAndOpportunities(analytics, observations);

  const partial = {
    snapshot,
    currentFocus: focus,
    focusRationale: rationale,
    observations,
    domains,
    memory,
    temporal,
    lastAssistantSummary: lastAssistant?.parsed?.summary ?? null,
  };

  return {
    ...partial,
    risksAndOpportunities,
    investigations: buildActiveInvestigations(partial),
    pinnedFromThread: extractPinnedConclusions(messages),
    continuityLine: buildContinuityLine(messages, observations),
  };
}

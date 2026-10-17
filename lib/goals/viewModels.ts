import type { DashboardInsights } from "@/lib/analytics";
import type { RaceGoal, RaceReadiness } from "@/lib/analytics/readiness";
import {
  RACE_DISTANCE_LABELS,
  RACE_READINESS_CONFIG,
  formatLongRunVsRace,
} from "@/lib/analytics/readiness";
import type { RacePredictionAnalysis, ConsensusPrediction } from "@/lib/analytics/predictions";
import type { Insight } from "@/lib/insights/types";
import type { RaceProjectionView } from "@/lib/performance/viewModels";
import type { ForecastV2View } from "@/lib/goals/forecastV2ViewModel";
import { buildForecastV2View } from "@/lib/goals/forecastV2ViewModel";
import type { GoalScenarioResult } from "@/lib/goals/goalScenarios";
import { buildGoalScenariosView } from "@/lib/goals/goalScenarios";
import { buildGoalsRaceBrief, type GoalsRaceBriefView } from "@/lib/goals/goalsRaceBrief";
import type { RunActivity } from "@/lib/strava/types";
import type { FitRunDetail } from "@/lib/strava/fitTypes";
import { formatDuration, formatKm, formatPace } from "@/lib/utils";

export interface ReadinessDimensionView {
  id: string;
  label: string;
  score: number;
  level: "strong" | "moderate" | "weak";
  note: string;
}

export interface RaceMissionHeroView {
  missionTitle: string;
  targetTimeDisplay: string | null;
  readinessScore: number;
  readinessLabel: string;
  confidenceLabel: string;
  confidence: "low" | "medium" | "high";
  strongestSignal: string;
  biggestLimiter: string;
  recommendation: string;
  projectedFinish: string | null;
  projectedSpread: string | null;
  daysUntilRace: number | null;
  raceDateDisplay: string | null;
  trajectorySparkline: number[];
  hasRaceGoal: boolean;
}

export interface GoalRiskView {
  title: string;
  severity: "high" | "medium" | "low";
  evidence: string;
  mitigation: string;
  confidence: "low" | "medium" | "high";
}

export interface ModelConsensusRow {
  label: string;
  consensusDisplay: string;
  spreadDisplay: string | null;
  agreement: "tight" | "moderate" | "wide";
}

export interface GoalsExplainView {
  summary: string;
  basedOn: string[];
  assumptions: string[];
  limitations: string[];
}

export interface GoalsPageView {
  hero: RaceMissionHeroView;
  raceBrief: GoalsRaceBriefView | null;
  readiness: RaceReadiness | null;
  dimensions: ReadinessDimensionView[];
  projection: RaceProjectionView;
  forecastV2: ForecastV2View | null;
  scenarios: GoalScenarioResult | null;
  risks: GoalRiskView[];
  consensus: ModelConsensusRow[];
  explain: GoalsExplainView;
  historical: { label: string; value: string }[];
  targetDistanceLabel: string;
}

function pickGoalProjection(
  analysis: RacePredictionAnalysis,
  goal: RaceGoal | null,
  readiness: RaceReadiness | null,
): ConsensusPrediction | null {
  if (analysis.consensus.length === 0) return null;
  const dist = goal?.distance ?? readiness?.distance ?? "hm";
  const key =
    dist === "hm"
      ? "Half Marathon"
      : dist === "marathon"
        ? "Marathon"
        : dist === "10k"
          ? "10K"
          : "5K";
  return analysis.consensus.find((c) => c.label === key) ?? analysis.consensus[0];
}

function buildProjection(
  analytics: DashboardInsights,
  goal: RaceGoal | null,
  readiness: RaceReadiness | null,
): RaceProjectionView {
  const analysis = analytics.racePredictionAnalysis;
  const primary = pickGoalProjection(analysis, goal, readiness);

  const confidenceDrivers: string[] = [];
  const confidenceReducers: string[] = [];

  if (analysis.efforts.length >= 3) {
    confidenceDrivers.push(`${analysis.efforts.length} quality efforts anchor the model`);
  }
  if (readiness && readiness.longestRunPct >= 70) {
    confidenceDrivers.push("Long-run density supports race distance");
  }
  if (analytics.consistencyScore.overall >= 65) {
    confidenceDrivers.push("Consistent weekly training rhythm");
  }
  if (analytics.efficiencySummary.trend === "improving") {
    confidenceDrivers.push("Improving aerobic efficiency at comparable HR");
  }

  if (analysis.confidence === "low") {
    confidenceReducers.push("Limited race-effort benchmarks in export");
  }
  if (analytics.fatigue.usesProxyLoad) {
    confidenceReducers.push("Incomplete training load on activities");
  }
  if (!goal?.targetTimeSec && primary && primary.spreadSec > 120) {
    confidenceReducers.push("Wide model spread: outcome less certain");
  }
  confidenceReducers.push("No sleep/HRV: subjective freshness not modeled");

  const confidenceLabel =
    analysis.confidence === "high"
      ? "High"
      : analysis.confidence === "medium"
        ? "Medium-high"
        : "Medium";

  return {
    primary: primary
      ? {
          label: primary.label,
          distanceKm: primary.distanceKm,
          timeDisplay: formatDuration(primary.timeSec),
          rangeDisplay:
            primary.spreadSec > 30
              ? `${formatDuration(primary.timeMin)} – ${formatDuration(primary.timeMax)}`
              : formatDuration(primary.timeSec),
          spreadDisplay:
            primary.spreadSec > 30
              ? `±${formatDuration(Math.round(primary.spreadSec / 2))}`
              : "narrow band",
          confidence: analysis.confidence,
          confidenceLabel,
          paceDisplay: formatPace(primary.timeSec / primary.distanceKm),
        }
      : null,
    allDistances: analysis.consensus.map((c) => ({
      label: c.label,
      timeDisplay: formatDuration(c.timeSec),
      rangeDisplay:
        c.spreadSec > 45 ? `${formatDuration(c.timeMin)} – ${formatDuration(c.timeMax)}` : null,
    })),
    confidenceDrivers: confidenceDrivers.slice(0, 5),
    confidenceReducers: confidenceReducers.slice(0, 5),
    pacingNote: primary
      ? `Even-effort ~${formatPace(primary.timeSec / primary.distanceKm)}. Adjust for course and weather.`
      : null,
    fadeRisk:
      analytics.fatigue.formPct < -21
        ? "Elevated fatigue may increase late-race fade vs projection."
        : null,
    explanation: analysis.explanation,
    effortCount: analysis.efforts.length,
    analysis,
  };
}

function levelFromScore(score: number): ReadinessDimensionView["level"] {
  if (score >= 72) return "strong";
  if (score >= 50) return "moderate";
  return "weak";
}

function buildDimensions(
  analytics: DashboardInsights,
  readiness: RaceReadiness | null,
): ReadinessDimensionView[] {
  const r = readiness;
  const fatigue = analytics.fatigue;
  const consistency = analytics.consistencyScore;
  const hardPct = 100 - analytics.intensityAdvice.currentEasyPct;

  const endurance = r
    ? Math.round((r.longestRunPct + r.volumePct) / 2)
    : analytics.halfMarathonReadiness.score;
  const freshness = fatigue.freshness;
  const pacing = Math.min(
    100,
    analytics.efficiencySummary.trend === "improving"
      ? 78
      : analytics.efficiencySummary.trend === "declining"
        ? 42
        : 58,
  );
  const threshold = Math.min(100, hardPct >= 15 && hardPct <= 28 ? 75 : hardPct > 28 ? 45 : 60);
  const longRun = r?.longestRunPct ?? analytics.halfMarathonReadiness.longestRunPct;

  return [
    {
      id: "endurance",
      label: "Endurance",
      score: endurance,
      level: levelFromScore(endurance),
      note: r
        ? `${formatKm(r.fourWeekVolumeKm)} / 4 wk (${r.volumePct}% of target)`
        : `${formatKm(analytics.halfMarathonReadiness.fourWeekVolumeKm)} recent volume`,
    },
    {
      id: "long",
      label: "Long-run readiness",
      score: longRun,
      level: levelFromScore(longRun),
      note: r
        ? formatLongRunVsRace(r.longestRunKm, RACE_READINESS_CONFIG[r.distance].raceDistanceKm)
        : formatLongRunVsRace(
            analytics.halfMarathonReadiness.longestRunKm,
            RACE_READINESS_CONFIG.hm.raceDistanceKm,
          ),
    },
    {
      id: "freshness",
      label: "Freshness",
      score: freshness,
      level: levelFromScore(freshness),
      note: `${fatigue.label} · TSB ${fatigue.tsb > 0 ? "+" : ""}${fatigue.tsb}`,
    },
    {
      id: "consistency",
      label: "Consistency",
      score: consistency.overall,
      level: levelFromScore(consistency.overall),
      note: consistency.label,
    },
    {
      id: "threshold",
      label: "Threshold support",
      score: threshold,
      level: levelFromScore(threshold),
      note: `${Math.round(analytics.intensityAdvice.currentEasyPct)}% easy · ${Math.round(hardPct)}% hard share`,
    },
    {
      id: "pacing",
      label: "Pacing efficiency",
      score: pacing,
      level: levelFromScore(pacing),
      note:
        analytics.efficiencyMoM.narrative?.slice(0, 72) ??
        `Efficiency ${analytics.efficiencySummary.trend ?? "stable"}`,
    },
  ];
}

function buildRisks(
  analytics: DashboardInsights,
  readiness: RaceReadiness | null,
  projection: RaceProjectionView,
): GoalRiskView[] {
  const risks: GoalRiskView[] = [];

  if (readiness) {
    for (const gap of readiness.gaps.slice(0, 3)) {
      risks.push({
        title: gap.metric,
        severity: "medium",
        evidence: `Currently ${gap.current}, target ${gap.target}`,
        mitigation: "Add focused sessions in the next 2–3 weeks before taper.",
        confidence: analytics.dataConfidence,
      });
    }
  }

  if (analytics.fatigue.formPct < -17) {
    risks.push({
      title: "Elevated fatigue",
      severity: "high",
      evidence: `TSB ${analytics.fatigue.tsb}: acute load exceeds recovery.`,
      mitigation: "Reduce intensity 5–7 days; prioritize sleep before race week.",
      confidence: "high",
    });
  }

  for (const w of analytics.trainingEcosystem.raceWeekWarnings.slice(0, 2)) {
    risks.push({
      title: "Race week: non-run intensity",
      severity: w.severity === "high" ? "high" : "medium",
      evidence: w.message,
      mitigation:
        "Reduce or maintain strength; avoid new HIIT within 48h of race; mobility can support taper confidence.",
      confidence: "medium",
    });
  }

  const hiInterference = analytics.trainingEcosystem.interferenceFlags.filter(
    (f) => f.severity === "high",
  );
  if (hiInterference.length > 0 && readiness && (readiness.daysUntilRace ?? 99) > 7) {
    risks.push({
      title: "Stacked non-run intensity",
      severity: "medium",
      evidence: hiInterference[0].message,
      mitigation:
        "Keep hard gym, CrossFit, or sport sessions 24–48h away from tempo, intervals, and long runs.",
      confidence: "medium",
    });
  }

  const hardPct = 100 - analytics.intensityAdvice.currentEasyPct;
  if (hardPct > 28) {
    risks.push({
      title: "Threshold density high",
      severity: "medium",
      evidence: `${Math.round(hardPct)}% of efforts classified hard in recent block.`,
      mitigation: "Cap quality to 1–2 sessions/week; protect easy volume.",
      confidence: "medium",
    });
  }

  if (projection.primary && projection.primary.spreadDisplay.includes("±")) {
    const spread = projection.analysis.consensus.find((c) => c.label === projection.primary!.label);
    if (spread && spread.spreadSec > 90) {
      risks.push({
        title: "Prediction uncertainty",
        severity: "medium",
        evidence: "Models disagree materially on finish time.",
        mitigation: "Use conservative pacing first half; revise target if feel is off.",
        confidence: projection.primary.confidence,
      });
    }
  }

  if (risks.length === 0) {
    risks.push({
      title: "Race-day variables",
      severity: "low",
      evidence:
        "Training signals are balanced; weather, fueling, and pacing discipline still matter.",
      mitigation: "Rehearse nutrition and first 5 km pacing.",
      confidence: "medium",
    });
  }

  return risks.slice(0, 6);
}

function buildConsensus(analysis: RacePredictionAnalysis): ModelConsensusRow[] {
  return analysis.consensus.map((c) => ({
    label: c.label,
    consensusDisplay: formatDuration(c.timeSec),
    spreadDisplay:
      c.spreadSec > 45 ? `${formatDuration(c.timeMin)} – ${formatDuration(c.timeMax)}` : null,
    agreement: c.spreadSec <= 45 ? "tight" : c.spreadSec <= 120 ? "moderate" : "wide",
  }));
}

function buildHero(
  goal: RaceGoal | null,
  readiness: RaceReadiness | null,
  analytics: DashboardInsights,
  projection: RaceProjectionView,
  insights: Insight[],
  forecastV2: ForecastV2View | null,
): RaceMissionHeroView {
  const r = readiness ?? {
    distance: "hm" as const,
    distanceLabel: "Half marathon",
    score: analytics.halfMarathonReadiness.score,
    label: analytics.halfMarathonReadiness.label,
    daysUntilRace: 0,
    raceDate: "",
    probabilityBand: "",
    longestRunKm: analytics.halfMarathonReadiness.longestRunKm,
    longestRunPct: analytics.halfMarathonReadiness.longestRunPct,
    fourWeekVolumeKm: analytics.halfMarathonReadiness.fourWeekVolumeKm,
    volumePct: analytics.halfMarathonReadiness.volumePct,
    gaps: [],
  };

  const readyInsight = insights.find((i) => i.question === "ready");
  const primary = projection.primary;

  const strongest =
    readyInsight?.evidence[0] ??
    (r.longestRunPct >= 70
      ? "Long-run consistency supports race distance"
      : analytics.efficiencySummary.trend === "improving"
        ? "Aerobic efficiency trending positively"
        : "Steady training block with room to sharpen");

  const limiter =
    r.gaps[0]?.metric ??
    (analytics.intensityAdvice.status === "paused"
      ? "Time away from running"
      : analytics.fatigue.formPct < -15
        ? "Fatigue accumulation"
        : analytics.intensityAdvice.status === "too_hard"
          ? "Threshold density slightly elevated"
          : r.volumePct < 60
            ? "Volume below target block"
            : "Limited race-specific benchmarks");

  const targetDisplay = goal?.targetTimeSec
    ? formatDuration(goal.targetTimeSec)
    : r.targetTimeSec
      ? formatDuration(r.targetTimeSec)
      : null;

  const volSpark = analytics.weeklyVolume.slice(-10).map((w) => w.distanceKm);

  return {
    missionTitle: goal
      ? `${RACE_DISTANCE_LABELS[goal.distance]} mission`
      : `${r.distanceLabel} mission`,
    targetTimeDisplay: targetDisplay,
    readinessScore: r.score,
    readinessLabel: r.label,
    confidenceLabel: forecastV2?.confidence ?? projection.primary?.confidenceLabel ?? "Medium",
    confidence: analytics.dataConfidence,
    strongestSignal: strongest,
    biggestLimiter: limiter,
    recommendation:
      readyInsight?.recommendation ??
      (r.score >= 70
        ? "Maintain rhythm; add short race-pace touches without increasing fatigue."
        : "Extend long run and volume before taper; keep easy days truly easy."),
    projectedFinish: forecastV2?.mostLikely ?? primary?.timeDisplay ?? null,
    projectedSpread: forecastV2?.rangeDisplay ?? primary?.spreadDisplay ?? null,
    daysUntilRace: readiness?.daysUntilRace ?? null,
    raceDateDisplay: readiness
      ? new Date(readiness.raceDate).toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null,
    trajectorySparkline: volSpark.length >= 2 ? volSpark : [20, 22, 25, 24, 28],
    hasRaceGoal: !!goal,
  };
}

export function buildGoalsPageView(
  analytics: DashboardInsights,
  goal: RaceGoal | null,
  insights: Insight[] = [],
  opts?: { runs?: RunActivity[]; fitDetails?: FitRunDetail[] },
): GoalsPageView {
  const readiness = analytics.raceReadiness;
  const projection = buildProjection(analytics, goal, readiness);
  const forecastV2 = buildForecastV2View({
    analytics,
    goal,
    runs: opts?.runs,
    fitDetails: opts?.fitDetails,
  });
  const hero = buildHero(goal, readiness, analytics, projection, insights, forecastV2);
  const raceBrief =
    forecastV2 != null ? buildGoalsRaceBrief({ forecast: forecastV2, goal, readiness }) : null;

  const explain: GoalsExplainView = {
    summary:
      projection.explanation[0] ??
      "Predictions combine recent efforts with endurance scaling models.",
    basedOn: [
      ...projection.confidenceDrivers,
      readiness
        ? `Readiness ${readiness.score}/100 from volume + long-run benchmarks`
        : `Default HM readiness ${analytics.halfMarathonReadiness.score}/100`,
    ],
    assumptions: [
      "Even pacing unless strategy mode selected",
      "Similar weather and fueling to training conditions",
      projection.analysis.regression
        ? `Power-law exponent ${projection.analysis.regression.exponent.toFixed(2)} from your efforts`
        : "Single-anchor Riegel extrapolation for longer distances",
    ],
    limitations: [
      "Not medical advice: confirm with coach or physician if injured.",
      "Race-day adrenaline and course profile can shift outcomes ± model spread.",
      ...projection.confidenceReducers.slice(0, 2),
    ],
  };

  const historical: { label: string; value: string }[] = [];
  if (analytics.bestBlock) {
    historical.push({
      label: "Best training block",
      value: `${analytics.bestBlock.label} · ${formatKm(analytics.bestBlock.distanceKm)}`,
    });
  }
  historical.push({
    label: "Prediction samples",
    value: `${projection.effortCount} efforts · ${projection.analysis.models.length} models`,
  });
  if (analytics.predictionTimeline.length >= 2) {
    const first = analytics.predictionTimeline[0];
    const last = analytics.predictionTimeline.at(-1)!;
    const hmKey = readiness?.distance === "hm" || !goal;
    const a = hmKey ? first.consensusHmSec : first.consensus10kSec;
    const b = hmKey ? last.consensusHmSec : last.consensus10kSec;
    if (a && b) {
      historical.push({
        label: "Projection trajectory",
        value:
          b < a
            ? "Consensus time trending faster over sampled weeks"
            : "Consensus time stable or easing: check freshness",
      });
    }
  }

  return {
    hero,
    raceBrief,
    readiness,
    dimensions: buildDimensions(analytics, readiness),
    projection,
    forecastV2,
    scenarios: buildGoalScenariosView({
      analytics,
      goal,
      runs: opts?.runs,
      fitDetails: opts?.fitDetails,
    }),
    risks: buildRisks(analytics, readiness, projection),
    consensus: buildConsensus(analytics.racePredictionAnalysis),
    explain,
    historical,
    targetDistanceLabel:
      readiness?.distanceLabel ?? (goal ? RACE_DISTANCE_LABELS[goal.distance] : "Half marathon"),
  };
}

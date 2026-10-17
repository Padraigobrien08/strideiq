import type { DashboardInsights } from "@/lib/analytics";
import type { WeeklyNarrative } from "@/lib/analytics/narrative";
import type { Insight } from "@/lib/insights/types";
import type { ImportQualityReport } from "@/lib/quality/assessImport";
import type { RaceGoal } from "@/lib/analytics/readiness";
import { buildGoalsPageView } from "@/lib/goals/viewModels";
import { buildTrainingPageView } from "@/lib/training/viewModels";
import {
  buildReportEcosystemView,
  type ReportEcosystemView,
} from "@/lib/training/ecosystemViewModel";
import { formatDuration, formatKm, formatPace } from "@/lib/utils";
import { RACE_DISTANCE_LABELS } from "@/lib/analytics/readiness";

export interface ReportMetaView {
  generatedAt: string;
  dateRangeLabel: string | null;
  runCount: number;
  totalDistanceKm: string;
  exportLabel: string | null;
}

export interface ExecutiveSummaryView {
  headline: string;
  blockSummary: string;
  keySignal: string;
  biggestOpportunity: string;
  projectedReadiness: string;
}

export interface ReportHeroView {
  athleteState: string;
  trajectory: string;
  recommendation: string;
  readinessScore: number;
  readinessLabel: string;
  confidence: "low" | "medium" | "high";
  confidenceLabel: string;
  volumeSparkline: number[];
  daysUntilRace: number | null;
  raceLabel: string | null;
}

export interface SynthesizedSignalView {
  text: string;
  significance: string;
  tone: "positive" | "neutral" | "warning";
}

export interface CoachingRecommendationView {
  primaryFocus: string;
  rationale: string[];
  confidence: "low" | "medium" | "high";
  confidenceLabel: string;
  focusArea: string;
  expectedAdaptation: string;
  weekLabel: string;
  volumeRange: string;
}

export interface RaceReadinessBriefingView {
  distanceLabel: string;
  score: number;
  label: string;
  confidence: "low" | "medium" | "high";
  strongestSignal: string;
  largestRisk: string;
  pacingGuidance: string | null;
  projectedRange: string | null;
  probabilityBand: string | null;
  daysUntilRace: number | null;
}

export interface PerformanceMetricCluster {
  label: string;
  value: string;
  context: string;
}

export interface ReportChartSpec {
  id: string;
  title: string;
  caption: string;
  whyItMatters: string;
}

export interface HistoryRunRow {
  date: string;
  name: string;
  distance: string;
  pace: string | null;
}

export interface ConfidenceBriefView {
  overall: "low" | "medium" | "high";
  overallLabel: string;
  strongEvidence: string[];
  missing: string[];
  limitations: string[];
  fieldCoverage: { label: string; pct: number }[];
}

export interface ReportPageView {
  meta: ReportMetaView;
  executive: ExecutiveSummaryView;
  hero: ReportHeroView;
  trainingState: {
    classification: string;
    narrative: WeeklyNarrative;
    currentWeek: string;
    previousWeek: string | null;
    consistency: string;
    intensity: string;
  };
  signals: SynthesizedSignalView[];
  adaptation: {
    headline: string;
    interpretation: string;
    bullets: string[];
    progressionNote: string | null;
  };
  raceBriefing: RaceReadinessBriefingView;
  coaching: CoachingRecommendationView;
  metrics: PerformanceMetricCluster[];
  charts: ReportChartSpec[];
  history: {
    recentRuns: HistoryRunRow[];
    prHighlights: { label: string; value: string }[];
    bestBlock: string | null;
  };
  confidence: ConfidenceBriefView;
  hasPredictionTimeline: boolean;
  hasLoadHistory: boolean;
  hasEfficiencyTrend: boolean;
  ecosystem: ReportEcosystemView | null;
}

function synthesizeSignals(
  analytics: DashboardInsights,
  insights: Insight[],
): SynthesizedSignalView[] {
  const signals: SynthesizedSignalView[] = [];
  const r = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  const hardPct = 100 - analytics.intensityAdvice.currentEasyPct;

  if (r.longestRunPct >= 65) {
    signals.push({
      text: "Long-run consistency supports race-distance demands.",
      significance: `Longest ${r.longestRunKm} km (${r.longestRunPct}% of target benchmark).`,
      tone: "positive",
    });
  } else {
    signals.push({
      text: "Long-run density still building toward race distance.",
      significance: `Longest ${r.longestRunKm} km: extend gradually before taper.`,
      tone: "warning",
    });
  }

  if (analytics.efficiencySummary.trend === "improving") {
    signals.push({
      text: "Aerobic efficiency trending upward.",
      significance: "Pace at comparable heart rate is improving versus prior block.",
      tone: "positive",
    });
  } else if (analytics.efficiencySummary.trend === "declining") {
    signals.push({
      text: "Aerobic efficiency slipping: check recovery.",
      significance: analytics.efficiencyMoM.narrative ?? "Review fatigue and easy-day discipline.",
      tone: "warning",
    });
  } else {
    signals.push({
      text: "Aerobic efficiency stable.",
      significance: "Maintain aerobic volume; add benchmarks for sharper trend reads.",
      tone: "neutral",
    });
  }

  if (analytics.intensityAdvice.status === "paused") {
    signals.push({
      text: "Intensity balance cannot be read this week.",
      significance: `The ${hardPct}% hard share describes your last block: nothing has been run in the last 7 days.`,
      tone: "neutral",
    });
  } else if (analytics.intensityAdvice.status === "too_hard") {
    signals.push({
      text: "Intensity balance remains elevated.",
      significance: `${hardPct}% hard share vs ~${100 - analytics.intensityAdvice.easyTargetPct}% target hard ceiling.`,
      tone: "warning",
    });
  } else if (hardPct >= 12 && hardPct <= 25) {
    signals.push({
      text: "Threshold support is well distributed.",
      significance: `${analytics.intensityAdvice.currentEasyPct}% easy efforts: quality spaced appropriately.`,
      tone: "positive",
    });
  }

  if (analytics.fatigue.freshness >= 70) {
    signals.push({
      text: "Freshness supports quality without overload.",
      significance: `${analytics.fatigue.label} · TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${analytics.fatigue.tsb}`,
      tone: "positive",
    });
  } else if (analytics.fatigue.formPct < -17) {
    signals.push({
      text: "Recovery distribution slightly insufficient.",
      significance: "Acute load exceeds recovery: prioritize sleep and easy volume.",
      tone: "warning",
    });
  }

  for (const ins of insights.slice(0, 2)) {
    if (signals.length >= 6) break;
    signals.push({
      text: ins.title,
      significance: ins.evidence[0] ?? ins.recommendation ?? "",
      tone:
        ins.severity === "positive"
          ? "positive"
          : ins.severity === "warning"
            ? "warning"
            : "neutral",
    });
  }

  return signals.slice(0, 6);
}

function buildExecutive(
  analytics: DashboardInsights,
  training: ReturnType<typeof buildTrainingPageView>,
  goals: ReturnType<typeof buildGoalsPageView>,
): ExecutiveSummaryView {
  const readiness = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  const dist = analytics.raceReadiness?.distanceLabel ?? "half-marathon";

  const blockSummary =
    analytics.weeklyNarrative.paragraphs[0] ??
    `You maintained ${readiness.label.toLowerCase()} ${dist} readiness with ${analytics.consistencyScore.label.toLowerCase()} training rhythm.`;

  const keySignal =
    goals.hero.strongestSignal ||
    training.adaptation.headline ||
    "Training signals are within expected ranges for this block.";

  const opportunity =
    goals.hero.biggestLimiter ||
    (analytics.intensityAdvice.status === "paused"
      ? "Get back to consistent easy running before anything else."
      : analytics.intensityAdvice.status === "too_hard"
        ? "Reduce intensity density slightly before race week."
        : analytics.fatigue.formPct < -15
          ? "Prioritize recovery before adding race-specific sharpness."
          : "Add one race-pace touchpoint while holding easy volume.");

  const projected =
    readiness.score >= 72
      ? `Strong likelihood of successful ${dist} completion if pacing and fueling hold.`
      : readiness.score >= 55
        ? `Moderate readiness: targeted long runs and taper will sharpen outcome probability.`
        : `Build volume and long-run support before expecting race-day confirmation.`;

  return {
    headline: "Training Intelligence Summary",
    blockSummary,
    keySignal: `Key signal: ${keySignal}`,
    biggestOpportunity: `Biggest opportunity: ${opportunity}`,
    projectedReadiness: `Projected readiness: ${projected}`,
  };
}

function buildRaceBriefing(
  analytics: DashboardInsights,
  goals: ReturnType<typeof buildGoalsPageView>,
): RaceReadinessBriefingView {
  const r = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  const primary = goals.projection.primary;
  const dist =
    analytics.raceReadiness?.distanceLabel ??
    (goals.hero.hasRaceGoal ? "Race goal" : "Half marathon");

  return {
    distanceLabel: dist,
    score: r.score,
    label: r.label,
    confidence: goals.projection.primary?.confidence ?? analytics.dataConfidence,
    strongestSignal: goals.hero.strongestSignal,
    largestRisk: goals.risks[0]?.title
      ? `${goals.risks[0].title}: ${goals.risks[0].evidence}`
      : goals.hero.biggestLimiter,
    pacingGuidance: goals.projection.pacingNote,
    projectedRange: primary ? `${primary.timeDisplay} ${primary.spreadDisplay}` : null,
    probabilityBand: analytics.raceReadiness?.probabilityBand ?? null,
    daysUntilRace: analytics.raceReadiness?.daysUntilRace ?? null,
  };
}

function buildCoaching(
  training: ReturnType<typeof buildTrainingPageView>,
): CoachingRecommendationView {
  const plan = training.plan;
  const focus =
    plan.isTaper || plan.isRaceWeek
      ? "Protect freshness and race-specific neuromuscular sharpness."
      : plan.isRecovery
        ? "Rebuild aerobic base with controlled easy volume."
        : plan.template === "quality"
          ? "Maintain aerobic sharpness while reducing accumulated fatigue."
          : "Sustain progressive volume with one quality anchor.";

  const expected =
    plan.isTaper || plan.isRaceWeek
      ? "Improved freshness entering race week with stable fitness."
      : plan.isRecovery
        ? "Reduced acute fatigue and restored easy-day compliance."
        : "Continued CTL growth without exceeding recovery capacity.";

  return {
    primaryFocus: focus,
    rationale: [...plan.rationale.slice(0, 3), training.explain.recommendationWhy],
    confidence: plan.confidence,
    confidenceLabel: training.explain.confidenceLabel,
    focusArea: plan.templateLabel,
    expectedAdaptation: expected,
    weekLabel: plan.weekLabel,
    volumeRange: plan.totalKmLabel,
  };
}

function buildMetrics(analytics: DashboardInsights): PerformanceMetricCluster[] {
  const r = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  return [
    {
      label: "Readiness",
      value: `${r.score}/100`,
      context: r.label,
    },
    {
      label: "Freshness",
      value: `${analytics.fatigue.freshness}`,
      context: `${analytics.fatigue.label} · TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${analytics.fatigue.tsb}`,
    },
    {
      label: "Consistency",
      value: `${analytics.consistencyScore.overall}`,
      context: analytics.consistencyScore.label,
    },
    {
      label: "This week",
      value: formatKm(analytics.currentWeek.distanceKm),
      context: `${analytics.currentWeek.runCount} runs`,
    },
    {
      label: "Last 7 days",
      value: formatKm(analytics.summary.last7DaysKm),
      context: `${analytics.summary.last7DaysRuns} runs`,
    },
    {
      label: "Easy share",
      value: `${analytics.intensityAdvice.currentEasyPct}%`,
      context: `Target ~${analytics.intensityAdvice.easyTargetPct}% easy`,
    },
  ];
}

function buildCharts(analytics: DashboardInsights): ReportChartSpec[] {
  const charts: ReportChartSpec[] = [];

  if (analytics.loadHistory.length >= 3) {
    charts.push({
      id: "load",
      title: "Fatigue & load balance",
      caption: "CTL vs ATL: gap indicates training stress balance.",
      whyItMatters:
        "When acute load (ATL) rises faster than fitness (CTL), late-race fade risk increases.",
    });
  }

  if (analytics.efficiencyTrend.length >= 4) {
    charts.push({
      id: "efficiency",
      title: "Aerobic efficiency",
      caption: "Lower index = faster pace at similar heart rate.",
      whyItMatters: "Improving efficiency suggests aerobic adaptation without extra intensity.",
    });
  }

  if (analytics.predictionTimeline.length >= 2) {
    charts.push({
      id: "prediction",
      title: "Prediction trajectory",
      caption: "Consensus race projections sampled over training blocks.",
      whyItMatters: "Direction of travel matters more than a single-week snapshot.",
    });
  }

  const vol = analytics.weeklyVolume.slice(-8);
  if (vol.length >= 4) {
    charts.push({
      id: "volume",
      title: "Weekly volume rhythm",
      caption: "Distance consistency underpins endurance readiness.",
      whyItMatters: "Stable volume bands reduce injury risk and support long-run progression.",
    });
  }

  return charts.slice(0, 4);
}

export function buildReportPageView(
  analytics: DashboardInsights,
  insights: Insight[] = [],
  quality: ImportQualityReport | null = null,
  recentRuns: {
    date: string;
    name: string;
    distanceM: number;
    paceSecPerKm?: number | null;
  }[] = [],
  raceGoal: RaceGoal | null = null,
): ReportPageView {
  const training = buildTrainingPageView(analytics, insights);
  const goals = buildGoalsPageView(analytics, raceGoal, insights);

  const prev = analytics.previousWeek;
  const executive = buildExecutive(analytics, training, goals);

  const raceLabel = analytics.raceReadiness
    ? `${analytics.raceReadiness.distanceLabel} · ${analytics.raceReadiness.daysUntilRace}d`
    : null;

  const volSpark = analytics.weeklyVolume.slice(-10).map((w) => w.distanceKm);

  const progressionNote =
    analytics.predictionTimeline.length >= 2
      ? (goals.historical.find((h) => h.label === "Projection trajectory")?.value ?? null)
      : null;

  const prHighlights = analytics.personalRecords.slice(0, 4).map((pr) => ({
    label: pr.label,
    value: `${formatDuration(pr.timeSec)} · ${formatPace(pr.paceSecPerKm)}`,
  }));

  return {
    meta: {
      generatedAt: new Date().toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      dateRangeLabel: analytics.summary.dateRange
        ? `${new Date(analytics.summary.dateRange.start).toLocaleDateString()} – ${new Date(analytics.summary.dateRange.end).toLocaleDateString()}`
        : null,
      runCount: analytics.summary.runCount,
      totalDistanceKm: formatKm(analytics.summary.totalDistanceKm),
      exportLabel: quality?.exportLabel ?? null,
    },
    executive,
    hero: {
      athleteState: training.hero.classification,
      trajectory: training.hero.trendLabel,
      recommendation: training.hero.recommendation,
      readinessScore: training.hero.readinessScore,
      readinessLabel: training.hero.readinessLabel,
      confidence: training.hero.confidence,
      confidenceLabel: training.explain.confidenceLabel,
      volumeSparkline: volSpark.length >= 2 ? volSpark : [18, 20, 22, 21, 24],
      daysUntilRace: analytics.raceReadiness?.daysUntilRace ?? null,
      raceLabel,
    },
    trainingState: {
      classification: training.hero.classification,
      narrative: analytics.weeklyNarrative,
      currentWeek: `${analytics.currentWeek.weekLabel}: ${formatKm(analytics.currentWeek.distanceKm)} (${analytics.currentWeek.runCount} runs)`,
      previousWeek: prev
        ? `${prev.weekLabel}: ${formatKm(prev.distanceKm)} (${prev.runCount} runs)`
        : null,
      consistency: `${analytics.consistencyScore.overall}/100 · ${analytics.consistencyScore.label}`,
      intensity: `${analytics.intensityAdvice.currentEasyPct}% easy · ${analytics.intensityAdvice.status.replace(/_/g, " ")}`,
    },
    signals: synthesizeSignals(analytics, insights),
    adaptation: {
      headline: training.adaptation.headline,
      interpretation: training.adaptation.interpretation,
      bullets: training.adaptation.evidence,
      progressionNote,
    },
    raceBriefing: buildRaceBriefing(analytics, goals),
    coaching: buildCoaching(training),
    metrics: buildMetrics(analytics),
    charts: buildCharts(analytics),
    history: {
      recentRuns: recentRuns.slice(0, 8).map((r) => ({
        date: new Date(r.date).toLocaleDateString(),
        name: r.name,
        distance: formatKm(r.distanceM / 1000),
        pace: r.paceSecPerKm ? formatPace(r.paceSecPerKm) : null,
      })),
      prHighlights,
      bestBlock: analytics.bestBlock
        ? `${analytics.bestBlock.label}: ${formatKm(analytics.bestBlock.distanceKm)}, longest ${analytics.bestBlock.longestRunKm} km`
        : null,
    },
    confidence: {
      overall: quality?.overallConfidence ?? analytics.dataConfidence,
      overallLabel:
        (quality?.overallConfidence ?? analytics.dataConfidence) === "high"
          ? "High"
          : (quality?.overallConfidence ?? analytics.dataConfidence) === "medium"
            ? "Medium-high"
            : "Medium",
      strongEvidence: [
        ...goals.projection.confidenceDrivers.slice(0, 3),
        ...training.explain.basedOn.slice(0, 2),
      ],
      missing: [...goals.projection.confidenceReducers.slice(0, 2), ...training.explain.missing],
      limitations: training.explain.limitations,
      fieldCoverage:
        quality?.fieldCoverage.map((f) => ({
          label: f.label,
          pct: f.total > 0 ? Math.round((f.count / f.total) * 100) : 0,
        })) ?? [],
    },
    hasPredictionTimeline: analytics.predictionTimeline.length >= 2,
    hasLoadHistory: analytics.loadHistory.length >= 3,
    hasEfficiencyTrend: analytics.efficiencyTrend.length >= 4,
    ecosystem:
      analytics.trainingEcosystem.totalContext.last28Days.nonRunSessions > 0
        ? buildReportEcosystemView(analytics)
        : null,
  };
}

/** @deprecated use buildReportPageView — kept for tests */
export function reportDistanceLabel(goal: RaceGoal | null): string {
  return goal ? RACE_DISTANCE_LABELS[goal.distance] : "Half marathon";
}

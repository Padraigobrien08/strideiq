import type { DashboardInsights } from "@/lib/analytics";
import type { PersonalRecord } from "@/lib/analytics/records";
import type { RacePredictionAnalysis, ConsensusPrediction } from "@/lib/analytics/predictions";
import { typicalErrorPct, type RegressionFit } from "@/lib/analytics/predictions";
import type { PrTimelinePoint } from "@/lib/analytics/progression";
import type { Insight } from "@/lib/insights/types";
import type { ImportQualityReport } from "@/lib/quality/assessImport";
import { buildProgressionView, type ProgressionViewModel } from "@/lib/home/dashboardData";
import { formatDuration, formatPace } from "@/lib/utils";
import type { ForecastV2View } from "@/lib/goals/forecastV2ViewModel";
import { isTrainingCurrent } from "@/lib/insights/consistency";
import { parseISO } from "date-fns";

/** How tightly the athlete's efforts sit on their fitted curve, stated as a limitation. */
function curveScatterLimitation(regression: RegressionFit | null): string {
  const pct = regression ? typicalErrorPct(regression) : null;
  if (pct === null) return "Single-anchor models widen uncertainty at longer distances.";
  return `Your efforts sit about ${pct.toFixed(1)}% off your fitted curve on average: wider spread when efforts disagree.`;
}

export type PerformanceSeverity = "positive" | "neutral" | "warning";

export interface PerformanceHeroView {
  classification: string;
  title: string;
  interpretation: string;
  recommendation: string;
  severity: PerformanceSeverity;
  confidence: "low" | "medium" | "high";
  strongestSignal: string;
  readinessScore: number;
  readinessLabel: string;
  trajectoryScore: number;
  trajectoryLabel: string;
  sparkline: number[];
  inlineMetrics: { label: string; value: string; hint?: string }[];
  projection: RaceProjectionSummary | null;
}

export interface RaceProjectionSummary {
  label: string;
  timeDisplay: string;
  rangeDisplay: string | null;
  confidenceLabel: string;
  confidence: "low" | "medium" | "high";
}

export type MilestoneCategory = "speed" | "endurance" | "consistency" | "race_execution";

export interface AchievementMilestoneView {
  id: string;
  category: MilestoneCategory;
  categoryLabel: string;
  title: string;
  timeDisplay: string;
  deltaDisplay: string | null;
  dateDisplay: string;
  runName: string;
  runId: string;
  confidence: "low" | "medium" | "high";
  triggers: string[];
}

export interface RaceProjectionView {
  primary: {
    label: string;
    distanceKm: number;
    timeDisplay: string;
    rangeDisplay: string;
    spreadDisplay: string;
    confidence: "low" | "medium" | "high";
    confidenceLabel: string;
    paceDisplay: string;
  } | null;
  allDistances: { label: string; timeDisplay: string; rangeDisplay: string | null }[];
  confidenceDrivers: string[];
  confidenceReducers: string[];
  pacingNote: string | null;
  fadeRisk: string | null;
  explanation: string[];
  effortCount: number;
  analysis: RacePredictionAnalysis;
}

export interface AdaptationTrendView {
  id: string;
  label: string;
  interpretation: string;
  data: number[];
  positive?: boolean;
  caption?: string;
}

export interface PerformanceDistributionView {
  interpretation: string;
  easyPct: number;
  easyTarget: number;
  hardRuns14d: number;
  zones: { zone: string; label: string; pct: number }[];
  correlations: string[];
}

export interface PerformanceIntegrityView {
  overallConfidence: "low" | "medium" | "high";
  predictionConfidence: "low" | "medium" | "high";
  basedOn: string[];
  missing: string[];
  limitations: string[];
  fieldCoverage: { label: string; pct: number; level: string }[];
}

export interface PerformancePageView {
  hero: PerformanceHeroView;
  progression: ProgressionViewModel;
  milestones: AchievementMilestoneView[];
  projection: RaceProjectionView;
  adaptationTrends: AdaptationTrendView[];
  distribution: PerformanceDistributionView;
  integrity: PerformanceIntegrityView;
}

function performanceInsights(insights: Insight[]): Insight[] {
  return insights.filter((i) => i.question === "improving" || i.question === "ready");
}

function trajectoryScore(analytics: DashboardInsights): {
  score: number;
  label: string;
} {
  let score = 52;
  const eff = analytics.efficiencySummary.trend;
  if (eff === "improving") score += 18;
  else if (eff === "declining") score -= 14;

  const pace = analytics.paceTrend
    .slice(-6)
    .map((p) => p.paceSecPerKm)
    .filter((v): v is number => v != null && v > 0);
  if (pace.length >= 2 && pace.at(-1)! < pace.at(-2)!) score += 12;
  else if (pace.length >= 2 && pace.at(-1)! > pace.at(-2)! * 1.02) score -= 8;

  if (analytics.consistencyScore.overall >= 70) score += 10;
  if (analytics.fatigue.formPct < -27) score -= 10;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label =
    score >= 72 ? "Upward trajectory" : score >= 55 ? "Stable trajectory" : "Softening trajectory";
  return { score, label };
}

function classifyPerformance(analytics: DashboardInsights): {
  classification: string;
  severity: PerformanceSeverity;
} {
  const eff = analytics.efficiencySummary.trend;
  const { score } = trajectoryScore(analytics);
  if (eff === "improving" && score >= 65) {
    return { classification: "Trending upward", severity: "positive" };
  }
  if (eff === "declining" || score < 45) {
    return { classification: "Trajectory softening", severity: "warning" };
  }
  return { classification: "Steady development", severity: "neutral" };
}

function pickPrimaryProjection(
  analysis: RacePredictionAnalysis,
  analytics: DashboardInsights,
): ConsensusPrediction | null {
  if (analysis.consensus.length === 0) return null;
  const goalDist = analytics.raceReadiness?.distance;
  if (goalDist) {
    const key =
      goalDist === "hm"
        ? "Half Marathon"
        : goalDist === "marathon"
          ? "Marathon"
          : goalDist === "10k"
            ? "10K"
            : "5K";
    return (
      analysis.consensus.find((c) => c.label === key) ??
      analysis.consensus.find((c) => c.label.includes("Half")) ??
      analysis.consensus[0]
    );
  }
  return analysis.consensus.find((c) => c.label === "Half Marathon") ?? analysis.consensus[0];
}

function formatProjectionRange(c: ConsensusPrediction): string | null {
  if (c.spreadSec <= 30) return null;
  const half = Math.round(c.spreadSec / 2);
  return `±${formatDuration(half)}`;
}

function priorPrForRecord(pr: PersonalRecord, timeline: PrTimelinePoint[]): PrTimelinePoint | null {
  const improvements = timeline
    .filter((p) => p.bucket === pr.bucket && p.isNewPr)
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime());
  const idx = improvements.findIndex(
    (p) => p.runId === pr.runId && Math.abs(p.timeSec - pr.timeSec) < 2,
  );
  if (idx <= 0) return null;
  return improvements[idx - 1] ?? null;
}

function prCategory(bucket: string): MilestoneCategory {
  if (bucket === "5k" || bucket === "10k") return "speed";
  if (bucket === "long") return "endurance";
  return "endurance";
}

const categoryLabels: Record<MilestoneCategory, string> = {
  speed: "Speed",
  endurance: "Endurance",
  consistency: "Consistency",
  race_execution: "Race execution",
};

function buildMilestoneTriggers(pr: PersonalRecord, analytics: DashboardInsights): string[] {
  const triggers: string[] = [];
  if (analytics.bestBlock) {
    triggers.push(`Strong ${analytics.bestBlock.label} volume block`);
  }
  if (analytics.efficiencySummary.trend === "improving") {
    triggers.push("Improved aerobic efficiency at comparable HR");
  }
  if (analytics.fatigue.freshness >= 55) {
    triggers.push(`Stable freshness (${analytics.fatigue.freshness}/100)`);
  }
  if (analytics.consistencyScore.overall >= 65) {
    triggers.push(`${analytics.consistencyScore.label} weekly consistency`);
  }
  if (triggers.length === 0) {
    triggers.push("Quality effort detected in recent training");
  }
  return triggers.slice(0, 3);
}

function buildMilestones(
  analytics: DashboardInsights,
  insights: Insight[],
): AchievementMilestoneView[] {
  const timeline = analytics.prTimeline;
  const items: AchievementMilestoneView[] = [];

  for (const pr of analytics.personalRecords.filter((p) =>
    ["5k", "10k", "hm", "long"].includes(p.bucket),
  )) {
    const prior = priorPrForRecord(pr, timeline);
    let deltaDisplay: string | null = null;
    if (prior) {
      const deltaSec = pr.timeSec - prior.timeSec;
      if (deltaSec < 0) {
        deltaDisplay = `${formatDuration(Math.abs(deltaSec))} faster than prior best`;
      }
    }
    items.push({
      id: pr.bucket + pr.runId,
      category: prCategory(pr.bucket),
      categoryLabel: categoryLabels[prCategory(pr.bucket)],
      title: pr.bucket === "long" ? "Longest run" : `New ${pr.label} PR`,
      timeDisplay: formatDuration(pr.timeSec),
      deltaDisplay,
      dateDisplay: new Date(pr.date).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      runName: pr.runName,
      runId: pr.runId,
      confidence:
        pr.source === "segment" || pr.source === "laps" ? "high" : analytics.dataConfidence,
      triggers: buildMilestoneTriggers(pr, analytics),
    });
  }

  if (analytics.consistencyScore.overall >= 75) {
    items.push({
      id: "consistency-milestone",
      category: "consistency",
      categoryLabel: categoryLabels.consistency,
      title: "Consistency milestone",
      timeDisplay: `${analytics.consistencyScore.overall}/100`,
      deltaDisplay: analytics.consistencyScore.label,
      dateDisplay: "Current block",
      runName: "",
      runId: "",
      confidence: analytics.dataConfidence,
      triggers: [
        `${analytics.currentWeek.runCount} runs this week`,
        analytics.consistencyScore.evidence?.[0] ?? "Regular weekly rhythm",
      ],
    });
  }

  const prInsight = insights.find((i) => i.id.startsWith("new-pr"));
  if (prInsight && !items.some((m) => m.title.includes("PR"))) {
    items.unshift({
      id: "insight-pr",
      category: "race_execution",
      categoryLabel: categoryLabels.race_execution,
      title: prInsight.title,
      timeDisplay: prInsight.evidence[0] ?? "Recent breakthrough",
      deltaDisplay: null,
      dateDisplay: "Recent",
      runName: "",
      runId: "",
      confidence: prInsight.confidence,
      triggers: prInsight.evidence.slice(1, 4),
    });
  }

  return items.slice(0, 8);
}

function buildProjectionView(analytics: DashboardInsights): RaceProjectionView {
  const analysis = analytics.racePredictionAnalysis;
  const primary = pickPrimaryProjection(analysis, analytics);

  const confidenceDrivers: string[] = [];
  const confidenceReducers: string[] = [];

  if (analysis.efforts.length >= 3) {
    confidenceDrivers.push(`${analysis.efforts.length} quality efforts in model`);
  }
  if (analytics.efficiencySummary.trend === "improving") {
    confidenceDrivers.push("Stable or improving aerobic efficiency");
  }
  // `bestBlock` only says a strong block exists somewhere in the history, which
  // says nothing about recent volume: the live account listed this as a
  // confidence driver on a page also reporting 4-week volume down 77%.
  const volumePct = (analytics.raceReadiness ?? analytics.halfMarathonReadiness)?.volumePct ?? 0;
  if (analytics.bestBlock && isTrainingCurrent(analytics.fatigue) && volumePct >= 60) {
    confidenceDrivers.push("Sufficient recent 4-week volume");
  }
  if (analytics.consistencyScore.overall >= 65) {
    confidenceDrivers.push("Consistent weekly run frequency");
  }

  if (analysis.confidence === "low") {
    confidenceReducers.push("Limited comparable race-effort data");
  }
  if (analytics.fatigue.usesProxyLoad) {
    confidenceReducers.push("Incomplete training load on activities");
  }
  if (analytics.hrZones.reduce((s, z) => s + z.runCount, 0) < 15) {
    confidenceReducers.push("Sparse HR-tagged efforts for intensity calibration");
  }
  const hardPct = 100 - analytics.intensityAdvice.currentEasyPct;
  if (hardPct > 25) {
    confidenceReducers.push("Limited race-specific sharpening in recent block");
  }

  const confidenceLabel =
    analysis.confidence === "high"
      ? "High"
      : analysis.confidence === "medium"
        ? "Medium-high"
        : "Medium";

  let pacingNote: string | null = null;
  let fadeRisk: string | null = null;
  if (primary) {
    const pace = primary.timeSec / primary.distanceKm;
    pacingNote = `Even-effort pacing ~${formatPace(pace)} avg. Adjust for course and conditions.`;
    if (primary.distanceKm >= 20 && analytics.fatigue.formPct < -21) {
      fadeRisk = "Elevated fatigue may increase late-race fade risk vs projection.";
    } else if (primary.distanceKm >= 20) {
      fadeRisk =
        "Moderate fade risk if fueling or heat are unmanaged; projection assumes steady effort.";
    }
  }

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
          spreadDisplay: formatProjectionRange(primary) ?? "narrow band",
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
    confidenceDrivers: confidenceDrivers.slice(0, 4),
    confidenceReducers: confidenceReducers.slice(0, 4),
    pacingNote,
    fadeRisk,
    explanation: analysis.explanation,
    effortCount: analysis.efforts.length,
    analysis,
  };
}

function buildAdaptationTrends(
  analytics: DashboardInsights,
  progression: ProgressionViewModel,
): AdaptationTrendView[] {
  const mom = analytics.efficiencyMoM;
  return [
    {
      id: "efficiency",
      label: "Aerobic efficiency",
      interpretation:
        mom.narrative ??
        (analytics.efficiencySummary.trend === "improving"
          ? "Pace÷HR index improving: faster at similar heart rates."
          : "Track easy runs with HR for clearer efficiency signal."),
      data: progression.trends.efficiency.data,
      positive: progression.trends.efficiency.positive,
      caption: progression.trends.efficiency.caption,
    },
    {
      id: "pace",
      label: "Pace velocity",
      interpretation: progression.trends.pace.positive
        ? "Recent runs trending faster: speed responding to training."
        : "Pace stable or easing: may reflect fatigue, heat, or intentional easy running.",
      data: progression.trends.pace.data,
      positive: progression.trends.pace.positive,
    },
    {
      id: "volume",
      label: "Volume consistency",
      interpretation: `Weekly volume ${progression.trends.volume.positive ? "holding or building" : "softening"}: endurance base ${progression.trends.volume.positive ? "supported" : "needs attention"}.`,
      data: progression.trends.volume.data,
      positive: progression.trends.volume.positive,
    },
    {
      id: "consistency",
      label: "Training rhythm",
      interpretation: `${analytics.consistencyScore.overall}/100 consistency: ${analytics.consistencyScore.label.toLowerCase()}.`,
      data: analytics.weeklyVolume.slice(-10).map((w) => w.runCount),
      positive: analytics.consistencyScore.overall >= 65,
      caption: `${analytics.currentWeek.runCount} runs this week`,
    },
  ];
}

function buildDistribution(analytics: DashboardInsights): PerformanceDistributionView {
  const adv = analytics.intensityAdvice;
  const correlations: string[] = [];
  // The distribution below is real, but with nothing run this week it belongs
  // to the last block: say so instead of reading it as the current balance.
  const paused = adv.status === "paused";
  if (paused) {
    correlations.push(
      "This distribution is from your last block: nothing has been run in the last 7 days.",
    );
  }
  if (!paused && analytics.efficiencySummary.trend === "improving" && adv.currentEasyPct >= 70) {
    correlations.push(
      "Recent gains align with a strong easy-volume base and controlled hard-session density.",
    );
  }
  if (adv.status === "too_hard") {
    correlations.push(
      "Hard-run share is elevated: threshold work may be outpacing recovery for current freshness.",
    );
  }
  if (correlations.length === 0) {
    correlations.push(
      "Balanced intensity distribution supports sustainable progression when freshness is stable.",
    );
  }

  return {
    interpretation: correlations[0],
    easyPct: adv.currentEasyPct,
    easyTarget: adv.easyTargetPct,
    hardRuns14d: adv.hardRunsLast14d,
    zones: analytics.hrZones.slice(0, 5).map((z) => ({
      zone: z.zone,
      label: z.label,
      pct: z.pct,
    })),
    correlations,
  };
}

function buildIntegrity(
  analytics: DashboardInsights,
  quality: ImportQualityReport | null,
  projection: RaceProjectionView,
): PerformanceIntegrityView {
  const basedOn: string[] = [
    `${analytics.summary.runCount} runs in export`,
    `${projection.effortCount} efforts feeding race models`,
    `Data confidence: ${analytics.dataConfidence}`,
  ];
  if (analytics.fitRunCount > 0) {
    basedOn.push(`${analytics.fitRunCount} FIT-backed activities for segments`);
  }

  const missing: string[] = [...projection.confidenceReducers];
  if (quality) {
    quality.warnings.slice(0, 2).forEach((w) => missing.push(w));
  }
  missing.push("Power meter streams", "Sleep & HRV recovery");

  return {
    overallConfidence: analytics.dataConfidence,
    predictionConfidence:
      projection.primary?.confidence ?? analytics.racePredictionAnalysis.confidence,
    basedOn,
    missing: [...new Set(missing)].slice(0, 5),
    limitations: [
      "Projections are evidence-based estimates, not guarantees.",
      "Course, weather, fueling, and taper execution materially affect race day.",
      // Was "Curve fit R² = 0.99", which reads as a quality score and is not one: the
      // log axes are collinear, so R² clears 0.9 on effort sets that fit badly. Typical
      // scatter says the thing the athlete was being told this number meant.
      curveScatterLimitation(analytics.racePredictionAnalysis.regression),
    ],
    fieldCoverage: (quality?.fieldCoverage ?? []).slice(0, 4).map((f) => ({
      label: f.label,
      pct: f.total > 0 ? Math.round((f.count / f.total) * 100) : 0,
      level: f.level,
    })),
  };
}

/** Parse a formatDuration string ("1h 37m", "23m 46s", "4h 16m") back to seconds. */
function parseDurationToSec(display: string): number | null {
  const h = display.match(/(\d+)\s*h/);
  const m = display.match(/(\d+)\s*m/);
  const s = display.match(/(\d+)\s*s/);
  if (!h && !m && !s) return null;
  return (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (s ? Number(s[1]) : 0);
}

function forecastConfidenceLevel(label: string): "low" | "medium" | "high" {
  const l = label.toLowerCase();
  if (l.includes("high")) return "high";
  if (l.startsWith("medium")) return "medium";
  return "low";
}

/**
 * Race forecasts must agree across surfaces. When the canonical forecastV2 (the
 * same engine the Goals page uses) is available, it overrides the older
 * Riegel/consensus projection so Performance and Goals never show different
 * finish times for the same race.
 */
function applyCanonicalForecast(
  projection: RaceProjectionView,
  forecast: ForecastV2View,
  goalDistanceKm: number | null,
): RaceProjectionView {
  const totalSec = parseDurationToSec(forecast.mostLikely);
  const paceDisplay =
    totalSec != null && goalDistanceKm && goalDistanceKm > 0
      ? `${formatPace(totalSec / goalDistanceKm)}`
      : (projection.primary?.paceDisplay ?? "");

  const primary: RaceProjectionView["primary"] = {
    label: forecast.distanceLabel,
    distanceKm: goalDistanceKm ?? projection.primary?.distanceKm ?? 0,
    timeDisplay: forecast.mostLikely,
    rangeDisplay: forecast.rangeDisplay,
    // forecastV2 communicates uncertainty via the innerLowSec–innerHighSec band (rangeDisplay),
    // not a symmetric ± spread — so no separate spread token.
    spreadDisplay: "",
    confidence: forecastConfidenceLevel(forecast.confidence),
    confidenceLabel: forecast.confidence,
    paceDisplay,
  };

  // Keep the cross-distance table consistent with the canonical headline
  // (labels differ in case: "Half Marathon" vs forecast's "Half marathon").
  const allDistances = projection.allDistances.map((d) =>
    d.label.toLowerCase() === forecast.distanceLabel.toLowerCase()
      ? { ...d, timeDisplay: forecast.mostLikely, rangeDisplay: forecast.rangeDisplay }
      : d,
  );

  return { ...projection, primary, allDistances };
}

export function buildPerformancePageView(
  analytics: DashboardInsights,
  insights: Insight[] = [],
  quality: ImportQualityReport | null = null,
  opts?: { forecast?: ForecastV2View | null; goalDistanceKm?: number | null },
): PerformancePageView {
  const related = performanceInsights(insights);
  const top = related[0];
  const { classification, severity } = classifyPerformance(analytics);
  const traj = trajectoryScore(analytics);
  const readiness = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  const progression = buildProgressionView(analytics, insights);
  let projection = buildProjectionView(analytics);
  if (opts?.forecast?.enabled) {
    projection = applyCanonicalForecast(projection, opts.forecast, opts.goalDistanceKm ?? null);
  }

  const effMom = analytics.efficiencyMoM;
  const strongestSignal =
    top?.title ??
    (analytics.prTimeline.some((p) => p.isNewPr)
      ? "Recent PR breakthrough in timeline"
      : effMom.narrative
        ? "Efficiency shift vs prior month"
        : progression.trajectory);

  const primaryProj = projection.primary;
  const heroProjection: RaceProjectionSummary | null = primaryProj
    ? {
        label: primaryProj.label,
        timeDisplay: primaryProj.timeDisplay,
        rangeDisplay: primaryProj.spreadDisplay.startsWith("±") ? primaryProj.spreadDisplay : null,
        confidenceLabel: primaryProj.confidenceLabel,
        confidence: primaryProj.confidence,
      }
    : null;

  const paceSpark = analytics.paceTrend
    .slice(-12)
    .map((p) => p.paceSecPerKm ?? 0)
    .filter((v) => v > 0)
    .map((pace) => 300 - pace / 10);

  return {
    hero: {
      classification,
      title:
        classification === "Trending upward"
          ? "Performance trending upward"
          : classification === "Trajectory softening"
            ? "Performance needs consolidation"
            : "Performance holding steady",
      interpretation:
        effMom.narrative ??
        progression.trajectory ??
        top?.evidence[0] ??
        `${readiness.label} · ${analytics.efficiencySummary.trend ?? "stable"} efficiency trend.`,
      recommendation:
        top?.recommendation ??
        analytics.intensityAdvice.recommendations[0] ??
        "Maintain aerobic base; add quality only when freshness supports it.",
      severity,
      confidence: analytics.dataConfidence,
      strongestSignal,
      readinessScore: readiness.score,
      readinessLabel: readiness.label,
      trajectoryScore: traj.score,
      trajectoryLabel: traj.label,
      sparkline:
        paceSpark.length >= 2
          ? paceSpark
          : analytics.efficiencyTrend.slice(-10).map((e) => e.efficiency * 100),
      inlineMetrics: [
        {
          label: "Trajectory",
          value: String(traj.score),
          hint: traj.label,
        },
        {
          label: "Readiness",
          value: String(readiness.score),
          hint: readiness.label,
        },
        {
          label: "Efficiency",
          value:
            analytics.efficiencySummary.trend === "improving"
              ? "Improving"
              : analytics.efficiencySummary.trend === "declining"
                ? "Softening"
                : "Stable",
          hint:
            effMom.pctChange != null
              ? `${effMom.pctChange > 0 ? "+" : ""}${effMom.pctChange}% MoM`
              : undefined,
        },
      ],
      projection: heroProjection,
    },
    progression,
    milestones: buildMilestones(analytics, insights),
    projection,
    adaptationTrends: buildAdaptationTrends(analytics, progression),
    distribution: buildDistribution(analytics),
    integrity: buildIntegrity(analytics, quality, projection),
  };
}

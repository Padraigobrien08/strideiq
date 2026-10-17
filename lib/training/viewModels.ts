import type { DashboardInsights } from "@/lib/analytics";
import {
  buildTrainingEcosystemView,
  type TrainingEcosystemView,
} from "@/lib/training/ecosystemViewModel";
import type { FatigueSnapshot } from "@/lib/analytics/fatigue";
import type { Insight } from "@/lib/insights/types";
import type { WeekPlan, PlannedSession } from "@/lib/training/planEngine";
import { formatKm, formatKmRange, formatKmValue } from "@/lib/utils";
import { WORKOUT_TYPE_LABELS } from "@/lib/analytics/workoutType";
import type { WorkoutType } from "@/lib/analytics/workoutType";
import { isTrainingCurrent, stalenessClause } from "@/lib/insights/consistency";

export type TrainingStateSeverity = "positive" | "neutral" | "warning" | "critical";

export interface TrainingStateHeroView {
  classification: string;
  title: string;
  interpretation: string;
  recommendation: string;
  severity: TrainingStateSeverity;
  confidence: "low" | "medium" | "high";
  readinessScore: number;
  readinessLabel: string;
  raceContext: string | null;
  freshness: number;
  freshnessLabel: string;
  loadSparkline: number[];
  trendLabel: string;
  inlineMetrics: { label: string; value: string; hint?: string }[];
}

export interface PlanSessionView {
  day: string;
  type: WorkoutType;
  typeLabel: string;
  kmRange: string;
  goal: string;
  loadScore: number;
  isKey: boolean;
}

export interface AdaptiveWeekPlanView {
  weekLabel: string;
  template: string;
  templateLabel: string;
  isTaper: boolean;
  isRaceWeek: boolean;
  isRecovery: boolean;
  totalKmLabel: string;
  estimatedLoad: number;
  loadVsLastWeek: string | null;
  confidence: "low" | "medium" | "high";
  rationale: string[];
  warnings: string[];
  sessions: PlanSessionView[];
}

export type LoadStateChip =
  "Fresh" | "Neutral" | "Accumulating fatigue" | "Recovery trend" | "High adaptation window";

export interface LoadIntelligenceView {
  freshness: number;
  freshnessLabel: string;
  interpretation: string;
  stateChips: LoadStateChip[];
  ctl: number;
  atl: number;
  tsb: number;
  restDays: number;
  chartData: { label: string; ctl: number; atl: number; tsb: number }[];
  currentIndex: number;
  trendNote: string;
  evidence: string[];
}

export interface AdaptationSignalView {
  headline: string;
  interpretation: string;
  trendLabel: string;
  deltaPct: number | null;
  comparablePeriod: string | null;
  confidence: "low" | "medium" | "high";
  trend: "improving" | "declining" | "stable" | null;
  chartData: { label: string; efficiency: number }[];
  evidence: string[];
}

export interface CoachingExplainView {
  confidenceLabel: string;
  confidence: "low" | "medium" | "high";
  basedOn: string[];
  missing: string[];
  limitations: string[];
  recommendationWhy: string;
}

export interface TrainingBlockRow {
  label: string;
  distanceKm: string;
  runCount: number;
  longestRunKm: string;
  highlight?: boolean;
}

export interface SupportingAnalyticsView {
  elevationAvg: string | null;
  elevationChart: { label: string; gainPerKm: number }[];
  blocks: TrainingBlockRow[];
  bestBlock: string | null;
}

export interface TrainingPageView {
  hero: TrainingStateHeroView;
  plan: AdaptiveWeekPlanView;
  load: LoadIntelligenceView;
  ecosystem: TrainingEcosystemView;
  adaptation: AdaptationSignalView;
  explain: CoachingExplainView;
  supporting: SupportingAnalyticsView;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function trainingInsights(insights: Insight[]): Insight[] {
  return insights.filter(
    (i) =>
      i.question === "training" ||
      i.question === "next" ||
      i.question === "ready" ||
      i.id === "fatigue-high" ||
      i.id === "intensity-heavy" ||
      i.id === "next-week-plan",
  );
}

function classifyState(
  fatigue: FatigueSnapshot,
  analytics: DashboardInsights,
): { classification: string; severity: TrainingStateSeverity } {
  const adv = analytics.intensityAdvice;
  // Branch on the axes rather than the display string: the label can now read
  // Rusty / Detrained / Returning, which a `=== "Fresh"` test would silently
  // treat as neither fresh nor fatigued.
  const { balance, currency } = fatigue.readiness;
  const stale = currency === "rusty" || currency === "detrained" || currency === "returning";

  if (stale) {
    return {
      classification: currency === "returning" ? "Returning to running" : "Training not current",
      severity: "warning",
    };
  }
  if (balance === "fatigued" || fatigue.formPct < -27) {
    return { classification: "Load accumulation", severity: "warning" };
  }
  if (adv.status === "too_hard") {
    return { classification: "Intensity elevated", severity: "warning" };
  }
  if (balance === "fresh" && analytics.efficiencySummary.trend === "improving") {
    return { classification: "Fresh & adapting", severity: "positive" };
  }
  if (balance === "fresh") {
    return { classification: "Fresh", severity: "positive" };
  }
  if (analytics.efficiencySummary.trend === "improving") {
    return { classification: "Adapting well", severity: "positive" };
  }
  return { classification: "Steady block", severity: "neutral" };
}

function heroTitle(
  classification: string,
  analytics: DashboardInsights,
  top: Insight | undefined,
): string {
  if (top?.title) return top.title;
  const readiness = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  if (classification === "Fresh & adapting") {
    return `Fresh and adapting: ${readiness.label.toLowerCase()}`;
  }
  if (classification === "Load accumulation") {
    return "Fatigue building: ease intensity";
  }
  return readiness.label;
}

function estimateSessionLoad(s: PlannedSession): number {
  const mid = (s.distanceKmRange[0] + s.distanceKmRange[1]) / 2;
  const mult =
    s.type === "long"
      ? 1.35
      : s.type === "tempo" || s.type === "interval"
        ? 1.2
        : s.type === "easy"
          ? 0.9
          : 0.75;
  return Math.round(mid * 10 * mult);
}

function buildPlanView(plan: WeekPlan, analytics: DashboardInsights): AdaptiveWeekPlanView {
  const lo = round1(plan.totalKmRange[0]);
  const hi = round1(plan.totalKmRange[1]);
  const estimatedLoad = plan.sessions.reduce((s, sess) => s + estimateSessionLoad(sess), 0);
  const lastKm = analytics.previousWeek?.distanceKm ?? analytics.currentWeek.distanceKm;
  const midPlan = (lo + hi) / 2;
  const loadVs =
    lastKm > 0
      ? `${midPlan >= lastKm ? "+" : ""}${Math.round(((midPlan - lastKm) / lastKm) * 100)}% vs last week`
      : null;

  const templateLabel =
    plan.template === "race_week" ? "race week" : plan.template.replace(/_/g, " ");
  const keyTypes: WorkoutType[] = ["long", "tempo", "interval", "race"];

  return {
    weekLabel: plan.weekLabel,
    template: plan.template,
    templateLabel,
    isTaper: plan.template === "taper" || plan.template === "race_week",
    isRaceWeek: plan.template === "race_week",
    isRecovery: plan.template === "recovery",
    totalKmLabel: formatKmRange(lo, hi),
    estimatedLoad,
    loadVsLastWeek: loadVs,
    confidence: analytics.dataConfidence,
    rationale: plan.rationale,
    warnings: plan.warnings,
    sessions: plan.sessions.map((s) => ({
      day: s.day ?? "—",
      type: s.type,
      typeLabel: WORKOUT_TYPE_LABELS[s.type],
      kmRange: formatKmRange(round1(s.distanceKmRange[0]), round1(s.distanceKmRange[1])),
      goal: s.description,
      loadScore: estimateSessionLoad(s),
      isKey: keyTypes.includes(s.type),
    })),
  };
}

function loadStateChips(
  fatigue: FatigueSnapshot,
  history: DashboardInsights["loadHistory"],
): LoadStateChip[] {
  const chips: LoadStateChip[] = [];
  const { balance, currency } = fatigue.readiness;
  const current = currency === "current" || currency === "light-gap";
  // A stale athlete must not be chipped "Fresh" on load balance alone.
  if (balance === "fresh" && current) chips.push("Fresh");
  if (balance === "neutral") chips.push("Neutral");
  if (fatigue.formPct < -17) chips.push("Accumulating fatigue");
  if (history.length >= 3) {
    const prev = history.at(-2);
    const cur = history.at(-1);
    if (prev && cur && cur.atl < prev.atl) chips.push("Recovery trend");
  }
  if (fatigue.formPct >= -21 && fatigue.formPct <= 4 && fatigue.ctl > 20) {
    chips.push("High adaptation window");
  }
  return [...new Set(chips)];
}

function loadInterpretation(fatigue: FatigueSnapshot): string {
  const { balance, currency } = fatigue.readiness;
  // The positive balance of a layoff is not a green light, so this has to be
  // checked before the freshness branch below.
  if (currency === "rusty" || currency === "detrained" || currency === "returning") {
    return `Your balance looks positive only because training stopped: ${fatigue.restDaysSinceLastRun} days since the last run. Rebuild easy volume before any quality work.`;
  }
  if (balance === "fresh" && fatigue.formPct > 8) {
    return "You have positive training balance. Quality sessions are well supported if feel matches the data.";
  }
  if (balance === "fatigued") {
    return "Acute load is outpacing recovery. Prioritize easy volume and sleep before adding intensity.";
  }
  if (fatigue.formPct < -15) {
    return "Fatigue is accumulating; keep hard sessions spaced and watch for declining efficiency.";
  }
  return "Load is in a neutral band. Steady progression is appropriate with one quality touchpoint.";
}

function loadTrendNote(history: DashboardInsights["loadHistory"]): string {
  if (history.length < 2) return "Building load history from your export.";
  const prev = history.at(-2)!;
  const cur = history.at(-1)!;
  const atlDelta = cur.atl - prev.atl;
  const ctlDelta = cur.ctl - prev.ctl;
  if (atlDelta > 5 && ctlDelta >= 0) {
    return "Acute load rising faster than chronic fitness. Recovery matters this week.";
  }
  if (atlDelta < -3) return "Acute load easing: recovery trend in progress.";
  if (ctlDelta > 3) return "Fitness (CTL) trending up: adaptation window if freshness holds.";
  return "Load stable week over week.";
}

function z3z5Pct(analytics: DashboardInsights): number | null {
  const zones = analytics.hrZones;
  if (!zones?.length) return null;
  const z3 = zones.find((z) => z.zone === "Z3")?.pct ?? 0;
  const z4 = zones.find((z) => z.zone === "Z4")?.pct ?? 0;
  const z5 = zones.find((z) => z.zone === "Z5")?.pct ?? 0;
  return Math.round(z3 + z4 + z5);
}

function buildExplain(
  analytics: DashboardInsights,
  plan: WeekPlan,
  related: Insight[],
): CoachingExplainView {
  const hrSupported = analytics.hrZones.reduce((s, z) => s + z.runCount, 0);
  const zPct = z3z5Pct(analytics);

  const basedOn: string[] = [
    `${hrSupported} HR-supported runs (${analytics.summary.runCount} total in export)`,
    `Freshness ${analytics.fatigue.freshness}/100 (${analytics.fatigue.label})`,
    `TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${analytics.fatigue.tsb}`,
    `${analytics.consistencyScore.overall}/100 consistency (${analytics.consistencyScore.label})`,
  ];
  if (zPct !== null) basedOn.push(`Z3–Z5 share ~${zPct}% of HR-tagged efforts`);
  if (analytics.previousWeek) {
    basedOn.push(
      `Last week ${formatKm(analytics.previousWeek.distanceKm)} (${analytics.previousWeek.runCount} runs)`,
    );
  }
  plan.rationale.slice(0, 2).forEach((r) => basedOn.push(r));

  const missing: string[] = [];
  if (analytics.fatigue.usesProxyLoad) {
    missing.push("Reliable training load on most activities");
  }
  if (analytics.dataConfidence === "low") {
    missing.push("Larger run history for stable trends");
  }
  missing.push("Sleep, HRV, and subjective recovery");

  const limitations: string[] = [
    "Recommendations are heuristic: confirm with feel, soreness, and life stress.",
    "Race plans assume your stated goal date and recent volume are accurate.",
  ];
  if (
    analytics.intensityAdvice.status === "insufficient_data" ||
    analytics.intensityAdvice.status === "paused"
  ) {
    limitations.push("Limited recent running: plan is conservative until volume returns.");
  }

  const top = related[0];
  const confidence = top?.confidence ?? analytics.dataConfidence;
  const confidenceLabel =
    confidence === "high" ? "High" : confidence === "medium" ? "Medium-high" : "Medium";

  return {
    confidenceLabel,
    confidence,
    basedOn: basedOn.slice(0, 6),
    missing,
    limitations,
    recommendationWhy:
      top?.recommendation ??
      plan.rationale[0] ??
      analytics.intensityAdvice.recommendations[0] ??
      "Plan balances freshness, intensity distribution, and race timing.",
  };
}

export function buildTrainingPageView(
  analytics: DashboardInsights,
  insights: Insight[] = [],
): TrainingPageView {
  const related = trainingInsights(insights);
  const top = related[0];
  const { classification, severity } = classifyState(analytics.fatigue, analytics);
  const readiness = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  const plan = analytics.nextWeekPlan;
  const loadSparkline = analytics.loadHistory.slice(-12).map((h) => h.ctl);

  const raceContext = analytics.raceReadiness
    ? `${analytics.raceReadiness.distanceLabel} in ${analytics.raceReadiness.daysUntilRace}d · ${analytics.raceReadiness.score}/100 readiness`
    : null;

  const hero: TrainingStateHeroView = {
    classification,
    title: heroTitle(classification, analytics, top),
    interpretation:
      analytics.weeklyNarrative.paragraphs[0] ||
      top?.evidence[0] ||
      `${readiness.score}/100 readiness · ${analytics.fatigue.label} recovery · ${analytics.consistencyScore.label} consistency.`,
    recommendation:
      top?.recommendation ??
      plan.rationale[0] ??
      analytics.intensityAdvice.recommendations[0] ??
      "Follow the adaptive week below. Adjust by feel.",
    severity,
    confidence: analytics.dataConfidence,
    readinessScore: readiness.score,
    readinessLabel: readiness.label,
    raceContext,
    freshness: analytics.fatigue.freshness,
    freshnessLabel: analytics.fatigue.label,
    loadSparkline,
    trendLabel: `CTL ${analytics.fatigue.ctl} · TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${analytics.fatigue.tsb}`,
    inlineMetrics: [
      {
        label: "Freshness",
        value: String(analytics.fatigue.freshness),
        hint: analytics.fatigue.label,
      },
      {
        label: "Easy %",
        value: `${Math.round(analytics.intensityAdvice.currentEasyPct)}%`,
        hint: `target ~${analytics.intensityAdvice.easyTargetPct}%`,
      },
      {
        label: "This week",
        value: formatKm(analytics.currentWeek.distanceKm),
        hint: `${analytics.currentWeek.runCount} runs`,
      },
    ],
  };

  const chartData = analytics.loadHistory.map((h) => ({
    label: h.label,
    ctl: h.ctl,
    atl: h.atl,
    tsb: h.ctl - h.atl,
  }));

  const mom = analytics.efficiencyMoM;
  // The efficiency reading is only as current as the running behind it. After a
  // layoff it is a record of where the athlete left off, so it cannot be a
  // present-tense trend and fatigue cannot be the thing to check.
  const trainingCurrent = isTrainingCurrent(analytics.fatigue);
  const gap = stalenessClause(analytics.fatigue);
  const adaptationHeadline = !trainingCurrent
    ? `Aerobic efficiency untested: last read before ${gap}`
    : analytics.efficiencySummary.trend === "improving"
      ? "Aerobic efficiency improving"
      : analytics.efficiencySummary.trend === "declining"
        ? "Efficiency slipping: check fatigue"
        : "Aerobic efficiency stable";

  const adaptationInterp = !trainingCurrent
    ? `Where you left off: ${
        analytics.efficiencySummary.trend === "declining"
          ? "the trend was softening"
          : analytics.efficiencySummary.trend === "improving"
            ? "the trend was improving"
            : "the trend was flat"
      }. Re-measure it over your first two weeks back before reading anything into it.`
    : (mom.narrative ??
      (analytics.efficiencySummary.trend === "improving"
        ? "You are tending to run faster at similar heart rates versus your prior block."
        : "Efficiency index tracks pace÷HR: lower is better. Needs more HR-tagged runs for precision."));

  return {
    hero,
    plan: buildPlanView(plan, analytics),
    load: {
      freshness: analytics.fatigue.freshness,
      freshnessLabel: analytics.fatigue.label,
      interpretation: loadInterpretation(analytics.fatigue),
      stateChips: loadStateChips(analytics.fatigue, analytics.loadHistory),
      ctl: analytics.fatigue.ctl,
      atl: analytics.fatigue.atl,
      tsb: analytics.fatigue.tsb,
      restDays: analytics.fatigue.restDaysSinceLastRun,
      chartData,
      currentIndex: Math.max(0, chartData.length - 1),
      trendNote: loadTrendNote(analytics.loadHistory),
      evidence: analytics.fatigue.evidence,
    },
    adaptation: {
      headline: adaptationHeadline,
      interpretation: adaptationInterp,
      trendLabel:
        analytics.efficiencySummary.trend === "improving"
          ? "Improving"
          : analytics.efficiencySummary.trend === "declining"
            ? "Declining"
            : "Stable",
      deltaPct: mom.pctChange,
      comparablePeriod:
        mom.currentMonth && mom.priorMonth ? `${mom.priorMonth} → ${mom.currentMonth}` : null,
      confidence: analytics.dataConfidence,
      trend: analytics.efficiencySummary.trend,
      chartData: analytics.efficiencyTrend.slice(-16).map((p) => ({
        label: p.label,
        efficiency: p.efficiency,
      })),
      evidence: [
        analytics.efficiencySummary.trend
          ? `Recent trend: ${analytics.efficiencySummary.trend}`
          : "Trend needs more HR-backed runs",
        mom.comparableCount > 0
          ? `${mom.comparableCount} comparable efforts in MoM window`
          : "Add steady aerobic runs for month comparisons",
      ],
    },
    ecosystem: buildTrainingEcosystemView(analytics),
    explain: buildExplain(analytics, plan, related),
    supporting: {
      elevationAvg:
        analytics.avgElevationPerKm !== null
          ? `${round1(analytics.avgElevationPerKm)} m/km avg gain`
          : null,
      elevationChart: analytics.elevationPerKm.slice(-12).map((e) => ({
        label: e.label,
        gainPerKm: round1(e.gainPerKm),
      })),
      blocks: analytics.trainingBlocks.map((b) => ({
        label: b.label,
        distanceKm: formatKmValue(b.distanceKm),
        runCount: b.runCount,
        longestRunKm: formatKmValue(b.longestRunKm),
        highlight: analytics.bestBlock?.weekStart === b.weekStart,
      })),
      bestBlock: analytics.bestBlock
        ? `${analytics.bestBlock.label}, ${formatKm(analytics.bestBlock.distanceKm)} (${analytics.bestBlock.runCount} runs)`
        : null,
    },
  };
}

/** Printable summary lines for report */
export function formatPlanForReport(plan: WeekPlan): string[] {
  const lo = Math.round(plan.totalKmRange[0] * 10) / 10;
  const hi = Math.round(plan.totalKmRange[1] * 10) / 10;
  const lines = [
    `Week ${plan.weekLabel}: ${formatKmRange(lo, hi)} (${plan.template})`,
    ...plan.rationale.map((r) => `• ${r}`),
    ...plan.sessions.map(
      (s) =>
        `• ${s.day ? s.day + ": " : ""}${WORKOUT_TYPE_LABELS[s.type]}: ${s.description} (${formatKmRange(s.distanceKmRange[0], s.distanceKmRange[1])})`,
    ),
  ];
  if (plan.warnings.length) {
    lines.push(...plan.warnings.map((w) => `Note: ${w}`));
  }
  return lines;
}

import type { DashboardInsights } from "@/lib/analytics";
import { ecosystemHeadline } from "@/lib/ecosystem/insights";
import type { Insight } from "@/lib/insights/types";
import type { WorkoutType } from "@/lib/analytics/workoutType";
import { topInsightForHome } from "@/lib/insights/generate";
import { formatDuration, formatKm, formatKmRange, formatKmValue, formatPace } from "@/lib/utils";
import { parseISO, isWithinInterval, endOfWeek, getDay } from "date-fns";
import type { PanelSeverity } from "./panelCopy";
import type { InsightConfidence } from "@/lib/insights/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const LOAD_FACTOR: Record<WorkoutType, number> = {
  easy: 1,
  recovery: 0.55,
  tempo: 1.35,
  interval: 1.45,
  long: 1.15,
  race: 1.5,
  unknown: 1,
};

export interface HeroViewModel {
  title: string;
  interpretation: string;
  recommendation?: string;
  whyBullets: string[];
  severity: PanelSeverity;
  inlineMetrics: { label: string; value: string; hint?: string }[];
  readinessScore: number;
  readinessLabel: string;
  freshness: number;
  freshnessLabel: string;
  confidence: InsightConfidence;
  loadSparkline: number[];
  trendLabel: string;
  ctl: number;
  tsb: number;
}

export interface KpiViewModel {
  label: string;
  value: string;
  numericValue?: number;
  context?: string;
  delta?: { text: string; positive: boolean | null };
  sparkline: number[];
  sparkPositive?: boolean;
  href?: string;
}

export interface WeekSessionChip {
  dayIndex: number;
  day: string;
  type: WorkoutType;
  label: string;
  kmRange?: string;
  loadScore: number;
  intensityPct: number;
}

export interface WeekOpsViewModel {
  weekLabel: string;
  loadKm: number;
  loadDeltaPct: number | null;
  runCount: number;
  totalLoadScore: number;
  sessions: WeekSessionChip[];
  laneByDay: (WeekSessionChip | null)[];
}

export interface InsightRowViewModel {
  id: string;
  kind: "risk" | "opportunity";
  severity: "risk" | "caution" | "positive";
  confidence: InsightConfidence;
  title: string;
  summary: string;
  whyItMatters: string;
  pills: string[];
  recommendation?: string;
  recommendationHref?: string;
  trend?: { text: string; positive: boolean | null };
  evidence?: string[];
}

export interface TrendMiniChart {
  label: string;
  data: number[];
  positive?: boolean;
  caption?: string;
}

export interface ProgressionViewModel {
  achievements: AchievementItem[];
  milestones: AchievementItem[];
  trajectory: string;
  bestBlock: string | null;
  trends: {
    efficiency: TrendMiniChart;
    volume: TrendMiniChart;
    pace: TrendMiniChart;
  };
  comparisons: { label: string; value: string; positive: boolean | null }[];
}

/** @deprecated Use ProgressionViewModel — kept for imports during transition */
export type ImprovementViewModel = ProgressionViewModel;

export interface AchievementItem {
  id: string;
  title: string;
  meta: string;
  date: string;
  category: "speed" | "endurance" | "consistency";
}

export interface GoalSegment {
  id: string;
  label: string;
  score: number;
}

export interface GoalMissionViewModel {
  score: number;
  label: string;
  raceDate?: string;
  daysOut?: number;
  targetFinish?: string;
  probability?: string;
  confidence: InsightConfidence;
  segments: GoalSegment[];
  focusAreas: string[];
  href: string;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function estimateLoad(
  type: WorkoutType,
  lo?: number,
  hi?: number,
): { loadScore: number; intensityPct: number } {
  const mid = lo != null && hi != null ? (lo + hi) / 2 : 6;
  const factor = LOAD_FACTOR[type];
  const intensityPct = Math.min(
    100,
    Math.round(
      (type === "interval" || type === "tempo"
        ? 78
        : type === "long"
          ? 62
          : type === "easy"
            ? 42
            : type === "recovery"
              ? 28
              : 50) * factor,
    ),
  );
  return {
    loadScore: Math.round(mid * factor * 10) / 10,
    intensityPct,
  };
}

function dayIndexFromIso(iso: string): number {
  const d = getDay(parseISO(iso));
  return d === 0 ? 6 : d - 1;
}

function buildLane(sessions: WeekSessionChip[]): (WeekSessionChip | null)[] {
  const lane: (WeekSessionChip | null)[] = Array(7).fill(null);
  for (const s of sessions) {
    const idx = s.dayIndex >= 0 && s.dayIndex < 7 ? s.dayIndex : 0;
    if (!lane[idx]) lane[idx] = s;
  }
  return lane;
}

function runsAboveZ3(analytics: DashboardInsights): { count: number; total: number } {
  const withHr = analytics.hrZones.reduce((s, z) => s + z.runCount, 0);
  const above = analytics.hrZones
    .filter((z) => ["Z3", "Z4", "Z5"].includes(z.zone))
    .reduce((s, z) => s + z.runCount, 0);
  return { count: above, total: withHr };
}

function bestWeekLabel(weeks: { distanceKm: number }[]): string | null {
  if (weeks.length < 3) return null;
  const recent = weeks.slice(-6);
  const latest = recent.at(-1)!.distanceKm;
  const max = Math.max(...recent.map((w) => w.distanceKm));
  if (latest >= max * 0.98) return "Best in 6 weeks";
  if (latest < max * 0.85) return "Down from peak";
  return null;
}

export function buildHeroView(insights: Insight[], analytics: DashboardInsights): HeroViewModel {
  const top = topInsightForHome(insights);
  const readiness = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  const loadSparkline = analytics.loadHistory.slice(-10).map((h) => h.ctl);

  const base = {
    readinessScore: readiness.score,
    readinessLabel: readiness.label,
    freshness: analytics.fatigue.freshness,
    freshnessLabel: analytics.fatigue.label,
    confidence: analytics.dataConfidence,
    loadSparkline,
    ctl: Math.round(analytics.fatigue.ctl),
    tsb: Math.round(analytics.fatigue.tsb),
    trendLabel: `CTL ${Math.round(analytics.fatigue.ctl)} · TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${Math.round(analytics.fatigue.tsb)}`,
    inlineMetrics: [
      {
        label: "Freshness",
        value: String(analytics.fatigue.freshness),
        hint: analytics.fatigue.label,
      },
      {
        label: "Consistency",
        value: String(analytics.consistencyScore.overall),
        hint: analytics.consistencyScore.label,
      },
      {
        label: "7d volume",
        value: formatKm(analytics.summary.last7DaysKm),
        hint: `${analytics.summary.last7DaysRuns} runs`,
      },
    ],
  };

  if (top) {
    return {
      ...base,
      title: top.title,
      interpretation:
        top.recommendation ??
        top.evidence[0] ??
        "Synthesized from your latest training block and load profile.",
      recommendation: top.recommendation ? top.evidence[0] : undefined,
      whyBullets: top.evidence.slice(top.recommendation ? 1 : 0, 4),
      severity:
        top.severity === "warning"
          ? top.id.includes("fatigue") || top.id.includes("overload")
            ? "critical"
            : "warning"
          : top.severity,
    };
  }

  return {
    ...base,
    title: readiness.label,
    interpretation: `${readiness.score}/100 readiness · ${analytics.consistencyScore.label} consistency · ${analytics.fatigue.label.toLowerCase()} recovery state.`,
    whyBullets: analytics.weeklyNarrative.bullets.slice(0, 2),
    severity: readiness.score >= 70 ? "positive" : readiness.score >= 50 ? "neutral" : "warning",
  };
}

export function buildKpis(analytics: DashboardInsights): KpiViewModel[] {
  const months = analytics.monthlyVolume;
  const lastMonth = months.at(-1);
  const prevMonth = months.at(-2);
  const runDelta =
    lastMonth && prevMonth ? pctChange(lastMonth.runCount, prevMonth.runCount) : null;

  const volWeeks = analytics.weeklyVolume;
  const weekRunCounts = volWeeks.slice(-10).map((w) => w.runCount);
  const weekKm = volWeeks.slice(-10).map((w) => w.distanceKm);
  const volTrendUp = weekKm.length >= 2 && weekKm.at(-1)! >= weekKm.at(-2)!;
  const bestLabel = bestWeekLabel(volWeeks);

  const lastPace = analytics.summary.avgPaceSecPerKm;
  const paceSpark = analytics.paceTrend
    .slice(-10)
    .map((p) => p.paceSecPerKm ?? 0)
    .filter((v) => v > 0);
  const paceTrendUp = paceSpark.length >= 2 && paceSpark.at(-1)! <= paceSpark.at(-2)!;

  const readiness = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  const ctlSpark = analytics.loadHistory.slice(-10).map((h) => h.ctl);
  const ctlUp = ctlSpark.length >= 2 && ctlSpark.at(-1)! >= ctlSpark.at(-2)!;

  const effPct = analytics.efficiencyMoM.pctChange;

  return [
    {
      label: "Runs",
      value: String(analytics.summary.runCount),
      numericValue: analytics.summary.runCount,
      context: bestLabel ?? `${formatKm(analytics.summary.totalDistanceKm)} lifetime`,
      delta:
        runDelta !== null
          ? {
              text: `${runDelta >= 0 ? "+" : ""}${runDelta}% vs prior month`,
              positive: runDelta >= 0,
            }
          : undefined,
      sparkline: weekRunCounts,
      sparkPositive: volTrendUp,
      href: "/runs",
    },
    {
      label: "Avg pace",
      value: lastPace ? formatPace(lastPace) : "—",
      context:
        analytics.efficiencySummary.trend === "improving"
          ? effPct != null
            ? `+${Math.abs(effPct)}% efficiency`
            : "Efficiency improving"
          : analytics.efficiencySummary.trend === "declining"
            ? "Down from recent peak"
            : "Steady aerobic pace",
      delta:
        analytics.efficiencySummary.trend === "improving"
          ? { text: "↑ improving", positive: true }
          : analytics.efficiencySummary.trend === "declining"
            ? { text: "↓ declining", positive: false }
            : undefined,
      sparkline: paceSpark.length ? paceSpark : weekKm,
      sparkPositive: paceTrendUp,
      href: "/performance",
    },
    {
      label: analytics.raceReadiness
        ? `${analytics.raceReadiness.distanceLabel} readiness`
        : "HM readiness",
      value: String(readiness.score),
      numericValue: readiness.score,
      context: analytics.raceReadiness
        ? `${analytics.raceReadiness.daysUntilRace} days to race`
        : readiness.label,
      delta: {
        text: analytics.fatigue.freshness >= 60 ? "Recovery improving" : "Build recovery",
        positive: analytics.fatigue.freshness >= 60 ? true : false,
      },
      sparkline: ctlSpark,
      sparkPositive: ctlUp,
      href: "/progress",
    },
    {
      label: "Consistency",
      value: String(analytics.consistencyScore.overall),
      numericValue: analytics.consistencyScore.overall,
      context: analytics.consistencyScore.label,
      delta: {
        text:
          analytics.consistencyScore.overall >= 70
            ? "↑ on target"
            : analytics.consistencyScore.overall < 50
              ? "↓ below target"
              : "→ stabilizing",
        positive:
          analytics.consistencyScore.overall >= 70
            ? true
            : analytics.consistencyScore.overall < 50
              ? false
              : null,
      },
      sparkline: weekKm,
      sparkPositive: volTrendUp,
      href: "/progress/load",
    },
  ];
}

function weekSessionsFromPlan(plan: DashboardInsights["nextWeekPlan"]): WeekSessionChip[] {
  return plan.sessions.map((s, i) => {
    const [lo, hi] = s.distanceKmRange;
    const { loadScore, intensityPct } = estimateLoad(s.type, lo, hi);
    const dayStr = s.day ?? WEEKDAYS[i % 7];
    const dayIndex = WEEKDAYS.indexOf(dayStr.slice(0, 3) as (typeof WEEKDAYS)[number]);
    return {
      dayIndex: dayIndex >= 0 ? dayIndex : i,
      day: dayStr,
      type: s.type,
      label: s.description,
      kmRange: formatKmRange(lo, hi),
      loadScore,
      intensityPct,
    };
  });
}

function weekSessionsFromLabels(
  analytics: DashboardInsights,
  weekStart: string,
): WeekSessionChip[] {
  const start = parseISO(weekStart);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return analytics.workoutLabels
    .filter((l) => {
      const d = parseISO(l.date);
      return isWithinInterval(d, { start, end });
    })
    .slice(0, 7)
    .map((l) => {
      const dayIndex = dayIndexFromIso(l.date);
      const { loadScore, intensityPct } = estimateLoad(l.classification.type, 5, 8);
      return {
        dayIndex,
        day: WEEKDAYS[dayIndex],
        type: l.classification.type,
        label: l.runName,
        loadScore: loadScore,
        intensityPct,
      };
    });
}

export function buildThisWeekOps(analytics: DashboardInsights): WeekOpsViewModel {
  const cw = analytics.currentWeek;
  const pw = analytics.previousWeek;
  const sessions = weekSessionsFromLabels(analytics, cw.weekStart);
  const totalLoadScore = Math.round(sessions.reduce((s, x) => s + x.loadScore, 0) * 10) / 10;

  return {
    weekLabel: cw.weekLabel,
    loadKm: Math.round(cw.distanceKm * 10) / 10,
    loadDeltaPct: pw && pw.distanceKm > 0 ? pctChange(cw.distanceKm, pw.distanceKm) : null,
    runCount: cw.runCount,
    totalLoadScore,
    sessions,
    laneByDay: buildLane(sessions),
  };
}

export function buildNextWeekOps(analytics: DashboardInsights): WeekOpsViewModel {
  const p = analytics.nextWeekPlan;
  const [lo, hi] = p.totalKmRange;
  const sessions = weekSessionsFromPlan(p);
  const totalLoadScore = Math.round(sessions.reduce((s, x) => s + x.loadScore, 0) * 10) / 10;

  return {
    weekLabel: p.weekLabel,
    loadKm: Math.round(((lo + hi) / 2) * 10) / 10,
    loadDeltaPct: null,
    runCount: p.sessions.length,
    totalLoadScore,
    sessions,
    laneByDay: buildLane(sessions),
  };
}

export function buildInsightRows(
  analytics: DashboardInsights,
  insights: Insight[],
): InsightRowViewModel[] {
  const rows: InsightRowViewModel[] = [];
  const z3 = runsAboveZ3(analytics);
  const adv = analytics.intensityAdvice;
  const conf = analytics.dataConfidence;

  if (adv.status === "too_hard" || analytics.fatigue.formPct < -21) {
    rows.push({
      id: "intensity",
      kind: "risk",
      severity: analytics.fatigue.formPct < -34 ? "risk" : "caution",
      confidence: conf,
      title: "High intensity ratio",
      summary: `${adv.hardRunsLast14d} hard sessions in 14 days · ${Math.round(adv.currentEasyPct)}% easy (target ~${adv.easyTargetPct}%)`,
      whyItMatters:
        "When hard days stack up, recovery lags and aerobic gains stall. Easy volume needs to lead the week.",
      pills: [
        `${adv.hardRunsLast14d} hard runs`,
        `${Math.round(adv.currentEasyPct)}% easy`,
        `TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${Math.round(analytics.fatigue.tsb)}`,
      ],
      recommendation: adv.recommendations[0],
      recommendationHref: "/progress/load",
      trend: { text: "Intensity-heavy", positive: false },
      evidence: adv.recommendations.slice(1),
    });
  }

  if (z3.total > 0 && z3.count / z3.total > 0.35) {
    rows.push({
      id: "z3",
      kind: "risk",
      severity: "caution",
      confidence: conf,
      title: "Aerobic stress elevated",
      summary: `${z3.count} of ${z3.total} HR runs spent above Z3`,
      whyItMatters:
        "Too much moderate-hard running blurs recovery. Polarize with more true easy days.",
      pills: [`${z3.count} above Z3`, `${Math.round((z3.count / z3.total) * 100)}% of HR runs`],
      recommendation: "Cap intensity to 1–2 sessions this week; fill gaps with easy aerobic runs.",
      recommendationHref: "/progress/load",
      trend: { text: "Z3+ elevated", positive: false },
    });
  }

  const fatigueInsight = insights.find((i) => i.id === "fatigue-high");
  if (fatigueInsight) {
    rows.push({
      id: "fatigue",
      kind: "risk",
      severity: "risk",
      confidence: fatigueInsight.confidence,
      title: fatigueInsight.title,
      summary: fatigueInsight.evidence[0] ?? "Fatigue signals are elevated.",
      whyItMatters:
        "Accumulated load is outpacing adaptation. Backing off now protects the next training block.",
      pills: [
        `freshness ${analytics.fatigue.freshness}`,
        `TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${Math.round(analytics.fatigue.tsb)}`,
      ],
      recommendation: fatigueInsight.recommendation,
      recommendationHref: "/progress/load",
      trend: { text: "Recovery needed", positive: false },
      evidence: fatigueInsight.evidence.slice(1),
    });
  }

  if (analytics.efficiencySummary.trend === "improving") {
    const pct = analytics.efficiencyMoM.pctChange;
    rows.push({
      id: "efficiency",
      kind: "opportunity",
      severity: "positive",
      confidence: conf,
      title: "Aerobic efficiency improving",
      summary:
        pct != null
          ? `${pct > 0 ? "+" : ""}${pct}% vs prior month at comparable effort`
          : "Pace at a given heart rate is trending faster.",
      whyItMatters:
        "Improving efficiency means the same HR buys more speed, a hallmark of durable fitness.",
      pills: [
        pct != null ? `${pct > 0 ? "+" : ""}${pct}% efficiency` : "trend up",
        analytics.consistencyScore.label,
      ],
      trend: { text: "Efficiency ↑", positive: true },
    });
  }

  if (adv.status === "balanced") {
    rows.push({
      id: "balanced",
      kind: "opportunity",
      severity: "positive",
      confidence: conf,
      title: "Polarized balance on track",
      summary: `${Math.round(adv.currentEasyPct)}% easy · ${adv.hardRunsLast14d} hard in 14 days`,
      whyItMatters:
        "Your easy/hard split supports recovery between quality sessions. Maintain this rhythm.",
      pills: [`${Math.round(adv.currentEasyPct)}% easy`, "polarized"],
      recommendation: adv.recommendations[0],
      trend: { text: "Balance OK", positive: true },
    });
  }

  const prInsight = insights.find((i) => i.id.startsWith("new-pr"));
  if (prInsight) {
    rows.push({
      id: "pr",
      kind: "opportunity",
      severity: "positive",
      confidence: prInsight.confidence,
      title: prInsight.title,
      summary: prInsight.evidence[0] ?? "Recent performance breakthrough.",
      whyItMatters: "A new PR confirms your current block is producing real speed gains.",
      pills: ["new PR", "speed"],
      recommendation: prInsight.recommendation,
      recommendationHref: "/performance",
      trend: { text: "PR signal", positive: true },
    });
  }

  const ecoHeadline = ecosystemHeadline(analytics.trainingEcosystem);
  const ecoInterference = analytics.trainingEcosystem.interferenceFlags.filter(
    (f) => f.severity !== "low",
  );
  if (ecoHeadline && analytics.trainingEcosystem.totalContext.last28Days.nonRunSessions > 0) {
    rows.push({
      id: "ecosystem",
      kind: ecoInterference.length > 0 ? "risk" : "opportunity",
      severity: ecoInterference.length > 0 ? "caution" : "positive",
      confidence: analytics.trainingEcosystem.confidence,
      title: "Training ecosystem",
      summary: ecoHeadline,
      whyItMatters:
        "StrideIQ tracks strength, mobility, cross-training, and HIIT alongside runs: non-run work shapes fatigue and durability context, not race pace directly.",
      pills: [
        analytics.trainingEcosystem.archetype.label,
        `${analytics.trainingEcosystem.totalContext.last28Days.nonRunSessions} non-run sessions`,
        `interference ${analytics.trainingEcosystem.scores.interferenceRisk}`,
      ],
      recommendation:
        ecoInterference.length > 0
          ? "Separate hard gym or HIIT from quality runs by 24–48h when possible."
          : "Review cross-training panel on Training.",
      recommendationHref: "/progress/load",
      trend: {
        text: ecoInterference.length > 0 ? "Interference" : "Ecosystem OK",
        positive: ecoInterference.length === 0,
      },
      evidence: analytics.trainingEcosystem.supportSignals.slice(0, 2).flatMap((s) => s.evidence),
    });
  }

  const planInsight = insights.find((i) => i.id === "next-week-plan");
  if (planInsight?.recommendation) {
    rows.push({
      id: "plan",
      kind: "opportunity",
      severity: "positive",
      confidence: planInsight.confidence,
      title: "Recommended focus",
      summary: planInsight.recommendation,
      whyItMatters: "Your adaptive plan aligns volume and intensity with current freshness.",
      pills: ["next week"],
      recommendation: "Review full week plan",
      recommendationHref: "/progress/load",
    });
  }

  if (rows.length === 0) {
    rows.push({
      id: "baseline",
      kind: "opportunity",
      severity: "positive",
      confidence: conf,
      title: "Training load stable",
      summary: `TSB ${analytics.fatigue.tsb > 0 ? "+" : ""}${Math.round(analytics.fatigue.tsb)} · freshness ${analytics.fatigue.freshness}/100`,
      whyItMatters: "No critical overload flags: good window to execute planned quality work.",
      pills: [`freshness ${analytics.fatigue.freshness}`],
      trend: { text: "Stable", positive: null },
    });
  }

  return rows;
}

export function buildProgressionView(
  analytics: DashboardInsights,
  insights: Insight[],
): ProgressionViewModel {
  const prs = analytics.prTimeline
    .filter((p) => p.isNewPr)
    .slice(-5)
    .reverse();
  const achievements: AchievementItem[] = prs.map((p) => ({
    id: p.runId + p.bucket,
    title: `${p.label} PR`,
    meta: formatDuration(p.timeSec),
    date: p.date,
    category:
      p.bucket === "5k" || p.bucket === "10k"
        ? "speed"
        : p.bucket === "hm"
          ? "endurance"
          : "endurance",
  }));

  if (achievements.length === 0) {
    insights
      .filter((i) => i.question === "improving")
      .slice(0, 3)
      .forEach((i) => {
        achievements.push({
          id: i.id,
          title: i.title,
          meta: i.evidence[0] ?? "",
          date: "",
          category: "consistency",
        });
      });
  }

  const effPct = analytics.efficiencyMoM.pctChange;
  const comparisons: ProgressionViewModel["comparisons"] = [];
  if (effPct != null) {
    comparisons.push({
      label: "Efficiency",
      value: `${effPct > 0 ? "+" : ""}${effPct}%`,
      positive: effPct > 0,
    });
  }
  const volWeeks = analytics.weeklyVolume.slice(-4);
  if (volWeeks.length >= 2) {
    const latest = volWeeks.at(-1)!;
    const prev = volWeeks.at(-2)!;
    const d = pctChange(latest.distanceKm, prev.distanceKm);
    if (d != null) {
      comparisons.push({
        label: "4wk volume",
        value: `${d >= 0 ? "+" : ""}${d}%`,
        positive: d >= 0,
      });
    }
  }

  const efficiencyData = analytics.efficiencyTrend
    .slice(-12)
    .map((e) => e.efficiency)
    .filter((v) => v > 0);
  const volumeData = analytics.weeklyVolume.slice(-10).map((w) => w.distanceKm);
  const paceData = analytics.paceTrend
    .slice(-10)
    .map((p) => p.paceSecPerKm ?? 0)
    .filter((v) => v > 0);

  const pacePositive = paceData.length >= 2 && paceData.at(-1)! < paceData.at(-2)!;
  const volPositive = volumeData.length >= 2 && volumeData.at(-1)! >= volumeData.at(-2)!;
  const effPositive =
    analytics.efficiencySummary.trend === "improving" ||
    (efficiencyData.length >= 2 && efficiencyData.at(-1)! < efficiencyData.at(-2)!);

  const best = analytics.bestBlock;
  const trajectory =
    analytics.efficiencySummary.trend === "improving"
      ? "Trajectory trending up: aerobic response improving."
      : analytics.efficiencySummary.trend === "declining"
        ? "Trajectory softening: prioritize recovery before adding load."
        : "Trajectory steady: maintain consistency before pushing intensity.";

  const milestones: AchievementItem[] = [];
  if (analytics.consistencyScore.overall >= 70) {
    milestones.push({
      id: "consistency-win",
      title: "Consistency on target",
      meta: analytics.consistencyScore.label,
      date: "",
      category: "consistency",
    });
  }
  insights
    .filter((i) => i.question === "improving" && !i.id.startsWith("new-pr"))
    .slice(0, 2)
    .forEach((i) => {
      milestones.push({
        id: i.id,
        title: i.title,
        meta: i.evidence[0] ?? "",
        date: "",
        category: "consistency",
      });
    });

  return {
    achievements: achievements.slice(0, 5),
    milestones,
    trajectory,
    bestBlock: best ? `${formatKm(best.distanceKm)} · ${best.runCount} runs (${best.label})` : null,
    trends: {
      efficiency: {
        label: "Efficiency",
        data: efficiencyData.length >= 2 ? efficiencyData : volumeData,
        positive: effPositive,
        caption: effPct != null ? `${effPct > 0 ? "+" : ""}${effPct}% MoM` : undefined,
      },
      volume: {
        label: "Volume",
        data: volumeData,
        positive: volPositive,
      },
      pace: {
        label: "Pace",
        data: paceData.length >= 2 ? paceData : volumeData,
        positive: pacePositive,
      },
    },
    comparisons,
  };
}

export const buildImprovementView = buildProgressionView;

export function buildGoalMission(analytics: DashboardInsights): GoalMissionViewModel {
  const r = analytics.raceReadiness;
  const hm = analytics.halfMarathonReadiness;

  const segments: GoalSegment[] = [
    {
      id: "endurance",
      label: "Endurance",
      score: r ? Math.min(100, Math.round(r.volumePct)) : Math.min(100, Math.round(hm.volumePct)),
    },
    {
      id: "pacing",
      label: "Pacing",
      score: r
        ? Math.min(100, Math.round(r.longestRunPct))
        : Math.min(100, Math.round(hm.longestRunPct)),
    },
    {
      id: "consistency",
      label: "Consistency",
      score: analytics.consistencyScore.overall,
    },
    {
      id: "freshness",
      label: "Freshness",
      score: analytics.fatigue.freshness,
    },
  ];

  if (r) {
    return {
      score: r.score,
      label: r.label,
      raceDate: r.raceDate,
      daysOut: r.daysUntilRace,
      targetFinish: r.targetTimeSec ? formatDuration(r.targetTimeSec) : undefined,
      probability: r.probabilityBand,
      confidence: analytics.dataConfidence,
      segments,
      focusAreas: r.gaps.slice(0, 2).map((g) => `${g.metric}: ${g.current} → ${g.target}`),
      href: "/progress",
    };
  }

  return {
    score: hm.score,
    label: hm.label,
    confidence: analytics.dataConfidence,
    segments,
    focusAreas: [
      `Long ${formatKmValue(hm.longestRunKm)} km (${Math.round(hm.longestRunPct)}% HM)`,
      `4wk ${formatKm(hm.fourWeekVolumeKm)}`,
    ],
    href: "/progress",
  };
}

// Back-compat aliases
export const buildRiskOpportunityRows = buildInsightRows;

import type { DashboardInsights } from "@/lib/analytics";
import type { Insight } from "@/lib/insights/types";
import { topInsightForHome } from "@/lib/insights/generate";
import { formatKm, formatPace } from "@/lib/utils";

export type PanelSeverity = "positive" | "neutral" | "warning" | "critical";

export interface HomePanelCopy {
  title: string;
  summary: string;
  severity: PanelSeverity;
  action?: string;
}

export function heroCopy(insights: Insight[], analytics: DashboardInsights): HomePanelCopy {
  const top = topInsightForHome(insights);
  if (top) {
    return {
      title: top.title,
      summary:
        top.recommendation ?? top.evidence[0] ?? "Review your training plan for the week ahead.",
      severity: mapInsightSeverity(top.severity, top.id),
      action: top.recommendation ? undefined : "Open training plan",
    };
  }

  const readiness = analytics.raceReadiness ?? analytics.halfMarathonReadiness;
  return {
    title: readiness.label,
    summary: `${readiness.score}/100 readiness · ${analytics.consistencyScore.label}`,
    severity: readiness.score >= 70 ? "positive" : readiness.score >= 50 ? "neutral" : "warning",
  };
}

export function thisWeekCopy(analytics: DashboardInsights): HomePanelCopy {
  const n = analytics.weeklyNarrative;
  return {
    title: `This week · ${n.weekLabel}`,
    summary: n.paragraphs[0] ?? "No narrative available.",
    severity: n.severity === "warning" ? "warning" : n.severity,
  };
}

const intensityTitles: Record<DashboardInsights["intensityAdvice"]["status"], string> = {
  balanced: "Intensity balance looks sound",
  too_hard: "Training skews too hard",
  too_easy: "Mostly easy running",
  paused: "Training is paused",
  insufficient_data: "Need more recent runs",
};

export function nextWeekCopy(analytics: DashboardInsights): HomePanelCopy {
  const p = analytics.nextWeekPlan;
  const first = p.sessions[0];
  return {
    title: `Next week · ${p.weekLabel}`,
    summary: first
      ? `${first.day ?? "Session"}: ${first.description}`
      : (p.rationale[0] ?? "Plan sessions based on your recent load."),
    severity: p.warnings.length > 0 ? "warning" : "neutral",
    action: p.warnings[0],
  };
}

export function trainingCopy(analytics: DashboardInsights): HomePanelCopy {
  const adv = analytics.intensityAdvice;
  const fatigue = analytics.fatigue;
  let severity: PanelSeverity =
    adv.status === "too_hard" ? "warning" : adv.status === "balanced" ? "positive" : "neutral";
  if (fatigue.formPct < -34) severity = "critical";

  return {
    title: intensityTitles[adv.status],
    summary:
      adv.recommendations[0] ?? `${adv.currentEasyPct}% easy runs (target ~${adv.easyTargetPct}%).`,
    severity,
    action: adv.recommendations[1],
  };
}

export function improvingCopy(analytics: DashboardInsights, insights: Insight[]): HomePanelCopy {
  const improving = insights.filter((i) => i.question === "improving");
  const pr = improving.find((i) => i.id.startsWith("new-pr"));
  if (pr) {
    return {
      title: pr.title,
      summary: pr.evidence[0] ?? "Recent performance highlight.",
      severity: "positive",
    };
  }

  if (analytics.efficiencySummary.trend === "improving") {
    return {
      title: "Aerobic efficiency trending up",
      summary:
        analytics.efficiencyMoM.narrative ??
        "Pace at a given heart rate is improving vs your prior block.",
      severity: "positive",
    };
  }

  if (analytics.efficiencySummary.trend === "declining") {
    return {
      title: "Efficiency has dipped",
      summary: "Consider recovery before adding more intensity.",
      severity: "warning",
    };
  }

  const pace = analytics.summary.avgPaceSecPerKm;
  return {
    title: "Training pace baseline",
    summary: pace
      ? `Average pace ${formatPace(pace)} across ${analytics.summary.runCount} runs · ${formatKm(analytics.summary.totalDistanceKm)} total.`
      : `${analytics.summary.runCount} runs logged.`,
    severity: "neutral",
  };
}

export function goalCopy(analytics: DashboardInsights): HomePanelCopy {
  const r = analytics.raceReadiness;
  if (r) {
    return {
      title: `${r.distanceLabel} readiness · ${r.score}/100`,
      summary: `${r.label} · ${r.probabilityBand} · ${r.daysUntilRace} days out`,
      severity: r.score >= 70 ? "positive" : r.score >= 50 ? "neutral" : "warning",
      action: r.gaps[0]
        ? `${r.gaps[0].metric}: ${r.gaps[0].current} → ${r.gaps[0].target}`
        : undefined,
    };
  }

  const hm = analytics.halfMarathonReadiness;
  return {
    title: `Half marathon readiness · ${hm.score}/100`,
    summary: hm.label,
    severity: hm.score >= 70 ? "positive" : hm.score >= 50 ? "neutral" : "warning",
  };
}

function mapInsightSeverity(severity: Insight["severity"], id: string): PanelSeverity {
  if (id === "fatigue-high" || id.includes("overload")) return "critical";
  return severity;
}

import { format, parseISO } from "date-fns";
import type { GenerateWeeklyPlanResult } from "@/lib/ai-planning";
import type { RaceGoal } from "@/lib/analytics/readiness";
import type { DashboardInsights } from "@/lib/analytics";
import type { CalendarValidationIssue, TrainingCalendarWeek } from "@/lib/training-calendar";
import { validateCalendarWeek } from "@/lib/training-calendar/calendarValidation";
import { isHardTrainingRun } from "@/lib/training-calendar/hardSessionRules";

export type IntegrityLevel = "info" | "warning" | "critical";

export interface PlanIntegrityItem {
  id: string;
  level: IntegrityLevel;
  message: string;
  workoutIds: string[];
}

export interface PlanWeekTelemetry {
  volumeKm: number | null;
  hardSessions: number;
  freshness: number;
  freshnessLabel: string;
  goalAlignment: string;
  riskSummary: string | null;
  confidence: string;
}

const PLAN_TYPE_LABEL: Record<string, string> = {
  build: "Build phase",
  maintain: "Maintenance",
  taper: "Taper",
  recovery: "Recovery",
  race_week: "Race week",
};

export function planPhaseLabel(planType?: string): string {
  if (!planType) return "Adaptive week";
  return PLAN_TYPE_LABEL[planType] ?? planType.replace("_", " ");
}

export function goalContextLabel(
  raceGoal: RaceGoal | null,
  analytics: DashboardInsights | null,
): string | null {
  if (!raceGoal && !analytics?.raceReadiness) return null;
  const r = analytics?.raceReadiness;
  if (r) {
    return `${r.distanceLabel} · ${r.daysUntilRace} days out`;
  }
  if (raceGoal?.distance === "hm") return "Half marathon goal";
  if (raceGoal?.distance === "marathon") return "Marathon goal";
  return "Race goal set";
}

export function buildWeekTelemetry(
  week: TrainingCalendarWeek,
  analytics: DashboardInsights | null,
): PlanWeekTelemetry {
  const volumeKm =
    week.totalRunDistanceKm ??
    week.workouts
      .filter((w) => w.modality === "run" && w.status !== "skipped")
      .reduce((s, w) => s + (w.distanceKm ?? 0), 0);

  const hardSessions =
    week.hardSessionCount ??
    week.workouts.filter(
      (w) =>
        w.modality === "run" &&
        w.status !== "skipped" &&
        (w.intensity === "hard" ||
          /\btempo|interval|threshold|race|quality\b/i.test(`${w.type} ${w.title}`)),
    ).length;

  const freshness = analytics?.fatigue.freshness ?? 0;
  const readiness = analytics?.raceReadiness?.score ?? analytics?.halfMarathonReadiness.score ?? 0;

  let goalAlignment = "moderate";
  if (readiness >= 80) goalAlignment = "strong";
  else if (readiness < 55) goalAlignment = "building";

  let riskSummary: string | null = null;
  if (analytics?.intensityAdvice.status === "too_hard") {
    riskSummary = "intensity stacking elevated";
  } else if (hardSessions > 2) {
    riskSummary = "hard session density high";
  }

  return {
    volumeKm: volumeKm > 0 ? Math.round(volumeKm * 10) / 10 : null,
    hardSessions,
    freshness: Math.round(freshness),
    freshnessLabel: analytics?.fatigue.label ?? "—",
    goalAlignment,
    riskSummary,
    confidence: week.confidence.replace("_", " "),
  };
}

export function buildIntegrityItems(
  week: TrainingCalendarWeek,
  preview: GenerateWeeklyPlanResult | null,
): PlanIntegrityItem[] {
  const validation = validateCalendarWeek(week, {
    guardrails: preview?.guardrails,
    integritySeverity:
      preview?.source === "fallback"
        ? undefined
        : (week.integritySeverity ?? preview?.integrity?.severity),
  });

  const hardWorkouts = week.workouts.filter(
    (w) => w.modality === "run" && w.status !== "skipped" && isHardTrainingRun(w),
  );

  return validation.issues.map((issue, i) => ({
    id: `${issue.code}-${i}`,
    level: mapSeverity(issue),
    message: issue.message,
    workoutIds: issue.code === "hard_sessions" ? hardWorkouts.map((w) => w.id) : [],
  }));
}

function mapSeverity(issue: CalendarValidationIssue): IntegrityLevel {
  if (issue.severity === "high") return "critical";
  if (issue.severity === "medium") return "warning";
  return "info";
}

export function sessionExplainability(week: TrainingCalendarWeek): string[] {
  const lines: string[] = [];
  for (const w of week.workouts) {
    if (w.modality === "rest") continue;
    const reason = w.reasoning ?? w.purpose;
    if (reason && reason.length > 12) {
      lines.push(`${w.day}: ${reason}`);
    }
  }
  if (week.summary && !lines.length) {
    lines.push(week.summary);
  }
  return lines.slice(0, 6);
}

export function formatPlanTimestamp(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d · HH:mm");
  } catch {
    return iso;
  }
}

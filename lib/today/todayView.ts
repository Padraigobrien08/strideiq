import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";
import type { DashboardInsights } from "@/lib/analytics";
import type { RaceGoal } from "@/lib/analytics/readiness";
import { isRaceUpcoming, raceDisplayName } from "@/lib/analytics/readiness";
import type { Insight } from "@/lib/insights/types";
import type { RunActivity } from "@/lib/strava/types";
import type { FitRunDetail } from "@/lib/strava/fitTypes";
import type { CalendarWorkout, TrainingCalendarWeek } from "@/lib/training-calendar";
import { buildTodaySessionInput, recommendTodaySession } from "@/lib/training/todaySession";
import { loadImpactFor, type TodayLoadImpact } from "@/lib/training/loadBalanceImpact";
import { buildRaceForecastInput, buildRaceForecastV2 } from "@/lib/forecasting-v2";
import { buildKeyEfforts } from "@/lib/goals/forecastV2ViewModel";
import { assessRaceStatus, type RaceStatusAssessment } from "@/lib/progress/raceStatus";
import { formatKm, formatKmValue, formatPace, formatRaceTime } from "@/lib/utils";
import {
  estimateDurationMin,
  paceZoneFor,
  targetPaceFor,
  type PaceZone,
  type TargetPace,
} from "./targetPace";

/**
 * Everything Today shows, as one typed value (docs/ui-overhaul/SPEC.md §6). Components
 * render it and decide nothing: which session, which figures, whether readiness earns a
 * place, and what the race outlook says are all settled here, from deterministic code.
 *
 * Figures are left out rather than invented. A planned session with no distance shows no
 * distance; no threshold pace means no pace; a duration is only estimated from distance
 * and pace, and then says so.
 */

export interface TodayFigures {
  distance: string | null;
  duration: { text: string; estimated: boolean } | null;
  pace: { text: string; basis: string } | null;
}

export interface TodayRunSession {
  kind: "run";
  title: string;
  figures: TodayFigures;
  why: string;
  raceRelevance: string | null;
  /** Where it came from: the athlete's saved week, or the deterministic engine. */
  source: "plan" | "engine";
  calendarWorkoutId: string | null;
}

export interface TodayRestSession {
  kind: "rest";
  title: "Recovery day";
  why: string;
  guidance: { mobility: string; sleep: string; fuel: string };
  tomorrow: { title: string; figures: TodayFigures } | null;
  source: "plan" | "engine";
  calendarWorkoutId: string | null;
}

export interface TodayRaceOutlook {
  kind: "race";
  name: string;
  daysToRace: number;
  status: RaceStatusAssessment | null;
  goalTime: string | null;
  likelyRange: string | null;
  provenance: string | null;
}

export interface TodayRecentProgress {
  kind: "no_race";
  direction: string;
  /** Chronic load (fitness) for the last 12 weeks, oldest first. */
  trajectory: number[];
  observation: string | null;
  pastRace: { name: string; date: string } | null;
}

export interface TodayView {
  isoDate: string;
  dateLabel: string;
  session: TodayRunSession | TodayRestSession;
  /** True when this week has a saved plan; Today then follows it. */
  hasPlan: boolean;
  /** Only present when the load balance changed today's session (SPEC §6.7). */
  readinessException: (TodayLoadImpact & { affects: true }) | null;
  outlook: TodayRaceOutlook | TodayRecentProgress;
}

const REST_GUIDANCE = {
  mobility: "Ten to fifteen minutes of easy mobility: hips, calves and hamstrings.",
  sleep: "Protect a full night's sleep. Most of the adaptation from recent sessions happens then.",
  fuel: "Eat normally, with protein at each meal, and keep drinking water through the day.",
} as const;

const RELEVANCE: Record<PaceZone, (race: string) => string> = {
  recovery: (race) => `Lets recent work sink in, so the next key session for ${race} lands well.`,
  easy: (race) => `Builds the aerobic base ${race} depends on, at an effort you can recover from.`,
  steady: (race) => `Extends your endurance for the later stages of ${race}.`,
  tempo: (race) => `Raises the pace you can hold, which sets your ${race} finishing time.`,
  interval: (race) => `Sharpens speed and economy for race pace in ${race}.`,
};

/**
 * Monday of the week containing `now`. Today reads this week's saved plan; the planner's
 * default target (`targetPlanWeekStart`) is next week, which is Training's concern.
 */
export function currentWeekStart(now: Date = new Date()): string {
  return format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

/** Today's planned session, matched on the date only (never the weekday name). */
export function findTodayWorkout(
  week: TrainingCalendarWeek | null,
  isoDate: string,
): CalendarWorkout | null {
  if (!week) return null;
  if (isoDate < week.weekStart.slice(0, 10) || isoDate > week.weekEnd.slice(0, 10)) return null;
  return week.workouts.find((w) => w.date.slice(0, 10) === isoDate) ?? null;
}

const isRest = (w: CalendarWorkout) =>
  w.modality === "rest" || w.intensity === "rest" || /^rest\b/i.test(w.type);

function paceRange(p: TargetPace): string {
  // "5:35–5:55 /km": the unit once, at the end.
  const fast = formatPace(p.fastSecPerKm).replace(/\s*\/.*$/, "");
  return `${fast}–${formatPace(p.slowSecPerKm)}`;
}

function paceBasis(p: TargetPace): string {
  const at = formatPace(p.basis.paceSecPerKm);
  return p.basis.kind === "threshold"
    ? `From your threshold pace (${at})`
    : `From your critical speed (${at}); no threshold estimate yet`;
}

function figuresFor(
  distanceKm: readonly [number, number] | null,
  durationMin: number | null,
  pace: TargetPace | null,
): TodayFigures {
  const distance = distanceKm
    ? distanceKm[0] === distanceKm[1]
      ? formatKm(distanceKm[0])
      : `${formatKmValue(distanceKm[0])}–${formatKm(distanceKm[1])}`
    : null;
  let duration: TodayFigures["duration"] = null;
  if (durationMin != null && durationMin > 0) {
    duration = { text: `${Math.round(durationMin)} min`, estimated: false };
  } else if (distanceKm && pace) {
    const [lo, hi] = estimateDurationMin(distanceKm, pace);
    duration = { text: lo === hi ? `${lo} min` : `${lo}–${hi} min`, estimated: true };
  }
  return {
    distance,
    duration,
    pace: pace ? { text: paceRange(pace), basis: paceBasis(pace) } : null,
  };
}

function figuresForWorkout(w: CalendarWorkout, analytics: DashboardInsights): TodayFigures {
  const pace = w.modality === "run" ? targetPaceFor(paceZoneFor(w), analytics.physiology) : null;
  const km =
    w.distanceKm != null && w.distanceKm > 0 ? ([w.distanceKm, w.distanceKm] as const) : null;
  return figuresFor(km, w.durationMin ?? null, pace);
}

function raceRelevance(zone: PaceZone | null, goal: RaceGoal | null): string | null {
  if (!zone || !goal || !isRaceUpcoming(goal)) return null;
  return RELEVANCE[zone](raceDisplayName(goal));
}

function buildSession(
  planned: CalendarWorkout | null,
  week: TrainingCalendarWeek | null,
  isoDate: string,
  analytics: DashboardInsights,
  goal: RaceGoal | null,
): TodayRunSession | TodayRestSession {
  if (planned) {
    if (isRest(planned)) {
      const next = findTodayWorkout(week, format(addDays(parseISO(isoDate), 1), "yyyy-MM-dd"));
      return {
        kind: "rest",
        title: "Recovery day",
        why:
          planned.purpose ||
          planned.reasoning ||
          "A planned rest day: recent sessions turn into fitness while you recover.",
        guidance: REST_GUIDANCE,
        tomorrow:
          next && !isRest(next)
            ? { title: next.title, figures: figuresForWorkout(next, analytics) }
            : null,
        source: "plan",
        calendarWorkoutId: planned.id,
      };
    }
    return {
      kind: "run",
      title: planned.title,
      figures: figuresForWorkout(planned, analytics),
      why: planned.purpose || planned.reasoning || "Scheduled in your saved week.",
      raceRelevance: planned.modality === "run" ? raceRelevance(paceZoneFor(planned), goal) : null,
      source: "plan",
      calendarWorkoutId: planned.id,
    };
  }

  // No saved plan for today: the deterministic engine prescribes.
  const rec = recommendTodaySession(buildTodaySessionInput(analytics));
  if (rec.kind === "rest") {
    return {
      kind: "rest",
      title: "Recovery day",
      why: rec.rationale[0] ?? "Recovery lets the adaptation from recent sessions happen.",
      guidance: REST_GUIDANCE,
      tomorrow: null,
      source: "engine",
      calendarWorkoutId: null,
    };
  }
  const zone = paceZoneFor({ type: rec.kind, intensity: rec.intensity });
  const pace = targetPaceFor(zone, analytics.physiology);
  return {
    kind: "run",
    title: rec.typeLabel,
    figures: figuresFor(rec.distanceKmRange, null, pace),
    why: rec.rationale[0] ?? rec.headline,
    raceRelevance: raceRelevance(zone, goal),
    source: "engine",
    calendarWorkoutId: null,
  };
}

/**
 * An estimate is shown no more precisely than it is known (SPEC §3.4): whole minutes for
 * races over an hour, five seconds below that.
 */
function roundEstimate(sec: number): number {
  const step = sec >= 3600 ? 60 : 5;
  return Math.round(sec / step) * step;
}

/** "Based on a recent 10K + 6 consistent weeks": the forecast's strongest evidence. */
function provenance(
  efforts: ReturnType<typeof buildKeyEfforts>,
  analytics: DashboardInsights,
): string | null {
  const best = efforts[0];
  const recentWeeks = analytics.weeklyVolume.slice(-8);
  const consistent = recentWeeks.filter((w) => w.runCount >= 2).length;
  const parts: string[] = [];
  if (best) {
    const km = best.distanceKm;
    const name =
      Math.abs(km - 5) < 0.4
        ? "5K"
        : Math.abs(km - 10) < 0.6
          ? "10K"
          : Math.abs(km - 21.1) < 1
            ? "half marathon"
            : `${formatKm(Math.round(km * 10) / 10)} effort`;
    parts.push(`a recent ${name}`);
  }
  if (consistent > 0) parts.push(`${consistent} consistent week${consistent === 1 ? "" : "s"}`);
  return parts.length ? `Based on ${parts.join(" + ")}` : null;
}

function buildOutlook(
  analytics: DashboardInsights,
  goal: RaceGoal | null,
  insights: Insight[],
  runs: RunActivity[] | undefined,
  fitDetails: FitRunDetail[] | undefined,
  isoDate: string,
): TodayRaceOutlook | TodayRecentProgress {
  if (goal && isRaceUpcoming(goal)) {
    const input = buildRaceForecastInput({ analytics, goal, runs, fitDetails });
    const forecast = input && input.efforts.length > 0 ? buildRaceForecastV2(input) : null;
    const status = assessRaceStatus({ targetTimeSec: goal.targetTimeSec, forecast });
    const range = forecast?.predictionIntervalSec;
    return {
      kind: "race",
      name: raceDisplayName(goal),
      daysToRace: Math.max(0, differenceInCalendarDays(parseISO(goal.date), parseISO(isoDate))),
      status,
      goalTime: goal.targetTimeSec ? formatRaceTime(goal.targetTimeSec) : null,
      likelyRange: range
        ? `${formatRaceTime(roundEstimate(range.innerLowSec))}–${formatRaceTime(roundEstimate(range.innerHighSec))}`
        : null,
      provenance: input ? provenance(buildKeyEfforts(input), analytics) : null,
    };
  }

  const ctl = analytics.fitnessIndex.slice(-12).map((p) => p.ctl);
  const first = ctl[0];
  const last = ctl[ctl.length - 1];
  const change = first ? (last - first) / first : 0;
  const direction =
    ctl.length < 4
      ? "Not enough weeks yet to show a direction."
      : change > 0.05
        ? `Fitness is rising: up ${Math.round(change * 100)}% over ${ctl.length} weeks.`
        : change < -0.05
          ? `Fitness is easing off: down ${Math.round(-change * 100)}% over ${ctl.length} weeks.`
          : `Fitness is holding steady over the last ${ctl.length} weeks.`;
  const observation =
    insights.find((i) => i.severity === "positive" || i.severity === "warning")?.title ??
    insights[0]?.title ??
    null;
  return {
    kind: "no_race",
    direction,
    trajectory: ctl,
    observation,
    pastRace:
      goal && !isRaceUpcoming(goal) ? { name: raceDisplayName(goal), date: goal.date } : null,
  };
}

export function buildTodayView(params: {
  analytics: DashboardInsights;
  savedWeek: TrainingCalendarWeek | null;
  raceGoal: RaceGoal | null;
  insights: Insight[];
  runs?: RunActivity[];
  fitDetails?: FitRunDetail[];
  now?: Date;
}): TodayView {
  const now = params.now ?? new Date();
  const isoDate = format(now, "yyyy-MM-dd");
  const planned = findTodayWorkout(params.savedWeek, isoDate);
  const impact = loadImpactFor(buildTodaySessionInput(params.analytics));
  return {
    isoDate,
    dateLabel: format(now, "EEE d MMM"),
    session: buildSession(planned, params.savedWeek, isoDate, params.analytics, params.raceGoal),
    hasPlan: Boolean(params.savedWeek && findWeekCovers(params.savedWeek, isoDate)),
    // The engine's session is what the balance can change; a saved plan is the athlete's
    // own, so the exception is only raised when Today is following the engine.
    readinessException:
      impact.affects && !planned ? (impact as TodayLoadImpact & { affects: true }) : null,
    outlook: buildOutlook(
      params.analytics,
      params.raceGoal,
      params.insights,
      params.runs,
      params.fitDetails,
      isoDate,
    ),
  };
}

function findWeekCovers(week: TrainingCalendarWeek, isoDate: string): boolean {
  return isoDate >= week.weekStart.slice(0, 10) && isoDate <= week.weekEnd.slice(0, 10);
}

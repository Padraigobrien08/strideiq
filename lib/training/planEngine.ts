import type { FatigueSnapshot } from "@/lib/analytics/fatigue";
import type { IntensityAdvice } from "@/lib/analytics/intensityAdvisor";
import type { ConsistencyScore } from "@/lib/analytics/consistency";
import type { RaceReadiness } from "@/lib/analytics/readiness";
import { RACE_READINESS_CONFIG } from "@/lib/analytics/readiness";
import type { WeekSnapshot } from "@/lib/analytics/week";
import type { WeeklyVolume } from "@/lib/analytics/volume";
import type { WorkoutType } from "@/lib/analytics/workoutType";
import type { ReturnToRunningPlan } from "@/lib/returning/returnToRunning";
import { isTrainingCurrent, stalenessClause } from "@/lib/insights/consistency";
import { validatePlan } from "./safety";
import {
  addWeeks,
  endOfWeek,
  format,
  getDay,
  isWithinInterval,
  parseISO,
  startOfWeek,
} from "date-fns";

export interface PlannedSession {
  day?: string;
  type: WorkoutType;
  distanceKmRange: [number, number];
  description: string;
}

export interface WeekPlan {
  weekStart: string;
  weekLabel: string;
  totalKmRange: [number, number];
  sessions: PlannedSession[];
  warnings: string[];
  rationale: string[];
  template: string;
}

export interface PlanContext {
  fatigue: FatigueSnapshot;
  intensityAdvice: IntensityAdvice;
  consistencyScore: ConsistencyScore;
  raceReadiness: RaceReadiness | null;
  currentWeek: WeekSnapshot;
  previousWeek: WeekSnapshot | null;
  weeklyVolume: WeeklyVolume[];
  easyHardPct: number;
  runsPerWeekTarget: number;
  maxWeeklyKm?: number;
  longestRunKm: number;
  /** Non-null when the athlete is coming back from a gap. See lib/returning. */
  returning: ReturnToRunningPlan | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function weekBoundsFromStart(start: Date): { weekStart: string; weekLabel: string } {
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return {
    weekStart: format(start, "yyyy-MM-dd"),
    weekLabel: `${format(start, "MMM d")} – ${format(end, "MMM d")}`,
  };
}

/** Default: calendar week after the current one. */
function nextWeekBounds(): { weekStart: string; weekLabel: string } {
  const start = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1);
  return weekBoundsFromStart(start);
}

/** When a race is soon, plan the ISO week that contains race day (not the week after). */
export function planWeekBounds(
  raceDate: string | undefined,
  daysUntilRace: number | null,
): { weekStart: string; weekLabel: string } {
  if (raceDate && daysUntilRace !== null && daysUntilRace >= 0 && daysUntilRace <= 14) {
    const race = parseISO(raceDate);
    return weekBoundsFromStart(startOfWeek(race, { weekStartsOn: 1 }));
  }
  return nextWeekBounds();
}

export function isRaceInPlanWeek(raceDate: string, weekStart: string): boolean {
  const race = parseISO(raceDate);
  const start = parseISO(weekStart);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return isWithinInterval(race, { start, end });
}

function raceDayLabel(raceDate: string): (typeof DAY_LABELS)[number] {
  return DAY_LABELS[getDay(parseISO(raceDate))];
}

function dayBefore(label: (typeof DAY_LABELS)[number]): (typeof DAY_LABELS)[number] {
  const idx = DAY_LABELS.indexOf(label);
  return DAY_LABELS[(idx + 6) % 7];
}

function twoDaysBefore(label: (typeof DAY_LABELS)[number]): (typeof DAY_LABELS)[number] {
  const idx = DAY_LABELS.indexOf(label);
  return DAY_LABELS[(idx + 5) % 7];
}

function baselineWeeklyKm(ctx: PlanContext): number {
  const recent = ctx.weeklyVolume.slice(-4);
  if (recent.length === 0) return 25;
  const avg = recent.reduce((s, w) => s + w.distanceKm, 0) / recent.length;
  return Math.round(avg * 10) / 10;
}

function lastCompletedWeekKm(ctx: PlanContext): number {
  return ctx.previousWeek?.distanceKm ?? ctx.currentWeek.distanceKm;
}

function longRunTargetKm(ctx: PlanContext): number {
  if (ctx.raceReadiness) {
    const cfg = RACE_READINESS_CONFIG[ctx.raceReadiness.distance];
    return Math.min(cfg.longRunTargetKm, ctx.longestRunKm + 2);
  }
  return Math.min(18, Math.max(12, ctx.longestRunKm + 1));
}

function buildFatiguePlan(
  ctx: PlanContext,
  week: { weekStart: string; weekLabel: string },
): WeekPlan {
  const base = baselineWeeklyKm(ctx);
  const cap = Math.round(base * 0.9 * 10) / 10;
  return {
    ...week,
    template: "recovery",
    totalKmRange: [Math.round(cap * 0.85 * 10) / 10, cap],
    sessions: [
      { day: "Mon", type: "easy", distanceKmRange: [5, 7], description: "Easy aerobic 30–40 min" },
      {
        day: "Wed",
        type: "easy",
        distanceKmRange: [6, 8],
        description: "Easy run, conversational pace",
      },
      {
        day: "Fri",
        type: "recovery",
        distanceKmRange: [4, 6],
        description: "Short recovery jog or rest",
      },
      {
        day: "Sun",
        type: "easy",
        distanceKmRange: [5, 8],
        description: "Optional easy strides: 4–6 × 20 sec",
      },
    ],
    warnings: [],
    rationale: [
      `Freshness is ${ctx.fatigue.freshness}/100 (${ctx.fatigue.label}), prioritizing recovery.`,
      `TSB ${ctx.fatigue.tsb > 0 ? "+" : ""}${ctx.fatigue.tsb} suggests backing off intensity.`,
    ],
  };
}

/** Taper week when race is 8–14 days out and falls after this plan week. */
function buildTaperPlan(
  ctx: PlanContext,
  week: { weekStart: string; weekLabel: string },
  daysUntilRace: number,
): WeekPlan {
  const base = baselineWeeklyKm(ctx);
  const factor = 0.65;
  const cap = Math.round(base * factor * 10) / 10;
  const longKm = Math.min(ctx.longestRunKm * 0.55, 12);
  return {
    ...week,
    template: "taper",
    totalKmRange: [Math.round(cap * 0.8 * 10) / 10, cap],
    sessions: [
      { day: "Mon", type: "easy", distanceKmRange: [5, 7], description: "Easy aerobic" },
      {
        day: "Wed",
        type: "tempo",
        distanceKmRange: [4, 6],
        description: "Short tempo: 15–20 min steady",
      },
      {
        day: "Sat",
        type: "long",
        distanceKmRange: [longKm - 1, longKm + 1],
        description: "Easy long run: last moderate effort before race week",
      },
      { day: "Sun", type: "recovery", distanceKmRange: [3, 5], description: "Easy recovery" },
    ],
    warnings: [],
    rationale: [
      `Race in ${daysUntilRace} days: pre-race week; volume ~${Math.round((1 - factor) * 100)}% below baseline.`,
      ctx.raceReadiness
        ? `${ctx.raceReadiness.distanceLabel} readiness: ${ctx.raceReadiness.score}/100.`
        : "Race goal set: protect freshness before race day.",
    ],
  };
}

/** Plan week that contains race day — no long run before race; race session on the correct day. */
function buildRaceWeekPlan(
  ctx: PlanContext,
  week: { weekStart: string; weekLabel: string },
  daysUntilRace: number,
  raceDate: string,
): WeekPlan {
  const readiness = ctx.raceReadiness!;
  const cfg = RACE_READINESS_CONFIG[readiness.distance];
  const raceDay = raceDayLabel(raceDate);
  const preRaceShake = dayBefore(raceDay);
  const lastQualityDay = twoDaysBefore(raceDay);

  const base = baselineWeeklyKm(ctx);
  const factor = daysUntilRace <= 3 ? 0.35 : daysUntilRace <= 7 ? 0.45 : 0.55;
  const cap = Math.round(base * factor * 10) / 10;

  const sessions: PlannedSession[] = [];

  if (daysUntilRace > 5) {
    sessions.push({
      day: "Mon",
      type: "easy",
      distanceKmRange: [5, 7],
      description: "Easy aerobic: stay relaxed",
    });
    sessions.push({
      day: lastQualityDay,
      type: "tempo",
      distanceKmRange: [4, 6],
      description: "Short sharpener: 10–15 min @ race effort, full warm-up/cool-down",
    });
  } else if (daysUntilRace > 3) {
    sessions.push({
      day: "Mon",
      type: "easy",
      distanceKmRange: [4, 6],
      description: "Easy aerobic only",
    });
  }

  if (daysUntilRace >= 2) {
    sessions.push({
      day: preRaceShake,
      type: "easy",
      distanceKmRange: [3, 5],
      description: "Pre-race shakeout: easy jog or rest; no fatigue",
    });
  }

  sessions.push({
    day: raceDay,
    type: "race",
    distanceKmRange: [
      Math.round(cfg.raceDistanceKm * 0.98 * 10) / 10,
      Math.round(cfg.raceDistanceKm * 1.02 * 10) / 10,
    ],
    description: readiness.targetTimeSec
      ? `${readiness.distanceLabel}: target ${formatRaceTarget(readiness.targetTimeSec)}; trust the taper`
      : `${readiness.distanceLabel}: race day; even pacing, fuel early`,
  });

  return {
    ...week,
    template: "race_week",
    totalKmRange: [Math.round(cap * 0.75 * 10) / 10, cap],
    sessions,
    warnings: ["No long run this week: race replaces the weekend long effort."],
    rationale: [
      `Race week (${readiness.distanceLabel} on ${raceDay}), ${daysUntilRace} day(s) out.`,
      `Volume capped ~${Math.round((1 - factor) * 100)}% below baseline; freshness over fitness.`,
      `${readiness.distanceLabel} readiness: ${readiness.score}/100.`,
    ],
  };
}

function formatRaceTarget(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function buildEasyBalancePlan(
  ctx: PlanContext,
  week: { weekStart: string; weekLabel: string },
): WeekPlan {
  const base = baselineWeeklyKm(ctx);
  const cap = Math.round(base * 10) / 10;
  const per = Math.round((cap / 4) * 10) / 10;
  return {
    ...week,
    template: "easy_reset",
    totalKmRange: [cap - 4, cap],
    sessions: [
      {
        day: "Tue",
        type: "easy",
        distanceKmRange: [per - 1, per + 1],
        description: "Easy aerobic",
      },
      {
        day: "Thu",
        type: "easy",
        distanceKmRange: [per - 1, per + 1],
        description: "Easy run Z1–Z2",
      },
      {
        day: "Sat",
        type: "easy",
        distanceKmRange: [per, per + 2],
        description: "Easy medium-long",
      },
      {
        day: "Sun",
        type: "recovery",
        distanceKmRange: [4, 6],
        description: "Recovery jog or cross-train",
      },
    ],
    warnings: [],
    rationale: [
      `Only ${ctx.easyHardPct.toFixed(0)}% of runs classified easy, resetting intensity balance.`,
      ctx.intensityAdvice.recommendations[0] ?? "Add easy volume before the next hard session.",
    ],
  };
}

/** Non-consecutive days, so rest days outnumber run days early in a comeback. */
const RETURN_DAYS: Record<number, string[]> = {
  1: ["Wed"],
  2: ["Tue", "Sat"],
  3: ["Tue", "Thu", "Sun"],
  4: ["Mon", "Wed", "Fri", "Sun"],
  5: ["Mon", "Tue", "Thu", "Sat", "Sun"],
};

/**
 * The comeback week, built from the athlete's own pre-gap baseline.
 *
 * The planner used to answer a layoff with a fixed 12–20 km and two generic
 * runs, which told a 22 km/week athlete to do roughly their usual volume and a
 * 70 km/week athlete to do a quarter of theirs. lib/returning already works the
 * ramp out from what they were running before the gap and how long they were
 * away, so the planner reads it rather than guessing a second time. Keeping one
 * source also stops Home and Plan quoting different numbers for the same week.
 */
function buildReturnPlan(
  ctx: PlanContext,
  week: { weekStart: string; weekLabel: string },
  returning: ReturnToRunningPlan,
): WeekPlan {
  const w = returning.weeks[0]!;

  // One run carries the week's longest effort and the rest split what remains,
  // so the sessions add up to the ramp's target rather than drifting past it.
  // Two guards keep that arithmetic sane on the smallest weeks a long layoff
  // produces: drop a run rather than prescribe a token one, and fall back to an
  // even split when the remainder would make an "easy" run longer than the long
  // one.
  const MIN_RUN_KM = 2;
  let runCount = w.runs;
  let longKm = w.longestRunKm;
  let perOther = (w.targetKm - longKm) / Math.max(1, runCount - 1);
  while (runCount > 2 && perOther < MIN_RUN_KM) {
    runCount -= 1;
    perOther = (w.targetKm - longKm) / Math.max(1, runCount - 1);
  }
  if (perOther > longKm) {
    perOther = w.targetKm / runCount;
    longKm = perOther;
  }
  perOther = Math.round(perOther * 10) / 10;
  longKm = Math.round(longKm * 10) / 10;

  const days = RETURN_DAYS[runCount] ?? RETURN_DAYS[3];

  // Unlike the other templates, the session ranges here are a budget rather
  // than guidance: each tops out at its own share, so running the upper end of
  // every session lands on the week's target instead of 20% past it.
  const sessions: PlannedSession[] = days.map((day, i) => {
    // After the even-split fallback every run is the same length, so there is
    // no "longest" to single out.
    const isLong = i === days.length - 1 && longKm > perOther;
    const km = i === days.length - 1 ? longKm : perOther;
    return {
      day,
      type: "easy" as WorkoutType,
      distanceKmRange: [Math.round(km * 0.85 * 10) / 10, Math.round(km * 10) / 10],
      description: isLong
        ? `Longest run of the week: up to ${km} km easy, conversational throughout`
        : "Easy run: conversational pace, stop while it still feels comfortable",
    };
  });

  const rationale = [
    w.focus + ".",
    returning.baseline
      ? `Rebuilding from ${returning.gapDays} days off toward ${returning.target?.weeklyKm ?? returning.baseline.weeklyKm} km/wk: about ${returning.weeksToTarget} weeks at this rate.`
      : `Rebuilding from ${returning.gapDays} days off.`,
    returning.retention.note,
  ];

  return {
    ...week,
    template: "return",
    totalKmRange: [Math.round(w.targetKm * 0.85 * 10) / 10, w.targetKm],
    sessions,
    warnings: w.quality
      ? []
      : ["No quality work this week: easy running first, however good the legs feel."],
    rationale,
  };
}

function buildBasePlan(ctx: PlanContext, week: { weekStart: string; weekLabel: string }): WeekPlan {
  const base = baselineWeeklyKm(ctx);
  let cap = Math.round(base * 1.05 * 10) / 10;
  if (ctx.maxWeeklyKm && cap > ctx.maxWeeklyKm) {
    cap = ctx.maxWeeklyKm;
  }
  const longKm = longRunTargetKm(ctx);
  const easy1 = Math.round(cap * 0.22 * 10) / 10;
  const easy2 = Math.round(cap * 0.2 * 10) / 10;
  const quality = Math.round(cap * 0.18 * 10) / 10;

  // Currency gates quality and the long run on its own. Stale athletes normally
  // get the return plan, but reach here when there is no pre-gap baseline to
  // ramp from, and CURRENCY_CAP still lets their freshness clear 50.
  const current = isTrainingCurrent(ctx.fatigue);
  const allowQuality =
    current && ctx.fatigue.freshness >= 50 && ctx.intensityAdvice.status !== "too_hard";

  const sessions: PlannedSession[] = [
    {
      day: "Tue",
      type: "easy",
      distanceKmRange: [easy1 - 1, easy1 + 2],
      description: "Easy aerobic run",
    },
    {
      day: "Thu",
      type: "easy",
      distanceKmRange: [easy2 - 1, easy2 + 2],
      description: "Easy run, nose breathing",
    },
    current
      ? {
          day: "Sat",
          type: "long",
          distanceKmRange: [longKm - 1, longKm + 2],
          description: `Long easy run: build toward ${longKm.toFixed(0)} km`,
        }
      : {
          day: "Sat",
          type: "easy",
          distanceKmRange: [easy1 - 1, easy1 + 2],
          description: "Easy run: no long run until training is current again",
        },
  ];

  if (allowQuality) {
    sessions.splice(2, 0, {
      day: "Wed",
      type: ctx.consistencyScore.overall >= 60 ? "interval" : "tempo",
      distanceKmRange: [quality, quality + 3],
      description:
        ctx.consistencyScore.overall >= 60
          ? "Intervals: 4–6 × 3–5 min @ 10K effort, full recovery"
          : "Tempo: 20–25 min @ threshold after warm-up",
    });
  } else {
    sessions.push({
      day: "Sun",
      type: "recovery",
      distanceKmRange: [4, 6],
      description: "Optional short recovery run",
    });
  }

  return {
    ...week,
    template: "base",
    totalKmRange: [Math.round(cap * 0.9 * 10) / 10, cap],
    sessions,
    warnings: [],
    rationale: [
      `Targeting ~${cap} km (${ctx.runsPerWeekTarget} runs/week goal).`,
      `Consistency ${ctx.consistencyScore.overall}/100 · freshness ${ctx.fatigue.freshness}/100.`,
      allowQuality
        ? "One quality session fits current freshness and intensity balance."
        : current
          ? "Quality session held: freshness or intensity balance suggests more easy work first."
          : `Quality and long runs held after ${stalenessClause(ctx.fatigue)}: easy running first.`,
    ],
  };
}

/**
 * Names the race the comeback week is deliberately not tapering for.
 *
 * The athlete entered it and the date has not moved, so silence would be the
 * worst option: they would see an easy week and no mention of Sunday. Stating
 * the mismatch in kilometres lets them make the call themselves.
 */
function raceMidComebackWarning(ctx: PlanContext, plan: WeekPlan, raceDate: string): string {
  const r = ctx.raceReadiness!;
  const day = raceDayLabel(raceDate);
  const raceKm = Math.round(RACE_READINESS_CONFIG[r.distance].raceDistanceKm * 10) / 10;
  const weekKm = plan.totalKmRange[1];
  const gap = ctx.returning?.gapDays ?? 0;
  const scale =
    weekKm < raceKm
      ? `this week's ${weekKm} km rebuild is less than the ${raceKm} km race distance`
      : `this week is easy running only`;
  return `${r.distanceLabel} on ${day}, ${r.daysUntilRace} day(s) away: after ${gap} days off, ${scale}. This plan does not taper for it — treat race day as a participation effort or step back to a shorter distance.`;
}

export function buildNextWeekPlan(ctx: PlanContext): WeekPlan {
  const raceDate = ctx.raceReadiness?.raceDate;
  const daysUntilRace = ctx.raceReadiness?.daysUntilRace ?? null;
  const week = planWeekBounds(raceDate, daysUntilRace);

  let plan: WeekPlan;

  const raceInPlanWeek =
    raceDate && daysUntilRace !== null && isRaceInPlanWeek(raceDate, week.weekStart);

  const comingBack = ctx.returning?.weeks.length ? ctx.returning : null;

  if (comingBack) {
    // Coming back outranks every other branch, race week included. A taper is
    // a way of arriving fresh on top of training that happened; there is no
    // training here to taper from, and prescribing sharpeners and a race-length
    // effort to someone weeks out of running is how people get hurt. The race
    // is real and it is on the calendar, so it becomes a warning rather than
    // the shape of the week.
    plan = buildReturnPlan(ctx, week, comingBack);
    if (raceDate && daysUntilRace !== null && raceInPlanWeek) {
      plan = { ...plan, warnings: [...plan.warnings, raceMidComebackWarning(ctx, plan, raceDate)] };
    }
  } else if (raceDate && daysUntilRace !== null && daysUntilRace <= 14 && raceInPlanWeek) {
    plan = buildRaceWeekPlan(ctx, week, daysUntilRace, raceDate);
  } else if (ctx.fatigue.freshness < 40 && (daysUntilRace === null || daysUntilRace > 3)) {
    plan = buildFatiguePlan(ctx, week);
  } else if (daysUntilRace !== null && daysUntilRace <= 14) {
    plan = buildTaperPlan(ctx, week, daysUntilRace);
  } else if (ctx.intensityAdvice.status === "too_hard") {
    plan = buildEasyBalancePlan(ctx, week);
  } else if (ctx.currentWeek.runCount === 0 && (ctx.previousWeek?.runCount ?? 0) === 0) {
    // No pre-gap history to size a ramp from, so this stays generic.
    plan = {
      ...week,
      template: "return",
      totalKmRange: [12, 20],
      sessions: [
        {
          day: "Any",
          type: "easy",
          distanceKmRange: [5, 8],
          description: "Resume with one easy 30–40 min run",
        },
        {
          day: "Any",
          type: "easy",
          distanceKmRange: [5, 7],
          description: "Second easy run later in the week",
        },
      ],
      warnings: [],
      rationale: ["Little recent running: rebuild gradually before adding intensity."],
    };
  } else {
    plan = buildBasePlan(ctx, week);
  }

  const { plan: safePlan } = validatePlan(plan, lastCompletedWeekKm(ctx), ctx.fatigue.tsb);

  return safePlan;
}

export function buildPlanContextFromInsights(
  analytics: {
    fatigue: FatigueSnapshot;
    intensityAdvice: IntensityAdvice;
    consistencyScore: ConsistencyScore;
    raceReadiness: RaceReadiness | null;
    currentWeek: WeekSnapshot;
    previousWeek: WeekSnapshot | null;
    weeklyVolume: WeeklyVolume[];
    easyHard: { easyPct: number };
    goalProgress: { targetPerWeek: number } | null;
    halfMarathonReadiness: { longestRunKm: number };
    returning?: ReturnToRunningPlan | null;
  },
  options: { runsPerWeekTarget: number; maxWeeklyKm?: number },
): PlanContext {
  return {
    fatigue: analytics.fatigue,
    intensityAdvice: analytics.intensityAdvice,
    consistencyScore: analytics.consistencyScore,
    raceReadiness: analytics.raceReadiness,
    currentWeek: analytics.currentWeek,
    previousWeek: analytics.previousWeek,
    weeklyVolume: analytics.weeklyVolume,
    easyHardPct: analytics.easyHard.easyPct,
    runsPerWeekTarget: options.runsPerWeekTarget,
    maxWeeklyKm: options.maxWeeklyKm,
    longestRunKm:
      analytics.raceReadiness?.longestRunKm ?? analytics.halfMarathonReadiness.longestRunKm,
    returning: analytics.returning ?? null,
  };
}

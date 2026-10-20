import { addDays, format, parseISO } from "date-fns";
import type { DashboardInsights } from "@/lib/analytics";
import type { RunActivity } from "@/lib/strava/types";
import {
  matchPlannedVsActual,
  type CalendarWorkout,
  type DayExecutionRow,
  type TrainingCalendarWeek,
} from "@/lib/training-calendar";
import { coachUrl } from "@/lib/coach/domainLinks";
import { paceZoneFor, targetPaceFor, type PaceZone } from "@/lib/today/targetPace";
import { figuresForWorkout, isRest, paceRange, type TodayFigures } from "@/lib/today/todayView";
import { formatKm, formatKmValue, formatPace, formatRaceTime } from "@/lib/utils";

/**
 * Everything Training's current-week view shows (docs/ui-overhaul/SPEC.md §7), as one
 * typed value: a seven-day strip, the week's progress, and the selected day's detail.
 * Components render it and decide nothing.
 *
 * Planned-versus-actual comes from `matchPlannedVsActual`, the same matcher the plan
 * workspace has always used; this only maps its result onto the spec's seven statuses
 * and decides what each day may show. A completed comparison appears only on the day it
 * belongs to (TRAIN-02, TRAIN-04).
 */

export type WeekDayStatus =
  "today" | "upcoming" | "completed" | "variance" | "changed" | "skipped" | "rest";

/** Short form for the strip's narrow cells; the detail uses the long form. */
export const DAY_STATUS_LABELS: Record<WeekDayStatus, { short: string; long: string }> = {
  today: { short: "Today", long: "Today" },
  upcoming: { short: "Upcoming", long: "Upcoming" },
  completed: { short: "Completed", long: "Completed as planned" },
  variance: { short: "Variance", long: "Completed with variance" },
  changed: { short: "Changed", long: "Changed" },
  skipped: { short: "Skipped", long: "Skipped" },
  rest: { short: "Rest", long: "Rest" },
};

export interface WeekDay {
  /** yyyy-MM-dd */
  date: string;
  /** "Mon 19" */
  label: string;
  isToday: boolean;
  status: WeekDayStatus;
  /** Session type, or "Rest". */
  title: string;
  /** "8 km" or "45 min", whichever the plan gives. */
  amount: string | null;
}

export interface SuggestedStructure {
  /** Warm-up / main set / cool-down, for quality sessions only. */
  steps: { name: string; amount: string | null; effort: string }[] | null;
  /** One line for steady sessions, which have no steps worth listing. */
  note: string | null;
}

export interface Comparison {
  distance: { planned: string | null; actual: string };
  pace: { planned: string | null; actual: string | null };
  duration: { planned: string | null; actual: string };
}

export interface DayDetail {
  date: string;
  /** "Mon 19 Oct" */
  dateLabel: string;
  status: WeekDayStatus;
  title: string;
  isRest: boolean;
  /** The prescription, for days still to run (and missed ones, to say what it was). */
  prescription: { figures: TodayFigures; structure: SuggestedStructure | null } | null;
  why: string | null;
  /** Planned against logged, only when a run was logged on this day. */
  comparison: Comparison | null;
  note: string | null;
  activityHref: string | null;
  /** Other sessions on the same day (strength, cross-training). */
  alsoPlanned: string[];
  coachHref: string;
}

export interface WeekSummary {
  /** Sessions done of those planned to date, or the week's plan when it is all ahead. */
  sessions: { done: number; planned: number };
  /** Kilometres logged in the week against kilometres planned. */
  distanceKm: { done: number; planned: number };
}

export interface TrainingWeekView {
  weekStart: string;
  /** "Oct 19–25" */
  rangeLabel: string;
  /** Where the week sits relative to today. */
  relation: "current" | "past" | "future";
  days: WeekDay[];
  summary: WeekSummary;
  selected: DayDetail;
}

const ZONE_WORDS: Record<PaceZone, string> = {
  recovery: "Recovery",
  easy: "Easy",
  steady: "Steady",
  tempo: "Tempo",
  interval: "Interval",
};

const localIso = (d: Date) => format(d, "yyyy-MM-dd");

function rangeLabel(weekStart: string): string {
  const start = parseISO(weekStart);
  const end = addDays(start, 6);
  return start.getMonth() === end.getMonth()
    ? `${format(start, "MMM d")}–${format(end, "d")}`
    : `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}

/** The day's main session: a run if there is one, else whatever comes first. */
function primaryWorkout(workouts: CalendarWorkout[]): CalendarWorkout | null {
  return workouts.find((w) => w.modality === "run") ?? workouts[0] ?? null;
}

function amountFor(w: CalendarWorkout | null): string | null {
  if (!w || isRest(w)) return null;
  if (w.distanceKm != null && w.distanceKm > 0) return formatKm(w.distanceKm);
  if (w.durationMin != null && w.durationMin > 0) return `${Math.round(w.durationMin)} min`;
  return null;
}

function statusFor(
  workout: CalendarWorkout | null,
  row: DayExecutionRow | null,
  runsThatDay: RunActivity[],
  date: string,
  todayIso: string,
): WeekDayStatus {
  if (!workout || isRest(workout)) {
    // A run on a rest day changed the plan; otherwise the day went as planned.
    return runsThatDay.length > 0 && date <= todayIso ? "changed" : "rest";
  }
  if (workout.status === "skipped") return "skipped";
  if (date > todayIso) return workout.status === "modified" ? "changed" : "upcoming";
  if (date === todayIso && runsThatDay.length === 0 && workout.status === "planned") {
    return "today";
  }
  if (workout.status === "modified") return "changed";
  switch (row?.status) {
    case "matched":
    case "marked_done":
      return "completed";
    case "partial":
      return "variance";
    case "missed":
      return "skipped";
    default:
      return "upcoming";
  }
}

/**
 * Overhaul D3: the plan stores prose, not steps, so the structure is suggested from the
 * session type and the athlete's pace bands, and labelled as a suggestion. Quality
 * sessions get warm-up, main set and cool-down; steady running gets one line rather than
 * a table that pretends to more precision than the plan has.
 */
export function suggestedStructure(
  w: CalendarWorkout,
  physiology: DashboardInsights["physiology"] | null,
): SuggestedStructure | null {
  if (w.modality !== "run" || isRest(w)) return null;
  const zone = paceZoneFor(w);
  if (!zone) return null;
  const pace = physiology ? targetPaceFor(zone, physiology) : null;
  const easy = physiology ? targetPaceFor("easy", physiology) : null;
  const at = (label: string, p: typeof pace) => (p ? `${label} pace (${paceRange(p)})` : label);

  if (zone === "tempo" || zone === "interval") {
    return {
      steps: [
        { name: "Warm up", amount: "10–15 min", effort: at("Easy", easy) },
        {
          name: "Main set",
          amount: null,
          effort: at(`${ZONE_WORDS[zone]}`, pace),
        },
        { name: "Cool down", amount: "5–10 min", effort: at("Easy", easy) },
      ],
      note: null,
    };
  }
  return {
    steps: null,
    note: pace
      ? `${ZONE_WORDS[zone]} pace throughout (${paceRange(pace)}).`
      : `${ZONE_WORDS[zone]}, conversational effort throughout.`,
  };
}

function comparisonFor(
  w: CalendarWorkout | null,
  runs: RunActivity[],
  figures: TodayFigures | null,
): Comparison {
  const km = runs.reduce((s, r) => s + r.distanceM / 1000, 0);
  const sec = runs.reduce((s, r) => s + r.movingSec, 0);
  return {
    distance: {
      planned: w?.distanceKm != null && w.distanceKm > 0 ? formatKm(w.distanceKm) : null,
      actual: formatKm(Math.round(km * 10) / 10),
    },
    pace: {
      planned: figures?.pace?.text ?? null,
      actual: km > 0 && sec > 0 ? formatPace(sec / km) : null,
    },
    duration: {
      planned: figures?.duration
        ? `${figures.duration.text}${figures.duration.estimated ? " (est.)" : ""}`
        : null,
      actual: formatRaceTime(sec),
    },
  };
}

function noteFor(status: WeekDayStatus, row: DayExecutionRow | null, hasRuns: boolean) {
  if (status === "changed" && hasRuns && (!row || row.workout.modality === "rest")) {
    return "A run was logged on a planned rest day.";
  }
  if (status === "skipped" && !hasRuns) {
    return row?.workout.status === "skipped"
      ? "Marked as skipped."
      : "No run was logged for this session.";
  }
  if (status === "variance") return row?.note ?? "The logged run differs from the plan.";
  if (row?.status === "marked_done" && !hasRuns) {
    return "Marked done; no matching activity was imported.";
  }
  return null;
}

/** Default selection: the requested day if it is in this week, else today, else Monday. */
export function selectDate(weekStart: string, requested: string | null, todayIso: string) {
  const end = localIso(addDays(parseISO(weekStart), 6));
  if (requested && requested >= weekStart && requested <= end) return requested;
  if (todayIso >= weekStart && todayIso <= end) return todayIso;
  return weekStart;
}

export function buildTrainingWeekView(params: {
  week: TrainingCalendarWeek;
  runs: RunActivity[];
  physiology: DashboardInsights["physiology"] | null;
  selectedDate: string | null;
  now?: Date;
}): TrainingWeekView {
  const { week, runs, physiology } = params;
  const now = params.now ?? new Date();
  const todayIso = localIso(now);
  const weekStart = week.weekStart.slice(0, 10);
  const weekEnd = localIso(addDays(parseISO(weekStart), 6));

  // The matcher compares against a UTC date; noon UTC on the local date keeps the two
  // the same day in every time zone the app runs in.
  const execution = matchPlannedVsActual(week, runs, new Date(`${todayIso}T12:00:00Z`));
  const rowFor = (w: CalendarWorkout | null) =>
    w ? (execution.rows.find((r) => r.workout.id === w.id) ?? null) : null;
  const runsOn = (date: string) => runs.filter((r) => r.date.slice(0, 10) === date);

  const dayData = Array.from({ length: 7 }, (_, i) => {
    const date = localIso(addDays(parseISO(weekStart), i));
    const workouts = week.workouts.filter((w) => w.date.slice(0, 10) === date);
    const workout = primaryWorkout(workouts);
    const row = rowFor(workout);
    const dayRuns = runsOn(date);
    const status = statusFor(workout, row, dayRuns, date, todayIso);
    return { date, workouts, workout, row, dayRuns, status };
  });

  const days: WeekDay[] = dayData.map(({ date, workout, status }) => ({
    date,
    label: format(parseISO(date), "EEE d"),
    isToday: date === todayIso,
    status,
    title: !workout || isRest(workout) ? "Rest" : workout.title,
    amount: amountFor(workout),
  }));

  const sessionDays = dayData.filter((d) => d.workout && !isRest(d.workout));
  const relation = weekEnd < todayIso ? "past" : weekStart > todayIso ? "future" : "current";
  const summary: WeekSummary = {
    sessions: {
      done: sessionDays.filter((d) => d.status === "completed" || d.status === "variance").length,
      planned: sessionDays.length,
    },
    distanceKm: {
      done:
        Math.round(
          runs
            .filter((r) => r.date.slice(0, 10) >= weekStart && r.date.slice(0, 10) <= weekEnd)
            .reduce((s, r) => s + r.distanceM / 1000, 0) * 10,
        ) / 10,
      planned:
        Math.round(
          week.workouts
            .filter((w) => w.modality === "run" && !isRest(w))
            .reduce((s, w) => s + (w.distanceKm ?? 0), 0) * 10,
        ) / 10,
    },
  };

  const date = selectDate(weekStart, params.selectedDate, todayIso);
  const day = dayData.find((d) => d.date === date)!;
  const w = day.workout;
  const rest = !w || isRest(w);
  const figures = w && !rest ? figuresForWorkout(w, physiology) : null;
  const hasRuns = day.dayRuns.length > 0 && date <= todayIso;
  const showPrescription =
    !rest && (day.status === "today" || day.status === "upcoming" || !hasRuns);

  const selected: DayDetail = {
    date,
    dateLabel: format(parseISO(date), "EEE d MMM"),
    status: day.status,
    title: rest ? "Rest day" : w!.title,
    isRest: rest,
    prescription:
      showPrescription && figures
        ? { figures, structure: suggestedStructure(w!, physiology) }
        : null,
    why: w?.purpose || w?.reasoning || null,
    comparison: hasRuns ? comparisonFor(rest ? null : w, day.dayRuns, figures) : null,
    note: noteFor(day.status, day.row, hasRuns),
    activityHref: hasRuns ? `/runs/${encodeURIComponent(day.dayRuns[0]!.id)}` : null,
    alsoPlanned: day.workouts.filter((x) => x !== w && !isRest(x)).map((x) => x.title),
    coachHref: coachUrl({
      source: "training_week",
      date,
      ...(w ? { workout: w.id } : {}),
    }),
  };

  return {
    weekStart,
    rangeLabel: rangeLabel(weekStart),
    relation,
    days,
    summary,
    selected,
  };
}

/** "2 of 5 sessions complete · 16.2 of 42 km", or the plan alone for a week ahead. */
export function summaryLine(view: TrainingWeekView): string {
  const { sessions, distanceKm } = view.summary;
  const s = (n: number) => (n === 1 ? "session" : "sessions");
  if (view.relation === "future") {
    const km = distanceKm.planned > 0 ? ` · ${formatKm(distanceKm.planned)} planned` : "";
    return `${sessions.planned} ${s(sessions.planned)}${km}`;
  }
  const km =
    distanceKm.planned > 0
      ? ` · ${formatKmValue(distanceKm.done)} of ${formatKm(distanceKm.planned)}`
      : distanceKm.done > 0
        ? ` · ${formatKm(distanceKm.done)}`
        : "";
  return `${sessions.done} of ${sessions.planned} ${s(sessions.planned)} complete${km}`;
}

import { format, parseISO } from "date-fns";
import type {
  CalendarIntensity,
  CalendarWorkout,
  TrainingCalendarWeek,
} from "@/lib/training-calendar";
import { isHardTrainingRun } from "@/lib/training-calendar/hardSessionRules";
import { paceZoneFor } from "@/lib/today/targetPace";
import { isRest } from "@/lib/today/todayView";

/**
 * Editing a saved session on Training (overhaul Phase 3b; SPEC §7.6, §9.5): the direct
 * controls — day, session type, distance or duration — as pure functions, so the editor
 * can show the week as it would be, with its totals and warnings, before anything is
 * saved. Target pace is not an input: it follows the session type (overhaul D2).
 *
 * Manual edits are warned about, never blocked (Phase 3b decision): a generated plan
 * still cannot be saved over a high-severity issue, but an athlete's own change is theirs.
 */

export type SessionKind = "easy" | "recovery" | "long" | "tempo" | "interval" | "rest";

export const SESSION_KINDS: {
  kind: SessionKind;
  label: string;
  /** What a session of this kind is written as in the plan. */
  type: string;
  intensity: CalendarIntensity;
  title: string;
}[] = [
  { kind: "easy", label: "Easy", type: "easy", intensity: "easy", title: "Easy run" },
  {
    kind: "recovery",
    label: "Recovery",
    type: "recovery",
    intensity: "recovery",
    title: "Recovery run",
  },
  { kind: "long", label: "Long", type: "long", intensity: "moderate", title: "Long run" },
  { kind: "tempo", label: "Tempo", type: "tempo", intensity: "hard", title: "Tempo run" },
  {
    kind: "interval",
    label: "Intervals",
    type: "interval",
    intensity: "hard",
    title: "Intervals",
  },
  { kind: "rest", label: "Rest", type: "rest", intensity: "rest", title: "Rest" },
];

const KIND = Object.fromEntries(SESSION_KINDS.map((k) => [k.kind, k])) as Record<
  SessionKind,
  (typeof SESSION_KINDS)[number]
>;

/** The editor's starting point for a saved session. */
export function sessionKindOf(w: CalendarWorkout): SessionKind {
  if (isRest(w)) return "rest";
  switch (paceZoneFor(w)) {
    case "interval":
      return "interval";
    case "tempo":
      return "tempo";
    case "steady":
      return "long";
    case "recovery":
      return "recovery";
    default:
      return "easy";
  }
}

export interface SessionEdit {
  /** yyyy-MM-dd, within the week. Another day's sessions trade places with this one. */
  date: string;
  kind: SessionKind;
  /** One of the two, or neither for rest. */
  distanceKm: number | null;
  durationMin: number | null;
}

/** The edit that leaves a session exactly as it is. */
export function currentEdit(w: CalendarWorkout): SessionEdit {
  return {
    date: w.date.slice(0, 10),
    kind: sessionKindOf(w),
    distanceKm: w.distanceKm ?? null,
    durationMin: w.distanceKm != null ? null : (w.durationMin ?? null),
  };
}

const dayName = (date: string) => format(parseISO(date), "EEEE");

/**
 * The week with one session edited. A day move swaps with whatever is planned on the
 * target day (an empty day just receives the session). Everything that changes is
 * marked `modified`, which Training shows as Changed. Ids stay with their sessions, so
 * links to a session (Today, Coach) follow it to its new day.
 */
export function applySessionEdit(
  week: TrainingCalendarWeek,
  workoutId: string,
  edit: SessionEdit,
  now: Date = new Date(),
): TrainingCalendarWeek {
  const source = week.workouts.find((w) => w.id === workoutId);
  if (!source) return week;
  const stamp = now.toISOString();
  const from = source.date.slice(0, 10);
  const to = edit.date;
  const kind = KIND[edit.kind];
  const kindChanged = edit.kind !== sessionKindOf(source);
  const rest = edit.kind === "rest";

  const workouts = week.workouts.map((w): CalendarWorkout => {
    if (w.id === workoutId) {
      return {
        ...w,
        date: to,
        day: dayName(to),
        modality: rest ? "rest" : w.modality === "rest" ? "run" : w.modality,
        type: kindChanged ? kind.type : w.type,
        intensity: kindChanged ? kind.intensity : w.intensity,
        // A new kind gets a plain title; an unchanged one keeps the plan's own wording.
        title: kindChanged ? kind.title : w.title,
        distanceKm: rest ? undefined : (edit.distanceKm ?? undefined),
        durationMin: rest ? undefined : (edit.durationMin ?? undefined),
        status: "modified",
        updatedAt: stamp,
      };
    }
    if (to !== from && w.date.slice(0, 10) === to) {
      return { ...w, date: from, day: dayName(from), status: "modified", updatedAt: stamp };
    }
    return w;
  });

  return {
    ...week,
    workouts: workouts.sort((a, b) => a.date.localeCompare(b.date)),
    // Derived totals on the week would now be stale; drop them so readers recompute.
    totalRunDistanceKm: undefined,
    hardSessionCount: undefined,
    updatedAt: stamp,
  };
}

/** Whether an edit changes anything at all (Save stays disabled until it does). */
export function editChanges(w: CalendarWorkout, edit: SessionEdit): boolean {
  const before = currentEdit(w);
  return (
    before.date !== edit.date ||
    before.kind !== edit.kind ||
    (before.distanceKm ?? null) !== (edit.distanceKm ?? null) ||
    (before.durationMin ?? null) !== (edit.durationMin ?? null)
  );
}

export interface WeekTotals {
  plannedKm: number;
  sessions: number;
  hardSessions: number;
}

/** What the week asks for: run kilometres, sessions and hard sessions, skips excluded. */
export function weekTotals(week: TrainingCalendarWeek): WeekTotals {
  const live = week.workouts.filter((w) => w.status !== "skipped" && !isRest(w));
  return {
    plannedKm:
      Math.round(
        live.filter((w) => w.modality === "run").reduce((s, w) => s + (w.distanceKm ?? 0), 0) * 10,
      ) / 10,
    sessions: live.length,
    hardSessions: live.filter(isHardTrainingRun).length,
  };
}

const MAX_HARD_SESSIONS = 2;

/**
 * What an edited week risks, in words. Warnings only: the save goes ahead regardless.
 * The hard-session limit is the one generation enforces; back-to-back hard days is the
 * rule the planner is asked to follow (lib/ai-planning) but nothing checked until now.
 */
export function editWarnings(week: TrainingCalendarWeek): string[] {
  const warnings: string[] = [];
  const hard = week.workouts.filter(isHardTrainingRun).sort((a, b) => a.date.localeCompare(b.date));
  if (hard.length > MAX_HARD_SESSIONS) {
    warnings.push(
      `${hard.length} hard sessions this week; plans usually keep to ${MAX_HARD_SESSIONS}.`,
    );
  }
  for (let i = 1; i < hard.length; i++) {
    const a = parseISO(hard[i - 1]!.date.slice(0, 10));
    const b = parseISO(hard[i]!.date.slice(0, 10));
    if (Math.round((b.getTime() - a.getTime()) / 86_400_000) === 1) {
      warnings.push(
        `${hard[i - 1]!.title} (${format(a, "EEE")}) and ${hard[i]!.title} (${format(b, "EEE")}) are on consecutive days, with no easy day to recover between them.`,
      );
    }
  }
  return warnings;
}

import { describe, expect, it } from "vitest";
import type { CalendarWorkout, TrainingCalendarWeek } from "@/lib/training-calendar";
import {
  applySessionEdit,
  currentEdit,
  editChanges,
  editWarnings,
  sessionKindOf,
  weekTotals,
} from "../editWeek";

/**
 * Editing a session on Training (overhaul Phase 3b). The week as it would be after an
 * edit, its totals and its warnings are computed before anything is saved.
 */

const NOW = new Date("2026-10-21T09:00:00Z");

function workout(over: Partial<CalendarWorkout> & Pick<CalendarWorkout, "date">): CalendarWorkout {
  return {
    id: `w-${over.date}`,
    day: "Monday",
    modality: "run",
    type: "easy",
    title: "Easy run",
    intensity: "easy",
    purpose: "Aerobic volume.",
    status: "planned",
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
    ...over,
  };
}

const WEEK: TrainingCalendarWeek = {
  id: "week-2026-10-19",
  weekStart: "2026-10-19",
  weekEnd: "2026-10-25",
  source: "manual",
  summary: "",
  workouts: [
    workout({ date: "2026-10-19", day: "Monday", distanceKm: 8 }),
    workout({
      date: "2026-10-20",
      day: "Tuesday",
      type: "tempo",
      title: "Tempo 3 × 10 min",
      intensity: "hard",
      distanceKm: 10,
    }),
    workout({
      date: "2026-10-21",
      day: "Wednesday",
      modality: "rest",
      type: "rest",
      title: "Rest",
      intensity: "rest",
    }),
    workout({
      date: "2026-10-23",
      day: "Friday",
      type: "interval",
      title: "6 × 800 m",
      intensity: "hard",
      distanceKm: 9,
    }),
    workout({
      date: "2026-10-24",
      day: "Saturday",
      type: "long",
      title: "Long run",
      intensity: "moderate",
      distanceKm: 16,
    }),
  ],
  evidenceUsed: [],
  constraintsApplied: [],
  risksManaged: [],
  limitations: [],
  confidence: "medium",
  totalRunDistanceKm: 43,
  hardSessionCount: 2,
  savedAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
};

const byId = (week: TrainingCalendarWeek, id: string) => week.workouts.find((w) => w.id === id)!;

describe("reading a session into the editor", () => {
  it("recognises each kind of session", () => {
    expect(WEEK.workouts.map(sessionKindOf)).toEqual(["easy", "tempo", "rest", "interval", "long"]);
  });

  it("starts from the session as saved, so an untouched editor changes nothing", () => {
    const w = WEEK.workouts[1]!;
    expect(currentEdit(w)).toEqual({
      date: "2026-10-20",
      kind: "tempo",
      distanceKm: 10,
      durationMin: null,
    });
    expect(editChanges(w, currentEdit(w))).toBe(false);
  });
});

describe("applying an edit", () => {
  it("changes distance and marks the session changed, keeping the plan's wording", () => {
    const next = applySessionEdit(
      WEEK,
      "w-2026-10-19",
      { ...currentEdit(WEEK.workouts[0]!), distanceKm: 10 },
      NOW,
    );
    expect(byId(next, "w-2026-10-19")).toMatchObject({
      distanceKm: 10,
      title: "Easy run",
      status: "modified",
    });
  });

  it("rewrites type, intensity and title when the kind changes", () => {
    const next = applySessionEdit(
      WEEK,
      "w-2026-10-19",
      { date: "2026-10-19", kind: "tempo", distanceKm: 8, durationMin: null },
      NOW,
    );
    expect(byId(next, "w-2026-10-19")).toMatchObject({
      type: "tempo",
      intensity: "hard",
      title: "Tempo run",
    });
  });

  it("turns a rest day into a run, and a run into rest with no distance", () => {
    const run = applySessionEdit(
      WEEK,
      "w-2026-10-21",
      { date: "2026-10-21", kind: "easy", distanceKm: 6, durationMin: null },
      NOW,
    );
    expect(byId(run, "w-2026-10-21")).toMatchObject({ modality: "run", distanceKm: 6 });
    const rest = applySessionEdit(
      WEEK,
      "w-2026-10-19",
      { date: "2026-10-19", kind: "rest", distanceKm: 8, durationMin: null },
      NOW,
    );
    expect(byId(rest, "w-2026-10-19")).toMatchObject({ modality: "rest", distanceKm: undefined });
  });

  it("swaps with the session already on the target day", () => {
    const next = applySessionEdit(
      WEEK,
      "w-2026-10-20",
      { ...currentEdit(WEEK.workouts[1]!), date: "2026-10-21" },
      NOW,
    );
    expect(byId(next, "w-2026-10-20")).toMatchObject({ date: "2026-10-21", day: "Wednesday" });
    expect(byId(next, "w-2026-10-21")).toMatchObject({
      date: "2026-10-20",
      day: "Tuesday",
      status: "modified",
    });
  });

  it("moves into an empty day without touching anything else", () => {
    const next = applySessionEdit(
      WEEK,
      "w-2026-10-19",
      { ...currentEdit(WEEK.workouts[0]!), date: "2026-10-22" },
      NOW,
    );
    expect(byId(next, "w-2026-10-19")).toMatchObject({ date: "2026-10-22", day: "Thursday" });
    expect(next.workouts.filter((w) => w.status === "modified")).toHaveLength(1);
    expect(next.workouts.map((w) => w.date)).toEqual([...next.workouts.map((w) => w.date)].sort());
  });

  it("never changes the saved week it was given", () => {
    const before = JSON.stringify(WEEK);
    applySessionEdit(
      WEEK,
      "w-2026-10-19",
      { ...currentEdit(WEEK.workouts[0]!), distanceKm: 20 },
      NOW,
    );
    expect(JSON.stringify(WEEK)).toBe(before);
  });

  it("drops the week's stored totals, which the edit makes stale", () => {
    const next = applySessionEdit(
      WEEK,
      "w-2026-10-19",
      { ...currentEdit(WEEK.workouts[0]!), distanceKm: 12 },
      NOW,
    );
    expect(next.totalRunDistanceKm).toBeUndefined();
    expect(next.hardSessionCount).toBeUndefined();
  });
});

describe("totals and warnings before save", () => {
  it("totals planned kilometres, sessions and hard sessions", () => {
    expect(weekTotals(WEEK)).toEqual({ plannedKm: 43, sessions: 4, hardSessions: 2 });
  });

  it("leaves skipped sessions out of the totals", () => {
    const week = {
      ...WEEK,
      workouts: WEEK.workouts.map((w, i) => (i === 0 ? { ...w, status: "skipped" as const } : w)),
    };
    expect(weekTotals(week)).toEqual({ plannedKm: 35, sessions: 3, hardSessions: 2 });
  });

  it("has nothing to say about a balanced week", () => {
    expect(editWarnings(WEEK)).toEqual([]);
  });

  it("warns about a third hard session", () => {
    const next = applySessionEdit(
      WEEK,
      "w-2026-10-24",
      { date: "2026-10-24", kind: "tempo", distanceKm: 12, durationMin: null },
      NOW,
    );
    expect(editWarnings(next)[0]).toBe("3 hard sessions this week; plans usually keep to 2.");
  });

  it("warns about hard sessions on consecutive days", () => {
    const next = applySessionEdit(
      WEEK,
      "w-2026-10-23",
      { ...currentEdit(WEEK.workouts[3]!), date: "2026-10-21" },
      NOW,
    );
    expect(editWarnings(next)).toEqual([
      "Tempo 3 × 10 min (Tue) and 6 × 800 m (Wed) are on consecutive days, with no easy day to recover between them.",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { addDays, format, startOfWeek } from "date-fns";
import { buildTodayView, findTodayWorkout } from "../todayView";
import { formatRaceTime } from "@/lib/utils";
import { insightsFrom, mkRun } from "@/lib/coaching-context/__tests__/fixtures";
import type { CalendarWorkout, TrainingCalendarWeek } from "@/lib/training-calendar";
import type { RaceGoal } from "@/lib/analytics/readiness";
import type { RunActivity } from "@/lib/strava/types";
import type { Insight } from "@/lib/insights/types";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const today = new Date();

function workout(date: Date, over: Partial<CalendarWorkout> = {}): CalendarWorkout {
  return {
    id: `w-${iso(date)}`,
    date: iso(date),
    day: format(date, "EEE"),
    modality: "run",
    type: "easy",
    title: "Easy aerobic run",
    distanceKm: 8,
    intensity: "easy",
    purpose: "Keep aerobic volume up between quality days.",
    status: "planned",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function week(
  workouts: CalendarWorkout[],
  start = startOfWeek(today, { weekStartsOn: 1 }),
): TrainingCalendarWeek {
  return {
    id: "week",
    weekStart: iso(start),
    weekEnd: iso(addDays(start, 6)),
    source: "manual",
    summary: "",
    workouts,
    evidenceUsed: [],
    constraintsApplied: [],
    risksManaged: [],
    limitations: [],
    confidence: "medium",
    savedAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

/** Steady every-other-day block over ~11 weeks, with effort scores. */
const block = (): RunActivity[] =>
  Array.from({ length: 40 }, (_, i) => ({
    ...mkRun((40 - i) * 2, { id: `b${i}` }),
    relativeEffort: 50,
  }));

/** The block's analytics with a known threshold pace, so pace can be asserted. */
function analyticsWithThreshold(lt: number | null = 280) {
  const f = insightsFrom(block());
  f.analytics.physiology = {
    ...f.analytics.physiology,
    thresholdEconomy: { ...f.analytics.physiology.thresholdEconomy, ltPaceSecPerKm: lt },
  };
  return { ...f, insights: [] as Insight[] };
}

const goal = (over: Partial<RaceGoal> = {}): RaceGoal => ({
  distance: "hm",
  date: iso(addDays(today, 62)),
  targetTimeSec: 6300,
  ...over,
});

describe("today's session", () => {
  it("follows the saved plan: type, distance, duration and pace (TODAY-01)", () => {
    const { analytics, insights } = analyticsWithThreshold(280);
    const view = buildTodayView({
      analytics,
      insights,
      savedWeek: week([workout(today)]),
      raceGoal: goal(),
    });
    expect(view.hasPlan).toBe(true);
    expect(view.session).toMatchObject({ kind: "run", title: "Easy aerobic run", source: "plan" });
    if (view.session.kind !== "run") throw new Error("expected a run");
    expect(view.session.figures.distance).toBe("8 km");
    // 8 km at 5:35–6:05 /km (easy band on a 4:40 threshold) → 45–50 min, flagged as an estimate.
    expect(view.session.figures.duration).toEqual({ text: "45–50 min", estimated: true });
    expect(view.session.figures.pace?.text).toBe("5:35–6:05/km");
    expect(view.session.figures.pace?.basis).toMatch(/threshold pace \(4:40\/km\)/);
  });

  it("explains why and how it serves the race (TODAY-02)", () => {
    const { analytics, insights } = analyticsWithThreshold();
    const view = buildTodayView({
      analytics,
      insights,
      savedWeek: week([workout(today)]),
      raceGoal: goal({ name: "Edinburgh Half Marathon" }),
    });
    if (view.session.kind !== "run") throw new Error("expected a run");
    expect(view.session.why).toMatch(/aerobic volume/);
    expect(view.session.raceRelevance).toMatch(/Edinburgh Half Marathon/);
  });

  it("uses the plan's own duration when it has one", () => {
    const { analytics, insights } = analyticsWithThreshold();
    const view = buildTodayView({
      analytics,
      insights,
      savedWeek: week([workout(today, { durationMin: 52 })]),
      raceGoal: null,
    });
    if (view.session.kind !== "run") throw new Error("expected a run");
    expect(view.session.figures.duration).toEqual({ text: "52 min", estimated: false });
    expect(view.session.raceRelevance).toBeNull();
  });

  it("leaves pace out rather than guessing without a threshold estimate", () => {
    const { analytics, insights } = analyticsWithThreshold(null);
    analytics.physiology.criticalSpeed = {
      ...analytics.physiology.criticalSpeed,
      csPaceSecPerKm: null,
    };
    const view = buildTodayView({
      analytics,
      insights,
      savedWeek: week([workout(today)]),
      raceGoal: null,
    });
    if (view.session.kind !== "run") throw new Error("expected a run");
    expect(view.session.figures.pace).toBeNull();
    expect(view.session.figures.duration).toBeNull();
  });

  it("prescribes recovery guidance, not an empty card, on a rest day (TODAY-03)", () => {
    const { analytics, insights } = analyticsWithThreshold();
    const tomorrow = addDays(today, 1);
    const sameWeek = iso(tomorrow) <= iso(addDays(startOfWeek(today, { weekStartsOn: 1 }), 6));
    const view = buildTodayView({
      analytics,
      insights,
      savedWeek: week([
        workout(today, {
          modality: "rest",
          type: "rest",
          intensity: "rest",
          title: "Rest",
          distanceKm: undefined,
        }),
        workout(tomorrow, { title: "Tempo 3 × 10 min", type: "tempo", intensity: "hard" }),
      ]),
      raceGoal: null,
    });
    expect(view.session.kind).toBe("rest");
    if (view.session.kind !== "rest") return;
    expect(view.session.title).toBe("Recovery day");
    expect(view.session.guidance.mobility).toMatch(/mobility/i);
    expect(view.session.guidance.sleep).toMatch(/sleep/i);
    expect(view.session.guidance.fuel).toMatch(/protein|water/i);
    if (sameWeek) expect(view.session.tomorrow?.title).toBe("Tempo 3 × 10 min");
  });

  it("falls back to the engine when there is no plan", () => {
    const { analytics, insights } = analyticsWithThreshold();
    const view = buildTodayView({ analytics, insights, savedWeek: null, raceGoal: null });
    expect(view.hasPlan).toBe(false);
    expect(view.session.source).toBe("engine");
  });

  it("matches the plan on the date only, never the weekday name", () => {
    const lastWeek = addDays(today, -7);
    const stale = week([workout(lastWeek)], startOfWeek(lastWeek, { weekStartsOn: 1 }));
    expect(findTodayWorkout(stale, iso(today))).toBeNull();
  });
});

describe("readiness exception (TODAY-04)", () => {
  it("is absent when the balance does not change the session", () => {
    const { analytics, insights } = analyticsWithThreshold();
    expect(
      buildTodayView({ analytics, insights, savedWeek: null, raceGoal: null }).readinessException,
    ).toBeNull();
  });

  it("appears, with evidence, when a load spike holds today back", () => {
    const runs = block().map((r, i) =>
      i >= 37 ? { ...r, distanceM: 25_000, relativeEffort: 125 } : r,
    );
    const { analytics } = insightsFrom(runs);
    const insights: Insight[] = [];
    const view = buildTodayView({ analytics, insights, savedWeek: null, raceGoal: null });
    expect(view.readinessException).toMatchObject({ affects: true, direction: "held_back" });
    expect(view.readinessException?.evidence.join(" ")).toMatch(/% of chronic load/);
  });
});

describe("race outlook and recent progress (TODAY-05)", () => {
  it("names the race, counts down and gives a deterministic status", () => {
    const { analytics, insights, runs } = analyticsWithThreshold();
    const view = buildTodayView({
      analytics,
      insights,
      runs,
      savedWeek: null,
      raceGoal: goal({ name: "Edinburgh Half Marathon" }),
    });
    expect(view.outlook.kind).toBe("race");
    if (view.outlook.kind !== "race") return;
    expect(view.outlook.name).toBe("Edinburgh Half Marathon");
    expect(view.outlook.daysToRace).toBe(62);
    expect(view.outlook.goalTime).toBe("1:45:00");
    expect(["ahead", "on_track", "at_risk", "not_enough_evidence"]).toContain(
      view.outlook.status?.status,
    );
  });

  it("rounds the estimated range instead of showing seconds it cannot know", () => {
    const { analytics, insights, runs } = analyticsWithThreshold();
    const view = buildTodayView({ analytics, insights, runs, savedWeek: null, raceGoal: goal() });
    if (view.outlook.kind !== "race" || !view.outlook.likelyRange) return;
    // Half marathon: whole minutes, so every bound ends in ":00".
    expect(view.outlook.likelyRange).toMatch(/^\d:\d{2}:00–\d:\d{2}:00$/);
  });

  it("falls back to the distance when the race has no name", () => {
    const { analytics, insights } = analyticsWithThreshold();
    const view = buildTodayView({ analytics, insights, savedWeek: null, raceGoal: goal() });
    expect(view.outlook.kind === "race" && view.outlook.name).toBe("Half marathon");
  });

  it("shows recent progress, not a countdown, without a race", () => {
    const { analytics, insights } = analyticsWithThreshold();
    const view = buildTodayView({ analytics, insights, savedWeek: null, raceGoal: null });
    expect(view.outlook.kind).toBe("no_race");
    if (view.outlook.kind !== "no_race") return;
    expect(view.outlook.direction).toMatch(/fitness|weeks/i);
    expect(view.outlook.pastRace).toBeNull();
  });

  it("keeps a past race as a prompt rather than counting down to it", () => {
    const { analytics, insights } = analyticsWithThreshold();
    const view = buildTodayView({
      analytics,
      insights,
      savedWeek: null,
      raceGoal: goal({ date: iso(addDays(today, -3)), name: "Spring 10K", distance: "10k" }),
    });
    expect(view.outlook.kind).toBe("no_race");
    expect(view.outlook.kind === "no_race" && view.outlook.pastRace?.name).toBe("Spring 10K");
  });
});

describe("formatRaceTime", () => {
  it("prints race clock times", () => {
    expect(formatRaceTime(6300)).toBe("1:45:00");
    expect(formatRaceTime(1470)).toBe("24:30");
    expect(formatRaceTime(3605)).toBe("1:00:05");
  });
});

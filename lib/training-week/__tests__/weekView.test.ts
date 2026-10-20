import { describe, expect, it } from "vitest";
import type { RunActivity } from "@/lib/strava/types";
import type { CalendarWorkout, TrainingCalendarWeek } from "@/lib/training-calendar";
import { buildTrainingWeekView, selectDate, summaryLine, suggestedStructure } from "../weekView";

/**
 * Training's week (SPEC §7, ACCEPTANCE TRAIN-01…04). Wednesday 21 Oct 2026 is "today";
 * the week runs Monday 19 to Sunday 25. Threshold pace 4:42/km gives easy 5:40–6:05,
 * tempo 4:35–4:50 and interval 4:20–4:35 (lib/today/targetPace).
 */

const NOW = new Date(2026, 9, 21, 10, 0);
const WEEK_START = "2026-10-19";
const physiology = {
  thresholdEconomy: { ltPaceSecPerKm: 282 },
  criticalSpeed: { csPaceSecPerKm: null },
} as never;

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

function week(workouts: CalendarWorkout[]): TrainingCalendarWeek {
  return {
    id: `week-${WEEK_START}`,
    weekStart: WEEK_START,
    weekEnd: "2026-10-25",
    source: "manual",
    summary: "",
    workouts,
    evidenceUsed: [],
    constraintsApplied: [],
    risksManaged: [],
    limitations: [],
    confidence: "medium",
    savedAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
  };
}

function run(date: string, km: number, paceSec: number, id = `r-${date}`): RunActivity {
  return {
    id,
    date: `${date}T07:30:00`,
    name: "Morning Run",
    distanceM: km * 1000,
    movingSec: Math.round(km * paceSec),
    elapsedSec: Math.round(km * paceSec),
  } as RunActivity;
}

const PLAN = week([
  workout({ date: "2026-10-19", title: "Easy aerobic run", distanceKm: 8 }),
  workout({
    date: "2026-10-20",
    type: "tempo",
    title: "Tempo 3 × 10 min",
    intensity: "hard",
    distanceKm: 10,
  }),
  workout({ date: "2026-10-21", title: "Easy run", distanceKm: 6 }),
  workout({ date: "2026-10-22", modality: "rest", type: "rest", title: "Rest", intensity: "rest" }),
  workout({
    date: "2026-10-23",
    type: "interval",
    title: "6 × 800 m",
    intensity: "hard",
    distanceKm: 9,
  }),
  workout({
    date: "2026-10-24",
    type: "long",
    title: "Long run",
    intensity: "moderate",
    distanceKm: 16,
  }),
]);

const RUNS = [run("2026-10-19", 8.1, 350), run("2026-10-20", 6, 290)];

const view = (selectedDate: string | null, plan = PLAN, runs = RUNS) =>
  buildTrainingWeekView({ week: plan, runs, physiology, selectedDate, now: NOW });

describe("the week strip", () => {
  it("always shows seven days, Monday first, with today identified (TRAIN-01)", () => {
    const v = view(null);
    expect(v.days.map((d) => d.label)).toEqual([
      "Mon 19",
      "Tue 20",
      "Wed 21",
      "Thu 22",
      "Fri 23",
      "Sat 24",
      "Sun 25",
    ]);
    expect(v.days.filter((d) => d.isToday).map((d) => d.date)).toEqual(["2026-10-21"]);
    expect(v.relation).toBe("current");
    expect(v.rangeLabel).toBe("Oct 19–25");
  });

  it("maps planned against logged onto the spec's statuses", () => {
    expect(view(null).days.map((d) => d.status)).toEqual([
      "completed", // 8.1 of 8 km
      "variance", // 6 of 10 km
      "today", // nothing logged yet
      "rest",
      "upcoming",
      "upcoming",
      "rest", // nothing planned
    ]);
  });

  it("calls a past session with no run skipped, and a run on a rest day a change", () => {
    const v = buildTrainingWeekView({
      week: PLAN,
      runs: [run("2026-10-20", 10, 285), run("2026-10-22", 5, 360)],
      physiology,
      selectedDate: null,
      now: new Date(2026, 9, 23, 10, 0),
    });
    expect(v.days[0]!.status).toBe("skipped");
    expect(v.days[3]!.status).toBe("changed");
  });

  it("honours sessions the athlete edited or skipped in the plan", () => {
    const plan = week([
      workout({ date: "2026-10-19", status: "skipped", distanceKm: 8 }),
      workout({ date: "2026-10-23", status: "modified", distanceKm: 6 }),
    ]);
    const v = view(null, plan, []);
    expect(v.days[0]!.status).toBe("skipped");
    expect(v.days[4]!.status).toBe("changed");
  });

  it("marks today complete once today's run is logged", () => {
    const v = view(null, PLAN, [...RUNS, run("2026-10-21", 6.2, 355)]);
    expect(v.days[2]).toMatchObject({ isToday: true, status: "completed" });
  });

  it("shows the session type and its distance in each cell", () => {
    const d = view(null).days;
    expect(d[1]).toMatchObject({ title: "Tempo 3 × 10 min", amount: "10 km" });
    expect(d[3]).toMatchObject({ title: "Rest", amount: null });
  });
});

describe("selection", () => {
  it("keeps a requested day in this week, else today, else Monday", () => {
    expect(selectDate(WEEK_START, "2026-10-23", "2026-10-21")).toBe("2026-10-23");
    expect(selectDate(WEEK_START, "2026-11-02", "2026-10-21")).toBe("2026-10-21");
    expect(selectDate(WEEK_START, null, "2026-11-04")).toBe(WEEK_START);
  });

  it("shows only the selected day's session and state (TRAIN-02)", () => {
    const v = view("2026-10-23");
    expect(v.selected).toMatchObject({
      date: "2026-10-23",
      title: "6 × 800 m",
      status: "upcoming",
    });
    expect(v.selected.comparison).toBeNull();
  });
});

describe("an upcoming session (TRAIN-04)", () => {
  it("has its prescription, structure, purpose and target effort, and no comparison", () => {
    const s = view("2026-10-23").selected;
    expect(s.prescription?.figures).toMatchObject({
      distance: "9 km",
      pace: { text: "4:20–4:35/km" },
    });
    expect(s.prescription?.structure?.steps?.map((x) => x.name)).toEqual([
      "Warm up",
      "Main set",
      "Cool down",
    ]);
    expect(s.prescription?.structure?.steps?.[1]?.effort).toBe("Interval pace (4:20–4:35/km)");
    expect(s.why).toBe("Aerobic volume.");
    expect(s.comparison).toBeNull();
    expect(s.activityHref).toBeNull();
  });

  it("links Coach to the day and the session", () => {
    expect(view("2026-10-23").selected.coachHref).toBe(
      "/coach?source=training_week&date=2026-10-23&workout=w-2026-10-23",
    );
  });
});

describe("a completed session (TRAIN-03)", () => {
  it("compares planned with logged distance, pace and duration, and links the activity", () => {
    const s = view("2026-10-19").selected;
    expect(s.status).toBe("completed");
    expect(s.prescription).toBeNull();
    expect(s.comparison).toEqual({
      distance: { planned: "8 km", actual: "8.1 km" },
      pace: { planned: "5:40–6:05/km", actual: "5:50/km" },
      duration: { planned: "45–50 min (est.)", actual: "47:15" },
    });
    expect(s.activityHref).toBe("/runs/r-2026-10-19");
  });

  it("explains a material variance", () => {
    const s = view("2026-10-20").selected;
    expect(s.status).toBe("variance");
    expect(s.note).toMatch(/10 km vs 6\.0 km/);
  });
});

describe("a missed session", () => {
  it("still says what was planned, and that nothing was logged", () => {
    const s = view("2026-10-19", PLAN, []).selected;
    expect(s.status).toBe("skipped");
    expect(s.prescription?.figures.distance).toBe("8 km");
    expect(s.comparison).toBeNull();
    expect(s.note).toBe("No run was logged for this session.");
  });
});

describe("suggested structure (overhaul D3)", () => {
  it("is one line for steady running, not a table", () => {
    const s = suggestedStructure(PLAN.workouts[0]!, physiology);
    expect(s).toEqual({ steps: null, note: "Easy pace throughout (5:40–6:05/km)." });
  });

  it("describes effort without a pace when physiology has none", () => {
    const s = suggestedStructure(PLAN.workouts[1]!, null);
    expect(s?.steps?.[1]?.effort).toBe("Tempo");
  });

  it("is absent for rest and for anything that is not a run", () => {
    expect(suggestedStructure(PLAN.workouts[3]!, physiology)).toBeNull();
    expect(
      suggestedStructure(workout({ date: "2026-10-19", modality: "strength" }), physiology),
    ).toBeNull();
  });
});

describe("the weekly summary", () => {
  it("counts sessions done and kilometres logged against the plan", () => {
    const v = view(null);
    expect(v.summary).toEqual({
      sessions: { done: 2, planned: 5 },
      distanceKm: { done: 14.1, planned: 49 },
    });
    expect(summaryLine(v)).toBe("2 of 5 sessions complete · 14.1 of 49 km");
  });

  it("states only the plan for a week that has not started", () => {
    const v = buildTrainingWeekView({
      week: PLAN,
      runs: [],
      physiology,
      selectedDate: null,
      now: new Date(2026, 9, 14),
    });
    expect(v.relation).toBe("future");
    expect(summaryLine(v)).toBe("5 sessions · 49 km planned");
  });
});

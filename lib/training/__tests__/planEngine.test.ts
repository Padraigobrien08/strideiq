import { describe, expect, it, vi } from "vitest";
import {
  buildNextWeekPlan,
  isRaceInPlanWeek,
  planWeekBounds,
  type PlanContext,
} from "../planEngine";
import { countHardSessions } from "../safety";
import type { FatigueSnapshot } from "@/lib/analytics/fatigue";
import type { IntensityAdvice } from "@/lib/analytics/intensityAdvisor";
import type { ConsistencyScore } from "@/lib/analytics/consistency";
import type { WeekSnapshot } from "@/lib/analytics/week";
import type { ReturnToRunningPlan } from "@/lib/returning/returnToRunning";

const week: WeekSnapshot = {
  weekStart: "2025-05-12",
  weekLabel: "May 12 – May 18",
  runCount: 3,
  distanceKm: 40,
  longestRunKm: 14,
  easyCount: 2,
  hardCount: 1,
  avgPaceSecPerKm: 300,
};

function baseContext(overrides: Partial<PlanContext> = {}): PlanContext {
  const fatigue: FatigueSnapshot = {
    ctl: 80,
    atl: 90,
    tsb: -10,
    formPct: -15,
    freshness: 55,
    label: "Neutral",
    readiness: { balance: "neutral", currency: "current", volumeRatio: null },
    restDaysSinceLastRun: 1,
    evidence: [],
    usesProxyLoad: false,
    loadSource: "training_load",
    loadEvidence: {
      sufficient: true,
      confidence: "high",
      historyDays: 120,
      runCount: 40,
      reasons: [],
    },
  };
  const intensityAdvice: IntensityAdvice = {
    status: "balanced",
    easyTargetPct: 80,
    currentEasyPct: 65,
    hardRunsLast14d: 1,
    recommendations: [],
    suggestedWeekPlan: [],
  };
  const consistencyScore: ConsistencyScore = {
    overall: 70,
    label: "Building",
    frequency: 75,
    volumeStability: 60,
    streakWeeks: 4,
    evidence: [],
  };
  return {
    fatigue,
    intensityAdvice,
    consistencyScore,
    raceReadiness: null,
    currentWeek: week,
    previousWeek: { ...week, distanceKm: 45 },
    weeklyVolume: [
      { weekStart: "2025-04-01", label: "Apr 1", distanceKm: 42, runCount: 3 },
      { weekStart: "2025-04-08", label: "Apr 8", distanceKm: 38, runCount: 3 },
      { weekStart: "2025-04-15", label: "Apr 15", distanceKm: 44, runCount: 4 },
      { weekStart: "2025-05-12", label: "May 12", distanceKm: 40, runCount: 3 },
    ],
    easyHardPct: 65,
    runsPerWeekTarget: 3,
    longestRunKm: 16,
    returning: null,
    ...overrides,
  };
}

describe("buildNextWeekPlan", () => {
  it("holds quality and the long run when training is not current", () => {
    // Stale but with no return ramp (no pre-gap baseline), so the base plan runs.
    // Freshness 65 is the rusty CURRENCY_CAP and would otherwise unlock quality.
    const plan = buildNextWeekPlan(
      baseContext({
        fatigue: {
          ...baseContext().fatigue,
          freshness: 65,
          readiness: { balance: "neutral", currency: "rusty", volumeRatio: 0.3 },
          restDaysSinceLastRun: 10,
        },
      }),
    );
    expect(plan.template).toBe("base");
    const types = plan.sessions.map((s) => s.type);
    expect(types).not.toContain("tempo");
    expect(types).not.toContain("interval");
    expect(types).not.toContain("long");
    expect(plan.rationale.join(" ")).toMatch(/10 days without a run/);
  });

  it("still plans quality and a long run for a current athlete", () => {
    const types = buildNextWeekPlan(baseContext()).sessions.map((s) => s.type);
    expect(types).toContain("long");
    expect(types.some((t) => t === "tempo" || t === "interval")).toBe(true);
  });

  it("uses recovery template when fatigued", () => {
    const plan = buildNextWeekPlan(
      baseContext({
        fatigue: {
          ...baseContext().fatigue,
          freshness: 30,
          label: "Fatigued",
        },
      }),
    );
    expect(plan.template).toBe("recovery");
    expect(countHardSessions(plan)).toBe(0);
    expect(plan.rationale.length).toBeGreaterThan(0);
  });

  it("uses race week plan (not Sat long + Sun recovery) when race is on Sunday", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-05-20T12:00:00")); // Tue before Sun May 25
    try {
      const raceDate = "2025-05-25";
      const plan = buildNextWeekPlan(
        baseContext({
          raceReadiness: {
            distance: "hm",
            distanceLabel: "Half marathon",
            daysUntilRace: 5,
            raceDate,
            score: 75,
            label: "Nearly there",
            probabilityBand: "On track",
            longestRunKm: 18,
            longestRunPct: 90,
            fourWeekVolumeKm: 140,
            volumePct: 85,
            gaps: [],
          },
        }),
      );
      expect(plan.template).toBe("race_week");
      expect(plan.sessions.some((s) => s.type === "long")).toBe(false);
      const raceSession = plan.sessions.find((s) => s.type === "race");
      expect(raceSession?.day).toBe("Sun");
      expect(plan.sessions.find((s) => s.day === "Sun" && s.type === "recovery")).toBe(undefined);
      expect(isRaceInPlanWeek(raceDate, plan.weekStart)).toBe(true);
      const bounds = planWeekBounds(raceDate, 5);
      expect(bounds.weekLabel).toContain("May 19");
    } finally {
      vi.useRealTimers();
    }
  });

  it("plans the week containing the race, not the calendar week after", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-05-19T12:00:00")); // Mon, race Sun May 25
    try {
      const raceDate = "2025-05-25";
      const bounds = planWeekBounds(raceDate, 6);
      expect(bounds.weekStart).toBe("2025-05-19");
      expect(isRaceInPlanWeek(raceDate, bounds.weekStart)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tapers volume when race is 8–14 days out and not in the planned taper week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-05-01T12:00:00"));
    try {
      const plan = buildNextWeekPlan(
        baseContext({
          raceReadiness: {
            distance: "hm",
            distanceLabel: "Half marathon",
            daysUntilRace: 12,
            raceDate: "2025-05-13", // Tue — plan week is May 12–18 containing race
            score: 75,
            label: "Nearly there",
            probabilityBand: "On track",
            longestRunKm: 18,
            longestRunPct: 90,
            fourWeekVolumeKm: 140,
            volumePct: 85,
            gaps: [],
          },
        }),
      );
      // Race falls in plan week → race_week, not generic taper
      expect(plan.template).toBe("race_week");
      expect(plan.totalKmRange[1]).toBeLessThan(45);
    } finally {
      vi.useRealTimers();
    }
  });

  it("avoids intervals when intensity too hard", () => {
    const plan = buildNextWeekPlan(
      baseContext({
        intensityAdvice: {
          ...baseContext().intensityAdvice,
          status: "too_hard",
          currentEasyPct: 15,
          hardRunsLast14d: 4,
        },
      }),
    );
    expect(plan.template).toBe("easy_reset");
    expect(countHardSessions(plan)).toBe(0);
  });

  it("includes medical disclaimer in warnings", () => {
    const plan = buildNextWeekPlan(baseContext());
    expect(plan.warnings.some((w) => w.includes("Not a substitute"))).toBe(true);
  });
});

describe("the comeback week comes from the athlete's own baseline", () => {
  /** A returning plan shaped like lib/returning produces for a real gap. */
  function returningPlan(
    over: Partial<ReturnToRunningPlan> = {},
    week: Partial<ReturnToRunningPlan["weeks"][number]> = {},
  ): ReturnToRunningPlan {
    return {
      gapDays: 21,
      baseline: { weeklyKm: 40, longestRunKm: 16, weeksSampled: 4 },
      retention: { aerobicPct: 95, sharpnessPct: 88, note: "Endurance holds up." },
      weeksToTarget: 9,
      target: {
        source: "pre-gap" as const,
        weeklyKm: 40,
        label: "Back to before the gap",
        detail: "",
      },
      targetOptions: [],
      firstStep: "Start with 3 easy runs this week.",
      weeks: [
        {
          week: 1,
          targetKm: 20,
          longestRunKm: 8,
          runs: 3,
          quality: false,
          focus: "Easy running only, on non-consecutive days",
          ...week,
        },
      ],
      ...over,
    };
  }

  it("plans the ramp's first week rather than a fixed 12–20 km", () => {
    const plan = buildNextWeekPlan(baseContext({ returning: returningPlan() }));
    expect(plan.template).toBe("return");
    expect(plan.totalKmRange[1]).toBe(20);
    expect(plan.sessions).toHaveLength(3);
  });

  // The old fixed range told a 22 km/week athlete to run their usual volume and
  // a 70 km/week athlete a quarter of theirs. The week has to scale.
  it("scales with the athlete, not a constant", () => {
    const small = buildNextWeekPlan(
      baseContext({
        returning: returningPlan(
          { baseline: { weeklyKm: 20, longestRunKm: 8, weeksSampled: 4 } },
          { targetKm: 10, longestRunKm: 4 },
        ),
      }),
    );
    const big = buildNextWeekPlan(
      baseContext({
        returning: returningPlan(
          { baseline: { weeklyKm: 80, longestRunKm: 30, weeksSampled: 4 } },
          { targetKm: 40, longestRunKm: 16 },
        ),
      }),
    );
    expect(big.totalKmRange[1]).toBeGreaterThan(small.totalKmRange[1] * 3);
  });

  // The other templates treat session ranges as guidance, so their upper bounds
  // sum well past the stated week. On a comeback the week total is the point:
  // running the top of every session must not overshoot it.
  it("never sums the sessions above the ramp's target, even at the top of each range", () => {
    for (const [targetKm, longestRunKm, runs] of [
      [10, 4, 3],
      [20, 8, 3],
      [40, 16, 4],
      [6, 2.4, 3],
    ] as const) {
      const plan = buildNextWeekPlan(
        baseContext({ returning: returningPlan({}, { targetKm, longestRunKm, runs }) }),
      );
      const high = plan.sessions.reduce((s, x) => s + x.distanceKmRange[1], 0);
      expect(high, `target ${targetKm}`).toBeLessThanOrEqual(targetKm + 0.1);
      expect(high, `target ${targetKm}`).toBeGreaterThan(targetKm * 0.9);
    }
  });

  it("holds all quality work while the ramp does", () => {
    const plan = buildNextWeekPlan(baseContext({ returning: returningPlan() }));
    expect(countHardSessions(plan)).toBe(0);
    expect(plan.warnings.some((w) => /no quality work/i.test(w))).toBe(true);
  });

  it("spaces the runs so no two land on consecutive days", () => {
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const plan = buildNextWeekPlan(baseContext({ returning: returningPlan() }));
    const idx = plan.sessions.map((s) => order.indexOf(s.day!)).sort((a, b) => a - b);
    for (let i = 1; i < idx.length; i++) expect(idx[i] - idx[i - 1]).toBeGreaterThan(1);
  });

  it("falls back to the generic return week when there is no baseline to ramp from", () => {
    const plan = buildNextWeekPlan(
      baseContext({
        returning: returningPlan({ baseline: null, weeks: [] }),
        currentWeek: { ...week, runCount: 0, distanceKm: 0 },
        previousWeek: { ...week, runCount: 0, distanceKm: 0 },
      }),
    );
    expect(plan.template).toBe("return");
    expect(plan.totalKmRange).toEqual([12, 20]);
  });

  /** A half-marathon four days out, in the middle of a comeback. */
  function raceMidComeback() {
    return baseContext({
      returning: returningPlan(),
      raceReadiness: {
        distance: "hm",
        distanceLabel: "Half marathon",
        daysUntilRace: 4,
        raceDate: "2025-05-18",
        score: 40,
        label: "In training",
        probabilityBand: "Off track",
        longestRunKm: 16,
        longestRunPct: 75,
        fourWeekVolumeKm: 20,
        volumePct: 15,
        gaps: [],
      },
    });
  }

  // A taper is how you arrive fresh on top of training that happened. There is
  // none here, so race week loses to the ramp: prescribing sharpeners and a
  // race-length effort to someone three weeks out of running is how people get
  // hurt. The race is still on the calendar, so it has to be said out loud.
  it("keeps the comeback ramp even when race day falls in the plan week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-05-14T08:00:00Z"));
    try {
      const plan = buildNextWeekPlan(raceMidComeback());
      expect(plan.template).toBe("return");
      expect(plan.sessions.every((s) => s.type === "easy")).toBe(true);
      expect(countHardSessions(plan)).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns about the race it is not tapering for, in the athlete's own numbers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-05-14T08:00:00Z"));
    try {
      const plan = buildNextWeekPlan(raceMidComeback());
      const warning = plan.warnings.find((w) => /half marathon/i.test(w));
      expect(warning).toBeDefined();
      expect(warning).toContain("Sun");
      expect(warning).toContain("21.1 km"); // the race distance it falls short of
      expect(warning).toContain("20 km"); // what the ramp actually plans
      expect(warning).toMatch(/does not taper/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("says nothing about a race when there isn't one", () => {
    const plan = buildNextWeekPlan(baseContext({ returning: returningPlan() }));
    expect(plan.warnings.some((w) => /taper/i.test(w))).toBe(false);
  });

  it("leaves a currently-training athlete's week alone", () => {
    const plan = buildNextWeekPlan(baseContext({ returning: null }));
    expect(plan.template).not.toBe("return");
  });
});

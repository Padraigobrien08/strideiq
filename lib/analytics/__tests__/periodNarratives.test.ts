import { describe, expect, it } from "vitest";
import {
  buildMonthlyNarrative,
  buildPreRaceNarrative,
  type MonthlyNarrativeInput,
  type PreRaceNarrativeInput,
} from "../narrative";
import type { RaceReadiness } from "../readiness";
import type { FatigueSnapshot } from "../fatigue";
import type { RaceStrategy } from "../raceStrategy";

function monthlyBase(overrides: Partial<MonthlyNarrativeInput> = {}): MonthlyNarrativeInput {
  return {
    monthlyVolume: [
      { month: "2026-05", label: "May 2026", distanceKm: 120, runCount: 16 },
      { month: "2026-06", label: "Jun 2026", distanceKm: 150, runCount: 18 },
    ],
    efficiencyMoM: {
      currentMonth: "2026-06",
      priorMonth: "2026-05",
      pctChange: -2,
      narrative: "Aerobic efficiency improved 2% month over month.",
      comparableCount: 12,
    },
    trainingBlocks: [
      {
        weekStart: "2026-05-04",
        label: "May 4 – May 31",
        distanceKm: 120,
        runCount: 16,
        longestRunKm: 18,
      },
      {
        weekStart: "2026-06-01",
        label: "Jun 1 – Jun 28",
        distanceKm: 150,
        runCount: 18,
        longestRunKm: 21,
      },
    ],
    bestBlock: {
      weekStart: "2026-06-01",
      label: "Jun 1 – Jun 28",
      distanceKm: 150,
      runCount: 18,
      longestRunKm: 21,
    },
    recentPrs: [],
    consistencyScore: {
      overall: 80,
      label: "Strong",
      frequency: 4,
      volumeStability: 0.8,
      streakWeeks: 5,
      evidence: [],
    },
    workoutTypeMix: [],
    dataConfidence: "high",
    ...overrides,
  };
}

describe("buildMonthlyNarrative", () => {
  it("describes a building month with month-over-month volume", () => {
    const n = buildMonthlyNarrative(monthlyBase());
    expect(n.monthLabel).toBe("Jun 2026");
    expect(n.paragraphs.join(" ")).toMatch(/150 km/);
    expect(n.paragraphs.join(" ")).toMatch(/\+?25%|up 25%/i);
    expect(n.headline.length).toBeGreaterThan(0);
  });

  it("flags a breakthrough month when PRs were set", () => {
    const n = buildMonthlyNarrative(
      monthlyBase({
        recentPrs: [
          {
            date: "2026-06-10",
            bucket: "10k",
            label: "10K",
            timeSec: 2400,
            runId: "r1",
            runName: "10K",
            isNewPr: true,
          },
        ],
      }),
    );
    expect(n.headline).toMatch(/breakthrough|PR/i);
    expect(n.severity).toBe("positive"); // PR + efficiency improving
    expect(n.highlights.some((h) => /PR/.test(h))).toBe(true);
  });

  it("warns on a sharp volume drop", () => {
    const n = buildMonthlyNarrative(
      monthlyBase({
        monthlyVolume: [
          { month: "2026-05", label: "May 2026", distanceKm: 160, runCount: 18 },
          { month: "2026-06", label: "Jun 2026", distanceKm: 90, runCount: 10 },
        ],
      }),
    );
    expect(n.severity).toBe("warning");
  });

  it("lowers confidence with under two months of data", () => {
    const n = buildMonthlyNarrative(
      monthlyBase({
        monthlyVolume: [{ month: "2026-06", label: "Jun 2026", distanceKm: 90, runCount: 10 }],
      }),
    );
    expect(n.confidence).toBe("low");
  });
});

const readiness = (overrides: Partial<RaceReadiness>): RaceReadiness =>
  ({
    distance: "hm",
    distanceLabel: "Half marathon",
    daysUntilRace: 10,
    raceDate: "2026-07-20",
    score: 72,
    label: "On track",
    probabilityBand: "Likely finish",
    longestRunKm: 19,
    longestRunPct: 90,
    fourWeekVolumeKm: 160,
    volumePct: 90,
    gaps: [],
    ...overrides,
  }) as RaceReadiness;

const fatigue = (freshness: number): FatigueSnapshot => ({
  ctl: 50,
  atl: 45,
  tsb: 5,
  formPct: 3.75,
  freshness,
  label: "fresh",
  readiness: { balance: "fresh", currency: "current", volumeRatio: null },
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
});

const strategy = (fadeRisk: RaceStrategy["fadeRisk"]): RaceStrategy =>
  ({
    targetTimeSec: 5400,
    targetTimeSource: "goal",
    distanceKm: 21.1,
    distanceLabel: "Half marathon",
    strategy: "even",
    splits: [],
    fadeRisk,
    fadeFactors: ["Long-run volume slightly low"],
    narrative: ["Start controlled through 10 km, then press."],
    warnings: [],
    uncertaintyNote: "",
  }) as RaceStrategy;

function preRaceBase(overrides: Partial<PreRaceNarrativeInput> = {}): PreRaceNarrativeInput {
  return {
    raceReadiness: readiness({}),
    fatigue: fatigue(58),
    raceStrategy: strategy("low"),
    dataConfidence: "high",
    ...overrides,
  };
}

describe("buildPreRaceNarrative", () => {
  it("returns null when there is no race goal", () => {
    expect(buildPreRaceNarrative(preRaceBase({ raceReadiness: null }))).toBeNull();
  });

  it("returns null outside the taper window", () => {
    expect(
      buildPreRaceNarrative(preRaceBase({ raceReadiness: readiness({ daysUntilRace: 40 }) })),
    ).toBeNull();
  });

  it("produces a race lead-in with a game plan when in the window", () => {
    const n = buildPreRaceNarrative(preRaceBase())!;
    expect(n).not.toBeNull();
    expect(n.daysUntilRace).toBe(10);
    expect(n.gamePlan.length).toBeGreaterThan(0);
    expect(n.paragraphs.join(" ")).toMatch(/1:30:00|90:00|5400/); // target time rendered
    expect(n.severity).toBe("positive"); // score 72 + freshness 58
  });

  it("warns when freshness is low or readiness weak", () => {
    const n = buildPreRaceNarrative(preRaceBase({ fatigue: fatigue(30) }))!;
    expect(n.severity).toBe("warning");
  });
});

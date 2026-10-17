import { describe, expect, it } from "vitest";
import { recommendTodaySession, type TodaySessionInput } from "../todaySession";
import type { FatigueSnapshot } from "@/lib/analytics/fatigue";
import type { IntensityAdvice } from "@/lib/analytics/intensityAdvisor";
import type { RaceReadiness } from "@/lib/analytics/readiness";

function fatigue(freshness: number, tsb: number): FatigueSnapshot {
  return {
    ctl: 40,
    atl: 40,
    tsb,
    // The snapshot's mapping from raw TSB, so each case keeps its original meaning.
    formPct: 1.25 * tsb - 2.5,
    freshness,
    label: "test",
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
}

function intensity(status: IntensityAdvice["status"]): IntensityAdvice {
  return {
    status,
    easyTargetPct: 80,
    currentEasyPct: status === "too_hard" ? 55 : 80,
    hardRunsLast14d: status === "too_hard" ? 5 : 2,
    recommendations: [],
    suggestedWeekPlan: [],
  };
}

function base(overrides: Partial<TodaySessionInput> = {}): TodaySessionInput {
  return {
    fatigue: fatigue(60, 0),
    intensityAdvice: intensity("balanced"),
    raceReadiness: null,
    typicalRunKm: 10,
    longestRunKm: 20,
    daysSinceLastHard: 1,
    daysSinceLastLong: 2,
    runCount: 30,
    ...overrides,
  };
}

const race = (daysUntilRace: number) => ({ daysUntilRace }) as RaceReadiness;

describe("recommendTodaySession", () => {
  it("recommends rest on race day", () => {
    expect(recommendTodaySession(base({ raceReadiness: race(0) })).kind).toBe("rest");
  });

  it("recommends recovery when fatigue is high", () => {
    const r = recommendTodaySession(base({ fatigue: fatigue(20, -30) }));
    expect(r.kind).toBe("recovery");
    expect(r.intensity).toBe("easy");
  });

  it("recommends easy + strides in taper week", () => {
    const r = recommendTodaySession(base({ raceReadiness: race(7) }));
    expect(r.kind).toBe("easy");
    expect(r.typeLabel).toMatch(/strides/i);
  });

  it("keeps it easy when recent intensity is too high", () => {
    const r = recommendTodaySession(
      base({ fatigue: fatigue(60, 0), intensityAdvice: intensity("too_hard") }),
    );
    expect(r.kind).toBe("easy");
    expect(r.intensity).toBe("easy");
  });

  it("recommends a quality session when fresh and due", () => {
    const r = recommendTodaySession(base({ fatigue: fatigue(70, 5), daysSinceLastHard: 5 }));
    expect(r.kind).toBe("tempo");
    expect(r.intensity).toBe("hard");
    expect(r.distanceKmRange).not.toBeNull();
  });

  it("recommends a long run when overdue and not due for quality", () => {
    const r = recommendTodaySession(
      base({ fatigue: fatigue(55, 0), daysSinceLastHard: 1, daysSinceLastLong: 8 }),
    );
    expect(r.kind).toBe("long");
  });

  it("defaults to an easy run", () => {
    const r = recommendTodaySession(
      base({ fatigue: fatigue(55, 0), daysSinceLastHard: 1, daysSinceLastLong: 2 }),
    );
    expect(r.kind).toBe("easy");
    expect(r.intensity).toBe("easy");
  });

  it("reports low confidence with little data", () => {
    expect(recommendTodaySession(base({ runCount: 3 })).confidence).toBe("low");
  });

  it("omits a distance range when typical distance is unknown", () => {
    const r = recommendTodaySession(
      base({ typicalRunKm: 0, daysSinceLastHard: 1, daysSinceLastLong: 2 }),
    );
    expect(r.distanceKmRange).toBeNull();
  });
});

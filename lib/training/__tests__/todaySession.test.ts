import { describe, expect, it, vi } from "vitest";
import {
  buildTodaySessionInput,
  recommendTodaySession,
  type TodaySessionInput,
} from "../todaySession";
import type { FatigueSnapshot, ReadinessCurrency } from "@/lib/analytics/fatigue";
import { insightsFrom, mkRun } from "@/lib/coaching-context/__tests__/fixtures";
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

describe("recommendTodaySession — training currency", () => {
  function stale(currency: ReadinessCurrency, freshness: number, restDays: number) {
    return {
      ...fatigue(freshness, 5),
      readiness: { balance: "neutral" as const, currency, volumeRatio: null },
      restDaysSinceLastRun: restDays,
    };
  }

  // Freshness at each state's CURRENCY_CAP, the most permissive value it can reach,
  // with quality and the long run both overdue.
  const overdue = { daysSinceLastHard: 12, daysSinceLastLong: 12 };

  it.each([
    ["rusty", 65, 10],
    ["detrained", 50, 20],
    ["returning", 40, 35],
  ] as const)("%s → easy return run naming the gap", (currency, freshness, restDays) => {
    const r = recommendTodaySession(
      base({ fatigue: stale(currency, freshness, restDays), ...overdue }),
    );
    expect(r.kind).toBe("easy");
    expect(r.intensity).toBe("easy");
    expect(r.rationale.join(" ")).toMatch(new RegExp(`${restDays} days without a run`));
  });

  it("light-gap still unlocks quality", () => {
    const r = recommendTodaySession(base({ fatigue: stale("light-gap", 70, 5), ...overdue }));
    expect(r.kind).toBe("tempo");
  });

  it("light-gap still unlocks an overdue long run", () => {
    const r = recommendTodaySession(
      base({ fatigue: stale("light-gap", 55, 5), daysSinceLastHard: 1, daysSinceLastLong: 8 }),
    );
    expect(r.kind).toBe("long");
  });

  /** 40 every-other-day runs, the newest `gapDays` ago. */
  const history = (gapDays: number) =>
    Array.from({ length: 40 }, (_, k) => mkRun(gapDays + k * 2, { id: `r${k}` }));

  /** Run `check` with the clock on each of the next 7 days, so no weekday is skipped. */
  function onEveryWeekday(check: (weekday: string) => void) {
    const start = Date.now();
    // test/time-travel.ts may already have faked Date; reuse it rather than undo it.
    const alreadyFaked = vi.isFakeTimers();
    if (!alreadyFaked) vi.useFakeTimers({ toFake: ["Date"] });
    try {
      for (let day = 0; day < 7; day++) {
        vi.setSystemTime(start + day * 86_400_000);
        check(new Date().toDateString().slice(0, 3));
      }
    } finally {
      if (alreadyFaked) vi.setSystemTime(start);
      else vi.useRealTimers();
    }
  }

  it.each([
    [10, "rusty"],
    [20, "detrained"],
    [35, "returning"],
  ] as const)(
    "after a %i-day gap (%s) prescribes neither quality nor a long run, Today or next week",
    (gapDays, currency) => {
      onEveryWeekday((weekday) => {
        const { analytics } = insightsFrom(history(gapDays));
        expect(analytics.fatigue.readiness.currency, weekday).toBe(currency);
        const today = recommendTodaySession(buildTodaySessionInput(analytics));
        expect(today.kind, weekday).toBe("easy");
        expect(today.rationale.join(" "), weekday).toMatch(/without a run/);
        const planned = analytics.nextWeekPlan.sessions.map((s) => s.type);
        for (const t of ["tempo", "interval", "long"] as const) {
          expect(planned, weekday).not.toContain(t);
        }
      });
    },
  );

  it("leaves a current athlete on the normal rules", () => {
    onEveryWeekday((weekday) => {
      const { analytics } = insightsFrom(history(1));
      expect(analytics.fatigue.readiness.currency, weekday).toBe("current");
      const today = recommendTodaySession(buildTodaySessionInput(analytics));
      expect(today.rationale.join(" "), weekday).not.toMatch(/without a run/);
    });
  });
});

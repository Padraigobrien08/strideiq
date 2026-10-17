import { describe, expect, it } from "vitest";
import { buildRaceForecastInput } from "../buildInput";
import { buildUncertaintyAssessment } from "../uncertaintyModel";
import type { DashboardInsights } from "@/lib/analytics";
import type {
  DurabilityAssessment,
  FreshnessAssessment,
  SpecificityAssessment,
} from "../forecastTypes";

/**
 * Two defects found by backtesting the one race on file that can be scored —
 * a half the athlete ran in 1:44:17, held out and re-predicted from the data
 * available the day before. See scripts/backtest-race-forecast.mts.
 *
 *  1. With no race goal set, `buildRaceForecastInput` returned null, so the
 *     Performance page silently fell back to the legacy consensus projection.
 *     That model predicted 2:14:58 (+29.4%); this engine predicted 1:52:05
 *     (+7.5%) on the same data.
 *  2. The interval width came only from how much the capability models disagree
 *     with each other. They agreed, so the band was ±1% around a point estimate
 *     that was 7.5% out.
 */

const analytics = {
  trainingBlocks: [],
  raceReadiness: null,
  fatigue: {
    freshness: 80,
    tsb: 5,
    ctl: 50,
    atl: 45,
    formPct: 10,
    loadEvidence: {
      sufficient: true,
      confidence: "high",
      historyDays: 120,
      runCount: 40,
      reasons: [],
    },
    readiness: { balance: "neutral", currency: "current", volumeRatio: null },
    restDaysSinceLastRun: 1,
  },
  intensityAdvice: { hardRunsLast14d: 2, currentEasyPct: 70 },
  efficiencySummary: { trend: "stable" },
  racePredictionAnalysis: { efforts: [], consensus: [] },
} as unknown as DashboardInsights;

describe("the better model is available without a race goal", () => {
  it("forecasts the fallback distance when nothing is set", () => {
    const input = buildRaceForecastInput({
      analytics,
      goal: null,
      runs: [],
      fallbackDistance: "hm",
    });
    expect(input).not.toBeNull();
    expect(input!.goal.distanceKey).toBe("hm");
  });

  it("invents neither a race date nor a target when there is no goal", () => {
    const input = buildRaceForecastInput({
      analytics,
      goal: null,
      runs: [],
      fallbackDistance: "hm",
    })!;
    expect(input.goal.raceDate).toBeUndefined();
    expect(input.goal.targetTimeSec).toBeUndefined();
  });

  it("still returns null when there is no goal and no fallback", () => {
    expect(buildRaceForecastInput({ analytics, goal: null, runs: [] })).toBeNull();
  });

  it("prefers a real goal over the fallback", () => {
    const input = buildRaceForecastInput({
      analytics,
      goal: { distance: "10k", date: "2026-09-01", targetTimeSec: 2400 },
      runs: [],
      fallbackDistance: "hm",
    })!;
    expect(input.goal.distanceKey).toBe("10k");
    expect(input.goal.raceDate).toBe("2026-09-01");
  });
});

describe("the interval cannot claim precision the engine has not earned", () => {
  const perfect = (over: Partial<SpecificityAssessment> = {}) =>
    ({ score: 100, timeMultiplier: 1, ...over }) as SpecificityAssessment;

  const assess = (mostLikelyTimeSec: number, modelSpreadSec: number) =>
    buildUncertaintyAssessment(
      { goal: { distanceMeters: 21097, distanceKey: "hm" }, efforts: [] } as never,
      {
        modelSpreadSec,
        modelCount: 3,
        agreementScore: 95,
        durability: { timeMultiplier: 1 } as DurabilityAssessment,
        specificity: perfect(),
        freshness: { timeAdjustmentSec: 0 } as FreshnessAssessment,
        mostLikelyTimeSec,
      },
    );

  // The exact failure from the backtest: models in near-perfect agreement on a
  // ~1:52 half produced a band of 2m 24s, around an estimate 7.5% out.
  it("does not collapse to a hairline when the models happen to agree", () => {
    const u = assess(6725, 0);
    expect(u.intervalWidthSec).toBeGreaterThan(6725 * 0.07);
  });

  it("is never narrower when confidence is lower", () => {
    const high = assess(6725, 0);
    const low = buildUncertaintyAssessment(
      { goal: { distanceMeters: 21097, distanceKey: "hm" }, efforts: [] } as never,
      {
        modelSpreadSec: 0,
        modelCount: 1,
        agreementScore: 10,
        durability: { timeMultiplier: 1 } as DurabilityAssessment,
        specificity: { score: 10, timeMultiplier: 1 } as SpecificityAssessment,
        freshness: { timeAdjustmentSec: 0 } as FreshnessAssessment,
        mostLikelyTimeSec: 6725,
      },
    );
    // Never narrower: a less certain forecast may not look more precise.
    expect(low.intervalWidthSec).toBeGreaterThanOrEqual(high.intervalWidthSec);
    expect(low.score).toBeLessThan(high.score);
  });

  it("scales the floor with the prediction, not as a fixed number of seconds", () => {
    const half = assess(6725, 0).intervalWidthSec;
    const marathon = buildUncertaintyAssessment(
      { goal: { distanceMeters: 42195, distanceKey: "marathon" }, efforts: [] } as never,
      {
        modelSpreadSec: 0,
        modelCount: 3,
        agreementScore: 95,
        durability: { timeMultiplier: 1 } as DurabilityAssessment,
        specificity: perfect(),
        freshness: { timeAdjustmentSec: 0 } as FreshnessAssessment,
        mostLikelyTimeSec: 14400,
      },
    ).intervalWidthSec;
    expect(marathon).toBeGreaterThan(half);
  });

  it("leaves a genuinely wide band alone", () => {
    // Real disagreement already exceeds the floor, so nothing is added.
    const wide = assess(6725, 3600);
    expect(wide.intervalWidthSec).toBeGreaterThan(1200);
    expect(wide.drivers.some((d) => /unvalidated/i.test(d.label))).toBe(false);
  });

  // The decomposition is shown to the athlete, so a floor that appears from
  // nowhere would break it. An existing invariant test caught exactly that.
  it("attributes the floor instead of conjuring width", () => {
    const u = assess(6725, 0);
    const summed = u.baseWidthSec + u.drivers.reduce((s, d) => s + d.widthSec, 0);
    expect(Math.abs(summed - u.intervalWidthSec)).toBeLessThanOrEqual(u.drivers.length + 1);
    expect(u.drivers.some((d) => /unvalidated/i.test(d.label))).toBe(true);
  });
});

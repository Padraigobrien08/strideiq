import { describe, expect, it } from "vitest";
import { loadImpactFor, todayLoadImpact } from "../loadBalanceImpact";
import { buildTodaySessionInput } from "../todaySession";
import { insightsFrom, mkRun } from "@/lib/coaching-context/__tests__/fixtures";
import { trainingLoadBalancePayload } from "@/lib/intelligence/loadBalancePayload";
import { buildIntelligenceBrief } from "@/lib/intelligence/brief";
import { buildCoachingContext } from "@/lib/coaching-context";
import { serializeCoachingContextForLLM } from "@/lib/coaching-context/serializeForLLM";
import type { RunActivity } from "@/lib/strava/types";

/** Every-other-day block over ~11 weeks, optionally with the last week's load scaled. */
function block(lastWeekScale = 1, gapDays = 0): RunActivity[] {
  return Array.from({ length: 40 }, (_, i) => {
    const daysAgo = gapDays + (40 - i) * 2;
    const s = daysAgo <= 7 ? lastWeekScale : 1;
    return {
      ...mkRun(daysAgo, { distanceM: Math.round(10_000 * s), id: `b${i}` }),
      relativeEffort: Math.round(50 * s),
    };
  });
}

const shortHistory = () =>
  [12, 10, 8, 6, 4, 2].map((d) => ({ ...mkRun(d, { id: `s${d}` }), relativeEffort: 50 }));

describe("todayLoadImpact", () => {
  it("is silent for steady training: the balance did not change today", () => {
    const impact = todayLoadImpact(insightsFrom(block()).analytics);
    expect(impact).toMatchObject({ affects: false, direction: null, evidence: [] });
    expect(impact.actual).toBe(impact.withoutLoad);
  });

  it("reports holding back when a load spike turns today into recovery", () => {
    const { analytics } = insightsFrom(block(2.5));
    expect(analytics.fatigue.readiness.balance).toBe("fatigued");
    const impact = todayLoadImpact(analytics);
    expect(impact.affects).toBe(true);
    expect(impact.actual).toBe("recovery");
    expect(impact.withoutLoad).not.toBe("recovery");
    expect(impact.direction).toBe("held_back");
    expect(impact.evidence.join(" ")).toMatch(/% of chronic load/);
  });

  it("reports unlocking when the balance alone makes quality possible", () => {
    const { analytics } = insightsFrom(block());
    // No quality on record: only a trusted balance can make a tempo due.
    const input = {
      ...buildTodaySessionInput(analytics),
      daysSinceLastHard: null,
      daysSinceLastLong: 1,
      intensityAdvice: { ...analytics.intensityAdvice, status: "balanced" as const },
      fatigue: { ...analytics.fatigue, freshness: 70 },
    };
    const impact = loadImpactFor(input);
    expect(impact).toMatchObject({ affects: true, actual: "tempo", direction: "unlocked" });
  });

  it("never attributes anything to a balance without enough history", () => {
    const { analytics } = insightsFrom(shortHistory());
    expect(analytics.fatigue.loadEvidence.sufficient).toBe(false);
    expect(todayLoadImpact(analytics)).toMatchObject({ affects: false, direction: null });
  });
});

describe("trainingLoadBalancePayload", () => {
  it("withholds the number and says why without enough history", () => {
    const p = trainingLoadBalancePayload(insightsFrom(shortHistory()).analytics.fatigue);
    expect(p.status).toBe("not_enough_evidence");
    expect(p.formPct).toBeNull();
    expect(p.reading).toMatch(/not enough training history/i);
    expect(p.limitations.length).toBeGreaterThan(0);
  });

  it("gives the status, form and today's impact once the history is there", () => {
    const { analytics } = insightsFrom(block(2.5));
    const p = trainingLoadBalancePayload(analytics.fatigue, todayLoadImpact(analytics));
    expect(p.status).toBe("fatigued");
    expect(p.formPct).toBe(analytics.fatigue.formPct);
    expect(p.todayImpact).toMatchObject({ affects: true, direction: "held_back" });
    expect(p.reading).toMatch(/held today back to recovery/);
  });

  it("says plainly when the balance did not change today", () => {
    const { analytics } = insightsFrom(block());
    const p = trainingLoadBalancePayload(analytics.fatigue, todayLoadImpact(analytics));
    expect(p.status).toBe("balanced");
    expect(p.reading).toMatch(/did not change today's recommendation/);
  });
});

describe("Coach and the planning LLM see the same reading", () => {
  it("the brief withholds freshness and TSB without enough history", () => {
    const f = insightsFrom(shortHistory());
    const brief = buildIntelligenceBrief(f.analytics, [], f.quality, null);
    expect(brief.fatigue.freshness).toBeNull();
    expect(brief.fatigue.tsb).toBeNull();
    expect(brief.fatigue.trainingLoadBalance.status).toBe("not_enough_evidence");
  });

  it("the brief carries the balance and its impact when there is history", () => {
    const f = insightsFrom(block(2.5));
    const brief = buildIntelligenceBrief(f.analytics, [], f.quality, null);
    expect(brief.fatigue.freshness).toBe(f.analytics.fatigue.freshness);
    expect(brief.fatigue.trainingLoadBalance.todayImpact?.affects).toBe(true);
  });

  it("the planning context quotes the reading instead of a bare freshness number", () => {
    const f = insightsFrom(shortHistory());
    const ctx = buildCoachingContext({
      analytics: f.analytics,
      quality: f.quality,
      runs: f.runs,
      raceGoal: null,
      options: { windowDays: 21, includeForecast: false },
    });
    const text = serializeCoachingContextForLLM(ctx);
    expect(text).toMatch(/Training load balance: Not enough training history/);
    expect(text).not.toMatch(/Freshness: \d/);
  });
});

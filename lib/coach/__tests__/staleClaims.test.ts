import { describe, expect, it, vi } from "vitest";
import {
  buildActiveObservations,
  buildRisksAndOpportunities,
  deriveCurrentFocus,
} from "../activeIntelligence";
import { buildCoachContextSnapshot } from "../viewModel";
import { insightsFrom, mkRun } from "@/lib/coaching-context/__tests__/fixtures";
import type { RunActivity } from "@/lib/strava/types";
import type { RaceGoal } from "@/lib/analytics/readiness";
import { detectInterference } from "@/lib/ecosystem/interference";
import type { NormalizedActivity } from "@/lib/ecosystem/types";

/**
 * Insight generators each see one slice of the data, so they can assert things
 * the rest of the state contradicts. These were both live on the real account
 * after 10 days without a run:
 *
 *   "Efficiency has dipped: fatigue or heat may be compressing aerobic returns."
 *   "Threshold-style sessions are appearing regularly (5 in recent mix)."
 *
 * Neither can be true of training that stopped a week and a half ago.
 */

/** Declining efficiency across a block, then optionally a long gap. */
function history(gapDays: number): RunActivity[] {
  const runs: RunActivity[] = [];
  // Older runs faster at the same HR than newer ones, so efficiency declines.
  for (let i = 0; i < 14; i++) {
    const daysAgo = gapDays + (14 - i) * 3;
    runs.push(
      mkRun(daysAgo, {
        distanceM: 10000,
        movingSec: 2700 + i * 40,
        avgHr: 150,
      }),
    );
  }
  return runs;
}

const textOf = (items: { text: string }[]) => items.map((i) => i.text).join(" | ");

describe("claims are consistent with training currency", () => {
  it("does not blame fatigue for a dip once training has stopped", () => {
    const { analytics } = insightsFrom(history(12));
    expect(analytics.fatigue.readiness.currency).not.toBe("current");

    const obs = buildActiveObservations(analytics, []);
    const all = textOf(obs);
    if (/efficiency has dipped/i.test(all)) {
      expect(all).not.toMatch(/fatigue or heat may be compressing/i);
      expect(all).toMatch(/lost sharpness|without a run/i);
    }
  });

  it("does not claim sessions are still appearing after a gap", () => {
    const { analytics } = insightsFrom(history(12));
    const all = textOf(buildActiveObservations(analytics, []));
    expect(all).not.toMatch(/are appearing regularly/i);
  });

  it("keeps the present-tense wording while training is current", () => {
    const { analytics } = insightsFrom(history(0));
    expect(analytics.fatigue.readiness.currency).toBe("current");
    const all = textOf(buildActiveObservations(analytics, []));
    // No regression: the original phrasing survives for a current athlete.
    if (/threshold-style/i.test(all)) {
      expect(all).toMatch(/are appearing regularly/i);
    }
    if (/efficiency has dipped/i.test(all)) {
      expect(all).toMatch(/fatigue or heat may be compressing/i);
    }
  });

  it("carries the correction through to risks, which copy the observations", () => {
    const { analytics } = insightsFrom(history(12));
    const obs = buildActiveObservations(analytics, []);
    const all = textOf(buildRisksAndOpportunities(analytics, obs));
    expect(all).not.toMatch(/fatigue or heat may be compressing/i);
  });
});

/**
 * The second half of the same bug, found on the live account at 15 days without a run.
 * Home led with DETRAINED and "freshness 50 reflects rest"; Coach, from the same
 * analytics, showed "Race readiness stabilized at 67/100 (Nearly there)" and a focus of
 * "protect the block with polarized easy days". Two surfaces describing one athlete
 * incompatibly is worse for trust than either being wrong alone.
 */
describe("readiness claims respect training currency", () => {
  /**
   * A block substantial enough to leave race readiness above the 60 that the
   * observation requires, then a gap of `gapDays`. Sized from measurement: 24 runs
   * left readiness at 62, close enough to the threshold that ordinary drift in the
   * readiness model would silently push these tests below it and hollow them out.
   * 40 runs lands at 74.
   */
  function block(gapDays: number): RunActivity[] {
    const runs: RunActivity[] = [];
    for (let i = 0; i < 40; i++) {
      const daysAgo = gapDays + (40 - i) * 2;
      runs.push(
        mkRun(daysAgo, {
          distanceM: i % 4 === 0 ? 19200 : 12000,
          movingSec: i % 4 === 0 ? 3600 : 3240,
          avgHr: 150,
        }),
      );
    }
    return runs;
  }

  /**
   * A race goal is required, not decoration: `raceReadiness` is null without one, so
   * the observation under test never fires and the assertions below pass on an empty
   * string. Every test here asserts its own precondition for the same reason.
   */
  function withGoal(gapDays: number) {
    const raceDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
    const goal: RaceGoal = { distance: "hm", date: raceDate };
    return insightsFrom(block(gapDays), goal).analytics;
  }

  it("does not say readiness has stabilized after a fortnight without running", () => {
    const analytics = withGoal(15);
    expect(analytics.fatigue.readiness.currency).not.toBe("current");
    // Precondition: the branch that produced the bad copy is actually reachable.
    expect(analytics.raceReadiness).not.toBeNull();
    expect(analytics.raceReadiness!.score).toBeGreaterThanOrEqual(60);

    const all = textOf(buildActiveObservations(analytics, []));
    expect(all).toMatch(/race readiness/i);
    expect(all).not.toMatch(/readiness stabilized/i);
    expect(all).toMatch(/where you left off/i);
  });

  it("keeps the stabilized wording for an athlete who is actually training", () => {
    const analytics = withGoal(0);
    expect(analytics.fatigue.readiness.currency).toBe("current");
    expect(analytics.raceReadiness!.score).toBeGreaterThanOrEqual(60);
    const all = textOf(buildActiveObservations(analytics, []));
    expect(all).toMatch(/stabilized at \d+\/100/i);
  });

  /**
   * The green-light line is guarded upstream rather than here: `CURRENCY_CAP` clamps
   * freshness to 50 when detrained, so it cannot reach the 70 that triggers
   * "freshness supports quality work". That is the right place for it — but it means
   * the safety of this observation rests on a constant in another module, so pin it.
   * If that cap is ever raised, a detrained athlete starts being told to go hard.
   */
  it("cannot reach the freshness that green-lights quality work while detrained", () => {
    const analytics = withGoal(15);
    expect(analytics.fatigue.readiness.currency).toBe("detrained");
    expect(analytics.fatigue.freshness).toBeLessThan(70);

    const all = textOf(buildActiveObservations(analytics, []));
    expect(all).not.toMatch(/freshness supports quality work/i);
  });

  /**
   * Rested means a day more than the block's every-other-day rhythm: last run three
   * days ago, still `current`. With the last run two days ago this fixture sat on the
   * threshold, and freshness moves with the weekday because runs fall into Monday-start
   * load buckets differently — measured 69–74 across one week on identical training,
   * so the test failed every Saturday and passed every other day. One more rest day
   * reads 97–99 on every weekday.
   *
   * Every weekday is checked explicitly so a weekday artifact fails whatever day the
   * suite runs, rather than one day in seven.
   */
  it("still green-lights quality for a rested athlete who is training, on any weekday", () => {
    const start = Date.now();
    // test/time-travel.ts may already have faked Date; reuse it rather than undo it.
    const alreadyFaked = vi.isFakeTimers();
    if (!alreadyFaked) vi.useFakeTimers({ toFake: ["Date"] });
    try {
      for (let day = 0; day < 7; day++) {
        vi.setSystemTime(start + day * 86_400_000);
        const weekday = new Date().toDateString().slice(0, 3);
        const analytics = withGoal(1);
        expect(analytics.fatigue.readiness.currency, weekday).toBe("current");
        expect(analytics.fatigue.freshness, weekday).toBeGreaterThanOrEqual(70);
        const all = textOf(buildActiveObservations(analytics, []));
        expect(all, weekday).toMatch(/freshness supports quality work/i);
      }
    } finally {
      if (alreadyFaked) vi.setSystemTime(start);
      else vi.useRealTimers();
    }
  });

  it("leads with the gap so the numbers below are read in context", () => {
    const analytics = withGoal(15);
    const obs = buildActiveObservations(analytics, []);
    expect(obs[0]?.text).toMatch(/without a run/i);
    expect(obs[0]?.tone).toBe("warning");
  });

  it("does not tell an athlete who has stopped training to protect the block", () => {
    const analytics = withGoal(15);
    const obs = buildActiveObservations(analytics, []);
    const focus = deriveCurrentFocus(analytics, obs);
    expect(focus.rationale).not.toMatch(/protect the block/i);
    expect(focus.focus).toMatch(/back to running/i);
  });

  it("marks the answer-context snapshot as measured before the gap", () => {
    const stale = buildCoachContextSnapshot(withGoal(15), null);
    expect(stale.currencyNote).toMatch(/measured before .*without a run/i);

    const current = buildCoachContextSnapshot(withGoal(0), null);
    expect(current.currencyNote).toBeNull();
  });
});

describe("interference messages describe what happened", () => {
  // Both sides of an interference pair come from the history being scanned, so
  // a future tense there invents a scheduled session. That was most visible for
  // an athlete with no saved plan and no run in over a week.
  const activity = (over: Partial<NormalizedActivity>): NormalizedActivity =>
    ({
      id: "a",
      source: "strava",
      sportType: "Run",
      modality: "run",
      name: "Activity",
      startDate: "2026-07-01T06:00:00.000Z",
      movingTimeSec: 3600,
      elapsedTimeSec: 3600,
      hasStreams: false,
      hasLaps: false,
      perceivedIntensity: "high",
      intensity: { confidence: "medium", evidence: [] },
      confidence: "medium",
      ...over,
    }) as NormalizedActivity;

  it("describes a gym session before a key run in the past tense", () => {
    const flags = detectInterference([
      activity({
        id: "gym",
        sportType: "WeightTraining",
        modality: "strength",
        startDate: "2026-07-01T06:00:00.000Z",
      }),
      activity({
        id: "run",
        sportType: "Run",
        modality: "run",
        isHardRun: true,
        startDate: "2026-07-02T05:00:00.000Z",
      }),
    ]);
    const messages = flags.map((f) => f.message).join(" | ");
    expect(messages).not.toMatch(/upcoming/i);
    if (flags.length > 0) expect(messages).toMatch(/before a key run|may have been compromised/i);
  });
});

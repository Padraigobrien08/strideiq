import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  applyCurrency,
  buildFatigueSnapshot,
  classifyCurrency,
  freshnessFromForm,
  volumeCurrencyRatio,
} from "../fatigue";
import type { RunActivity } from "@/lib/strava/types";
import { format, subDays, subWeeks, startOfWeek } from "date-fns";

/**
 * Invariants P2 of docs/proposals/readiness-model.md.
 *
 * The shipped model told an athlete who had not run in 11 days that they were
 * "FRESH, freshness 100, quality session window", because rest only ever added
 * freshness and TSB had no upper turn.
 */

/**
 * Pinned clock. Every fixture below is built relative to "today", and the model
 * buckets load into ISO weeks, so which weekday the suite happens to run on shifts
 * the bucket boundaries and moves CTL/ATL. That made these assertions fail on some
 * calendar days and pass on others.
 */
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-05T09:00:00.000Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

function run(date: string, km: number, load: number): RunActivity {
  return {
    id: date + km,
    name: "Run",
    date,
    distanceM: km * 1000,
    movingSec: 3000,
    elapsedSec: 3000,
    avgHr: 150,
    maxHr: 170,
    avgSpeedMps: null,
    maxSpeedMps: null,
    elevationGainM: 0,
    calories: null,
    relativeEffort: null,
    trainingLoad: load,
    gradeAdjustedPaceSecPerKm: null,
    avgCadence: null,
    totalSteps: null,
    weatherTempC: null,
  } as RunActivity;
}
const daysAgo = (n: number, km = 10, load = 100) =>
  run(format(subDays(new Date(), n), "yyyy-MM-dd"), km, load);

describe("classifyCurrency", () => {
  it("maps days since the last run to a currency state", () => {
    expect(classifyCurrency(0, null)).toBe("current");
    expect(classifyCurrency(3, null)).toBe("current");
    expect(classifyCurrency(5, null)).toBe("light-gap");
    expect(classifyCurrency(11, null)).toBe("rusty");
    expect(classifyCurrency(20, null)).toBe("detrained");
    expect(classifyCurrency(40, null)).toBe("returning");
  });

  it("treats collapsed volume as stale even when a run is recent", () => {
    // Ran two days ago, but 28-day volume is a fifth of baseline.
    expect(classifyCurrency(2, 0.2)).toBe("rusty");
    expect(classifyCurrency(2, 0.9)).toBe("current");
  });
});

describe("applyCurrency caps and relabels", () => {
  // Invariants 3 and 4.
  it("caps freshness per bucket", () => {
    const peak = { freshness: 100, label: "Fresh" };
    expect(applyCurrency(peak, "current").freshness).toBe(100);
    expect(applyCurrency(peak, "light-gap").freshness).toBe(85);
    expect(applyCurrency(peak, "rusty").freshness).toBe(65);
    expect(applyCurrency(peak, "detrained").freshness).toBe(50);
    expect(applyCurrency(peak, "returning").freshness).toBe(40);
  });

  it("never reports Fresh once the data is stale", () => {
    const peak = { freshness: 100, label: "Fresh" };
    for (const c of ["rusty", "detrained", "returning"] as const) {
      expect(applyCurrency(peak, c).label).not.toBe("Fresh");
    }
    expect(applyCurrency(peak, "rusty").label).toBe("Rusty");
    expect(applyCurrency(peak, "detrained").label).toBe("Detrained");
    expect(applyCurrency(peak, "returning").label).toBe("Returning");
  });

  it("leaves a current athlete untouched", () => {
    const mid = { freshness: 62, label: "Neutral" };
    expect(applyCurrency(mid, "current")).toEqual(mid);
  });
});

describe("the guarantee, end to end", () => {
  // This is the exact live case: a block of training, then an 11-day gap.
  const blockThenGap = () => {
    const runs: RunActivity[] = [];
    for (let w = 8; w >= 2; w--) {
      const monday = subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), w);
      for (const off of [0, 2, 4]) {
        runs.push(run(format(subDays(monday, -off), "yyyy-MM-dd"), 12, 120));
      }
    }
    return runs; // nothing in the last ~11 days
  };

  it("does not claim Fresh after a gap, however positive the balance", () => {
    const snap = buildFatigueSnapshot(blockThenGap());
    expect(snap.restDaysSinceLastRun).toBeGreaterThanOrEqual(8);
    expect(snap.tsb).toBeGreaterThan(0); // balance still reads positive
    expect(snap.label).not.toBe("Fresh"); // invariant 3
    expect(snap.freshness).toBeLessThanOrEqual(65); // invariant 4
    expect(["rusty", "detrained", "returning"]).toContain(snap.readiness.currency);
  });

  it("still reports a consistently training athlete normally", () => {
    // Invariant 6: no regression for the ordinary case.
    const runs: RunActivity[] = [];
    for (let d = 60; d >= 0; d -= 2) runs.push(daysAgo(d, 12, 120));
    const snap = buildFatigueSnapshot(runs);
    expect(snap.readiness.currency).toBe("current");
    expect(snap.freshness).toBe(
      freshnessFromForm(snap.formPct, snap.restDaysSinceLastRun).freshness,
    );
  });

  it("scores a stale high balance below a current one with less balance", () => {
    // Invariant 5: freshness is no longer monotonic in TSB. The stale athlete has the
    // higher balance and must still score lower, because the balance is stale.
    //
    // The comparator used to be "a run every three days", which passed only because
    // acute load was computed from a partial calendar week and came out deflated. With
    // the week boundary fixed that athlete reads genuinely fatigued — they are mid-block
    // with a trailing week above their chronic load — so they no longer demonstrate
    // anything about staleness. Three days also aliases against a seven-day window,
    // giving them 200/300/200 weeks and an unstable reading.
    //
    // A consistent block that eased off over the last week is the honest comparator:
    // unambiguously current, and fresher than the athlete who simply stopped.
    const stale = buildFatigueSnapshot(blockThenGap());

    const current: RunActivity[] = [];
    for (let d = 60; d >= 7; d -= 2) current.push(daysAgo(d, 12, 120));
    for (let d = 5; d >= 1; d -= 2) current.push(daysAgo(d, 6, 45));
    const fresh = buildFatigueSnapshot(current);

    expect(fresh.readiness.currency).toBe("current");
    expect(stale.tsb).toBeGreaterThan(fresh.tsb);
    expect(stale.freshness).toBeLessThan(fresh.freshness);
  });
});

describe("volumeCurrencyRatio", () => {
  it("returns null without enough history to have a baseline", () => {
    expect(volumeCurrencyRatio([daysAgo(1)])).toBeNull();
  });

  it("detects a collapse against the athlete's own prior volume", () => {
    const runs: RunActivity[] = [];
    for (let d = 84; d > 28; d -= 3) runs.push(daysAgo(d, 15, 150)); // heavy priors
    runs.push(daysAgo(5, 3, 30)); // one token run recently
    const ratio = volumeCurrencyRatio(runs);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeLessThan(0.4);
  });
});

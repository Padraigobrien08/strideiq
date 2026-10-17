import { afterEach, describe, expect, it, vi } from "vitest";
import { acuteChronicLoad, buildFatigueSnapshot, weeklyLoadSeries } from "../fatigue";
import type { RunActivity } from "@/lib/strava/types";
import { eachDayOfInterval, format, subDays } from "date-fns";

/**
 * Acute load must not depend on which day of the week you look.
 *
 * Load is bucketed into calendar weeks and averaged as though every bucket were a
 * whole week. The current week is not: on a Monday it held a single day, so acute
 * load collapsed and the athlete read as fresh. Measured on the demo athlete, ATL
 * fell 66 → 40 and freshness rose 49 → 86 between Sunday and Monday on identical
 * training — then recovered through the week.
 *
 * It was not cosmetic. `fatigueState` decides whether the fallback planner prescribes
 * a recovery week, and freshness ≥ 70 trips the Coach's "freshness supports quality
 * work" line. Every Monday, an athlete who had trained hard was told to go hard.
 *
 * CI found it a day early: the time-travel job runs the suite a year ahead, which
 * landed on a Monday before the calendar did.
 */

function runOn(date: Date, load: number): RunActivity {
  return {
    id: format(date, "yyyy-MM-dd"),
    name: "Run",
    date: format(date, "yyyy-MM-dd'T'06:00:00'Z'"),
    distanceM: 10000,
    movingSec: 3000,
    elapsedSec: 3000,
    avgSpeedMps: null,
    maxSpeedMps: null,
    avgHr: 150,
    maxHr: 165,
    elevationGainM: 0,
    calories: null,
    relativeEffort: null,
    trainingLoad: load,
    gradeAdjustedPaceSecPerKm: null,
    avgCadence: null,
    totalSteps: null,
    weatherTempC: null,
  };
}

/**
 * An athlete who runs the same load every day from a *fixed* start date to `endingAt`.
 *
 * Anchored to a fixed Monday on purpose. A rolling "last N days" fixture varies how
 * complete its oldest calendar week is depending on the day you probe, which drags CTL
 * and shows up as a week-boundary effect that has nothing to do with the current week.
 * That confounded the first version of these tests.
 *
 * Long enough (~40 weeks) that CTL has converged. At ten weeks it is still warming up
 * against its six-week time constant, so it climbs every week — real behaviour, but it
 * drifts across the discontinuity in `freshnessFromForm` at form −15 %, where a small
 * change in balance moves freshness by eleven points. That is a separate wart; this
 * file is about the week boundary, so the fixture removes the warm-up rather than
 * asserting around it.
 */
const HISTORY_START = new Date("2026-11-02T06:00:00Z"); // a Monday, ~40 weeks back

function steadyAthlete(endingAt: Date, load = 50): RunActivity[] {
  return eachDayOfInterval({ start: HISTORY_START, end: endingAt }).map((d) => runOn(d, load));
}

function readingOn(day: string) {
  vi.setSystemTime(new Date(`${day}T09:00:00Z`));
  const runs = steadyAthlete(new Date(`${day}T09:00:00Z`));
  const load = acuteChronicLoad(weeklyLoadSeries(runs));
  const snapshot = buildFatigueSnapshot(runs);
  return { atl: load.atl, ctl: load.ctl, tsb: load.tsb, freshness: snapshot.freshness };
}

describe("acute load across the week boundary", () => {
  afterEach(() => vi.useRealTimers());

  it("reads the same on Monday as on the Sunday before it", () => {
    vi.useFakeTimers();
    // 2027-08-08 is a Sunday; 2027-08-09 the Monday after.
    const sunday = readingOn("2027-08-08");
    const monday = readingOn("2027-08-09");

    // Identical training either side of the boundary, so the reading should barely
    // move. Before the fix this was 49 → 86.
    expect(Math.abs(monday.freshness - sunday.freshness)).toBeLessThanOrEqual(5);
    expect(Math.abs(monday.atl - sunday.atl)).toBeLessThanOrEqual(sunday.atl * 0.15);
  });

  it("stays flat for a steady athlete across a whole week", () => {
    vi.useFakeTimers();
    const days = [
      "2027-08-05",
      "2027-08-06",
      "2027-08-07",
      "2027-08-08",
      "2027-08-09",
      "2027-08-10",
      "2027-08-11",
    ];
    const freshness = days.map((d) => readingOn(d).freshness);
    const spread = Math.max(...freshness) - Math.min(...freshness);
    // A weekday artifact shows up here as a spike on one day of seven.
    expect(spread, `freshness by day: ${freshness.join(", ")}`).toBeLessThanOrEqual(8);
  });

  it("never reports a hard-training athlete as fresh on a Monday", () => {
    vi.useFakeTimers();
    const monday = readingOn("2027-08-09");
    // 70 is the threshold that trips the Coach's green light for quality work.
    expect(monday.freshness).toBeLessThan(70);
  });

  it("still lets a genuine taper show up as fresh", () => {
    // The fix must not flatten everything: stopping for a fortnight has to register.
    vi.useFakeTimers();
    const now = new Date("2027-08-09T09:00:00Z");
    vi.setSystemTime(now);
    const tapered = steadyAthlete(subDays(now, 14));
    const load = acuteChronicLoad(weeklyLoadSeries(tapered));
    expect(load.tsb).toBeGreaterThan(0);
  });
});

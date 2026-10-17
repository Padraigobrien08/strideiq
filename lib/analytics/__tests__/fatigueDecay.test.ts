import { describe, expect, it } from "vitest";
import { acuteChronicLoad, weeklyLoadSeries } from "../fatigue";
import type { RunActivity } from "@/lib/strava/types";
import { format, subDays, subWeeks, startOfWeek } from "date-fns";

/**
 * Invariants P1 of docs/proposals/readiness-model.md.
 *
 * The shipped model omitted weeks with no runs from the load series, so the
 * exponential average never saw a zero-load week and a layoff decayed nothing.
 * On the live account that inflated CTL 2.5x (140 vs 57).
 */

function run(date: string, load: number): RunActivity {
  return {
    id: date + load,
    name: "Run",
    date,
    distanceM: 8000,
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

/** A run in the week starting `weeksAgo` weeks before this week. */
const weekAgo = (weeksAgo: number, load: number) =>
  run(format(subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weeksAgo), "yyyy-MM-dd"), load);

describe("load series covers weeks with no runs", () => {
  it("materialises the gap weeks between two blocks", () => {
    // Ran 10 and 9 weeks ago, then nothing until 1 week ago.
    const series = weeklyLoadSeries([weekAgo(10, 100), weekAgo(9, 100), weekAgo(1, 100)]);
    const zero = series.filter((w) => w.load === 0);
    expect(zero.length).toBeGreaterThanOrEqual(7);
    // Contiguous weekly cadence, no jumps.
    expect(series.length).toBe(11);
  });

  it("runs to today so an open-ended gap still decays", () => {
    const series = weeklyLoadSeries([weekAgo(6, 200)]);
    // The last window is the seven days ending today.
    expect(series.at(-1)?.weekStart).toBe(format(subDays(new Date(), 6), "yyyy-MM-dd"));
    expect(series.at(-1)?.load).toBe(0);
  });

  it("is unchanged for an athlete who trains every week", () => {
    const runs = [5, 4, 3, 2, 1, 0].map((w) => weekAgo(w, 120));
    const series = weeklyLoadSeries(runs);
    expect(series).toHaveLength(6);
    // One run per window, so every window carries the same (rescaled) load.
    expect(new Set(series.map((w) => w.load)).size).toBe(1);
    expect(series[0].load).toBeGreaterThan(0);
  });
});

describe("load decays across a gap", () => {
  // Invariant 1 and 2 of the proposal.
  it("CTL strictly decreases across a zero-load week", () => {
    const series = weeklyLoadSeries([weekAgo(8, 300), weekAgo(7, 300), weekAgo(6, 300)]);
    const { history } = acuteChronicLoad(series);
    const peak = history.find((h) => h.weekStart === series[2].weekStart)!;
    const later = history.at(-1)!;
    expect(later.ctl).toBeLessThan(peak.ctl);
  });

  it("ATL decreases across a zero-load week", () => {
    // Failed before: atlTau=1 gave alpha=1.0, so ATL was identically this
    // week's load and had no decay curve at all.
    const series = weeklyLoadSeries([weekAgo(5, 300)]);
    const { history } = acuteChronicLoad(series);
    const atls = history.map((h) => h.atl);
    const peakIdx = atls.indexOf(Math.max(...atls));
    expect(peakIdx).toBeLessThan(atls.length - 1);
    for (let i = peakIdx + 1; i < atls.length; i++) {
      expect(atls[i]).toBeLessThanOrEqual(atls[i - 1]);
    }
    expect(atls.at(-1)!).toBeLessThan(atls[peakIdx]);
  });

  it("ATL retains memory rather than tracking the week exactly", () => {
    const series = weeklyLoadSeries([weekAgo(3, 0), weekAgo(2, 400), weekAgo(1, 0)]);
    const { history } = acuteChronicLoad(series);
    const afterSpike = history.find((h) => h.weekStart === series.at(-2)!.weekStart)!;
    // With no memory this would be exactly 0 the week after the spike.
    expect(afterSpike.atl).toBeGreaterThan(0);
  });

  it("a long layoff pushes CTL toward zero instead of holding it up", () => {
    const series = weeklyLoadSeries([weekAgo(30, 400), weekAgo(29, 400), weekAgo(28, 400)]);
    const { ctl, atl } = acuteChronicLoad(series);
    expect(ctl).toBeLessThan(40);
    expect(atl).toBeLessThan(5);
  });
});

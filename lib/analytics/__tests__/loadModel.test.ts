import { describe, expect, it, vi } from "vitest";
import { COVERAGE_MIN, distanceLoad, resolveLoadModel } from "../loadModel";
import {
  acuteChronicLoad,
  buildFatigueSnapshot,
  formPercent,
  freshnessFromForm,
  weeklyLoadSeries,
} from "../fatigue";
import { mkRun } from "@/lib/coaching-context/__tests__/fixtures";
import type { RunActivity } from "@/lib/strava/types";

const withLoad = (
  run: RunActivity,
  fields: { relativeEffort?: number | null; trainingLoad?: number | null },
): RunActivity => ({
  ...run,
  relativeEffort: fields.relativeEffort ?? null,
  trainingLoad: fields.trainingLoad ?? null,
});

/** Ten runs, every other day; `pick(i)` sets each run's load fields. */
function runs(
  pick: (i: number) => { relativeEffort?: number | null; trainingLoad?: number | null },
) {
  return Array.from({ length: 10 }, (_, i) =>
    withLoad(mkRun(i * 2 + 1, { distanceM: 10_000, id: `r${i}` }), pick(i)),
  );
}

describe("resolveLoadModel", () => {
  it("prefers Relative Effort, which both import paths carry", () => {
    const model = resolveLoadModel(runs(() => ({ relativeEffort: 50, trainingLoad: 70 })));
    expect(model.source).toBe("relative_effort");
    expect(model.coverage).toBe(1);
  });

  it("falls back to Training Load, then distance, by coverage", () => {
    expect(resolveLoadModel(runs(() => ({ trainingLoad: 70 }))).source).toBe("training_load");
    expect(resolveLoadModel(runs(() => ({}))).source).toBe("distance");
  });

  it("never mixes sources: partial coverage below the threshold means distance", () => {
    // 6 of 10 runs carry Training Load, like a real CSV export (37 of 57).
    const model = resolveLoadModel(runs((i) => ({ trainingLoad: i < 6 ? 70 : null })));
    expect(6 / 10).toBeLessThan(COVERAGE_MIN);
    expect(model.source).toBe("distance");
  });

  it("rescales the source onto the distance-proxy scale", () => {
    const set = runs(() => ({ relativeEffort: 50 }));
    const model = resolveLoadModel(set);
    // Median of distance × 10 ÷ effort = 100 / 50.
    expect(model.scale).toBe(2);
    expect(model.loadOf(set[0])).toBe(distanceLoad(set[0]));
  });

  it("keeps intensity: a harder run of the same distance costs more", () => {
    const set = runs((i) => ({ relativeEffort: i === 0 ? 120 : 50 }));
    const model = resolveLoadModel(set);
    expect(model.loadOf(set[0])).toBeGreaterThan(model.loadOf(set[1]));
  });

  it("charges a run missing the source at distance, in the same unit", () => {
    const set = runs((i) => ({ relativeEffort: i === 0 ? null : 50 }));
    const model = resolveLoadModel(set);
    expect(model.source).toBe("relative_effort");
    expect(model.loadOf(set[0])).toBe(distanceLoad(set[0]));
  });

  it("is distance with no runs at all", () => {
    expect(resolveLoadModel([]).source).toBe("distance");
  });
});

/** Every-other-day block with a long run every fourth run — not a 7-day rhythm. */
function block(): RunActivity[] {
  return Array.from({ length: 40 }, (_, i) =>
    withLoad(mkRun((40 - i) * 2, { distanceM: i % 4 === 3 ? 18_000 : 10_000, id: `b${i}` }), {
      relativeEffort: i % 4 === 3 ? 110 : i % 4 === 2 ? 105 : 45,
    }),
  );
}

describe("load balance is the same whatever the weekday", () => {
  it("reads identical training identically on all seven days", () => {
    // test/time-travel.ts may already have faked Date; reuse it rather than undo it.
    const alreadyFaked = vi.isFakeTimers();
    const start = Date.now();
    if (!alreadyFaked) vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const readings = new Set<string>();
      for (let day = 0; day < 7; day++) {
        vi.setSystemTime(start + day * 86_400_000);
        const f = buildFatigueSnapshot(block());
        readings.add(`${f.ctl}/${f.atl}/${f.tsb}/${f.freshness}`);
      }
      // Was 50–72 freshness across one week on calendar-week buckets.
      expect([...readings]).toHaveLength(1);
    } finally {
      if (alreadyFaked) vi.setSystemTime(start);
      else vi.useRealTimers();
    }
  });
});

describe("averages are seeded from the first weeks", () => {
  it("reads steady training as balanced from the first week", () => {
    // Four runs in one week: from zero this was TSB ≈ -95 and "Fatigued".
    const series = weeklyLoadSeries([1, 3, 5].map((d) => mkRun(d, { id: `n${d}` })));
    expect(Math.abs(acuteChronicLoad(series).tsb)).toBeLessThanOrEqual(1);
  });

  it("still registers a real spike on top of an established block", () => {
    const established = block();
    const spike = [1, 2, 3, 4, 5].map((d) =>
      withLoad(mkRun(d, { distanceM: 20_000, id: `s${d}` }), { relativeEffort: 150 }),
    );
    const before = acuteChronicLoad(weeklyLoadSeries(established));
    const after = acuteChronicLoad(weeklyLoadSeries([...established, ...spike]));
    expect(after.tsb).toBeLessThan(before.tsb - 20);
  });
});

describe("form: balance as a share of chronic load", () => {
  it("is TSB as a percentage of CTL, clamped to ±100", () => {
    expect(formPercent(400, 440)).toBe(-10);
    expect(formPercent(400, 360)).toBe(10);
    expect(formPercent(100, 400)).toBe(-100);
    expect(formPercent(0, 50)).toBe(0);
  });

  it("reads the same state the same way at any volume", () => {
    // ATL 8% above CTL: the demo athlete's reading, at its old and new unit scale.
    expect(freshnessFromForm(formPercent(61, 66), 1).label).toBe("Neutral");
    expect(freshnessFromForm(formPercent(363, 394), 1).label).toBe("Neutral");
  });

  it("puts the band edges at +10 % and −15 %", () => {
    expect(freshnessFromForm(10.5, 1).label).toBe("Fresh");
    expect(freshnessFromForm(9.5, 1).label).toBe("Neutral");
    expect(freshnessFromForm(-14.5, 1).label).toBe("Neutral");
    expect(freshnessFromForm(-15.5, 1).label).toBe("Fatigued");
  });
});

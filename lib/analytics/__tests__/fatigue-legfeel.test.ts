import { describe, it, expect } from "vitest";
import { buildFatigueSnapshot, freshnessFromForm } from "@/lib/analytics/fatigue";

describe("freshnessFromForm — leg-feel subjective nudge", () => {
  it("is a no-op when legFeel is absent (byte-identical to the base path)", () => {
    for (const tsb of [-30, -10, 0, 8, 25]) {
      expect(freshnessFromForm(tsb, 0, undefined)).toEqual(freshnessFromForm(tsb, 0));
    }
  });

  it("normal is a no-op", () => {
    expect(freshnessFromForm(0, 0, "normal")).toEqual(freshnessFromForm(0, 0));
  });

  it("heavy lowers freshness, capped at 12 points", () => {
    const base = freshnessFromForm(5, 0);
    const heavy = freshnessFromForm(5, 0, "heavy");
    expect(heavy.freshness).toBeLessThan(base.freshness);
    expect(base.freshness - heavy.freshness).toBeLessThanOrEqual(12);
  });

  it("fresh raises freshness but only a little (asymmetric, safety-first)", () => {
    const base = freshnessFromForm(0, 0);
    const fresh = freshnessFromForm(0, 0, "fresh");
    expect(fresh.freshness).toBeGreaterThanOrEqual(base.freshness);
    expect(fresh.freshness - base.freshness).toBeLessThanOrEqual(5);
  });

  it("heavy can downgrade a Fresh label", () => {
    expect(freshnessFromForm(30, 0).label).toBe("Fresh"); // form > +10 %
    expect(freshnessFromForm(30, 0, "heavy").label).not.toBe("Fresh");
  });

  it("fresh never upgrades the label (can't unlock a hard day it wasn't given)", () => {
    const base = freshnessFromForm(0, 0); // Neutral
    expect(freshnessFromForm(0, 0, "fresh").label).toBe(base.label);
  });

  it("clamps to [0, 100]", () => {
    expect(freshnessFromForm(-40, 0, "heavy").freshness).toBeGreaterThanOrEqual(0);
    expect(freshnessFromForm(40, 3, "fresh").freshness).toBeLessThanOrEqual(100);
  });
});

describe("buildFatigueSnapshot — carries reportedLegFeel to consumers", () => {
  it("stamps the reported feel onto the snapshot (for Coach context + learning loop)", () => {
    expect(buildFatigueSnapshot([], "heavy").reportedLegFeel).toBe("heavy");
  });

  it("is undefined when nothing was reported", () => {
    expect(buildFatigueSnapshot([]).reportedLegFeel).toBeUndefined();
  });
});

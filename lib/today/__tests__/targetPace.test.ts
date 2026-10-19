import { describe, expect, it } from "vitest";
import { PACE_BANDS, estimateDurationMin, paceZoneFor, targetPaceFor } from "../targetPace";

const physiology = (lt: number | null, cs: number | null = null) =>
  ({
    thresholdEconomy: { ltPaceSecPerKm: lt },
    criticalSpeed: { csPaceSecPerKm: cs },
  }) as Parameters<typeof targetPaceFor>[1];

describe("paceZoneFor", () => {
  it("reads a specific session type first", () => {
    expect(paceZoneFor({ type: "interval", intensity: "hard" })).toBe("interval");
    expect(paceZoneFor({ type: "Tempo run", intensity: "hard" })).toBe("tempo");
    expect(paceZoneFor({ type: "long", intensity: "moderate" })).toBe("steady");
    expect(paceZoneFor({ type: "recovery", intensity: "easy" })).toBe("recovery");
    expect(paceZoneFor({ type: "easy", intensity: "easy" })).toBe("easy");
  });

  it("falls back to intensity, and is null for rest", () => {
    expect(paceZoneFor({ type: "run", intensity: "hard" })).toBe("tempo");
    expect(paceZoneFor({ type: "run", intensity: "moderate" })).toBe("steady");
    expect(paceZoneFor({ type: "rest", intensity: "rest" })).toBeNull();
  });
});

describe("targetPaceFor", () => {
  it("scales threshold pace by the zone's band, rounded to 5 s", () => {
    // LT 4:40/km (280 s): easy 1.20–1.30 → 336–364 → 335–365.
    const p = targetPaceFor("easy", physiology(280))!;
    expect([p.fastSecPerKm, p.slowSecPerKm]).toEqual([335, 365]);
    expect(p.basis).toEqual({ kind: "threshold", paceSecPerKm: 280 });
  });

  it("orders the zones from fastest to slowest", () => {
    const zones = ["interval", "tempo", "steady", "easy", "recovery"] as const;
    const mids = zones.map((z) => {
      const p = targetPaceFor(z, physiology(300))!;
      return (p.fastSecPerKm + p.slowSecPerKm) / 2;
    });
    expect([...mids].sort((a, b) => a - b)).toEqual(mids);
    for (const z of zones) expect(PACE_BANDS[z][0]).toBeLessThan(PACE_BANDS[z][1]);
  });

  it("falls back to critical speed, labelled as such", () => {
    const p = targetPaceFor("tempo", physiology(null, 270))!;
    expect(p.basis.kind).toBe("critical_speed");
    expect(p.fastSecPerKm).toBeGreaterThan(0);
  });

  it("returns nothing rather than a guess without a basis", () => {
    expect(targetPaceFor("easy", physiology(null, null))).toBeNull();
    expect(targetPaceFor(null, physiology(280))).toBeNull();
  });
});

describe("estimateDurationMin", () => {
  it("multiplies the distance range by the pace range, in 5-minute steps", () => {
    const pace = targetPaceFor("easy", physiology(280))!; // 335–365 s/km
    // 8 km: 8×335/60 = 44.7 → 45; 8×365/60 = 48.7 → 50.
    expect(estimateDurationMin([8, 8], pace)).toEqual([45, 50]);
  });
});

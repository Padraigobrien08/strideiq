import { describe, expect, it } from "vitest";
import { detectRiskPatterns, type RiskPatternInput } from "../riskPatterns";
import type { FatigueSnapshot } from "../fatigue";
import type { IntensityAdvice } from "../intensityAdvisor";

function fatigue(overrides: Partial<FatigueSnapshot> = {}): FatigueSnapshot {
  return {
    ctl: 50,
    atl: 50,
    tsb: 0,
    formPct: -2.5,
    freshness: 60,
    label: "neutral",
    readiness: { balance: "neutral", currency: "current", volumeRatio: null },
    restDaysSinceLastRun: 1,
    evidence: [],
    usesProxyLoad: false,
    loadSource: "training_load",
    ...overrides,
  };
}

function intensity(status: IntensityAdvice["status"], hard = 2): IntensityAdvice {
  return {
    status,
    easyTargetPct: 80,
    currentEasyPct: status === "too_hard" ? 45 : 80,
    hardRunsLast14d: hard,
    recommendations: [],
    suggestedWeekPlan: [],
  };
}

function loadWeeks(pairs: [number, number][]): RiskPatternInput["loadHistory"] {
  return pairs.map(([ctl, atl], i) => ({
    weekStart: `2026-06-${String(i + 1).padStart(2, "0")}`,
    label: `wk${i}`,
    ctl,
    atl,
  }));
}

function vol(kms: number[]): RiskPatternInput["weeklyVolume"] {
  return kms.map((distanceKm, i) => ({
    weekStart: `2026-06-${String(i + 1).padStart(2, "0")}`,
    label: `wk${i}`,
    distanceKm,
    runCount: distanceKm > 0 ? 4 : 0,
  }));
}

function base(overrides: Partial<RiskPatternInput> = {}): RiskPatternInput {
  return {
    weeklyVolume: vol([40, 41, 40, 42]),
    loadHistory: loadWeeks([
      [50, 48],
      [50, 49],
      [50, 50],
      [50, 50],
    ]),
    intensityAdvice: intensity("balanced"),
    fatigue: fatigue(),
    recentLongRunsKm: [16, 17, 18],
    ...overrides,
  };
}

describe("detectRiskPatterns", () => {
  it("returns nothing for balanced, steady training", () => {
    expect(detectRiskPatterns(base())).toEqual([]);
  });

  it("flags an acute-load spike (high ACWR)", () => {
    const r = detectRiskPatterns(
      base({
        loadHistory: loadWeeks([
          [50, 55],
          [50, 60],
          [50, 80],
        ]),
      }),
    );
    const acwr = r.find((p) => p.id === "acwr_spike");
    expect(acwr).toBeDefined();
    expect(acwr!.severity).toBe("high"); // 80/50 = 1.6
  });

  it("flags a rapid volume ramp beyond +15%", () => {
    const r = detectRiskPatterns(base({ weeklyVolume: vol([40, 40, 40, 60]) }));
    const ramp = r.find((p) => p.id === "volume_ramp");
    expect(ramp).toBeDefined();
    expect(ramp!.severity).toBe("high"); // +50%
  });

  it("flags an overreaching streak of negative balance weeks", () => {
    const r = detectRiskPatterns(
      base({
        loadHistory: loadWeeks([
          [50, 50],
          [50, 65],
          [50, 66],
          [50, 68],
        ]),
        fatigue: fatigue({ tsb: -18, formPct: -25, freshness: 35 }),
      }),
    );
    const streak = r.find((p) => p.id === "tsb_streak");
    expect(streak).toBeDefined();
    expect(streak!.severity).toBe("high"); // 3 consecutive weeks
  });

  it("flags excessive hard-run density", () => {
    const r = detectRiskPatterns(base({ intensityAdvice: intensity("too_hard", 5) }));
    const hard = r.find((p) => p.id === "hard_density");
    expect(hard).toBeDefined();
    expect(hard!.severity).toBe("high");
  });

  it("flags a long run that jumped too fast", () => {
    const r = detectRiskPatterns(base({ recentLongRunsKm: [14, 15, 24] }));
    const jump = r.find((p) => p.id === "long_run_jump");
    expect(jump).toBeDefined();
    expect(jump!.severity).toBe("high"); // +60%
  });

  it("sorts by severity then score", () => {
    const r = detectRiskPatterns(
      base({
        weeklyVolume: vol([40, 40, 40, 48]), // +20% → medium ramp
        intensityAdvice: intensity("too_hard", 5), // high
      }),
    );
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r[0].severity).toBe("high");
  });

  it("caps confidence to low when load is a distance proxy", () => {
    const r = detectRiskPatterns(
      base({
        loadHistory: loadWeeks([
          [50, 60],
          [50, 80],
        ]),
        fatigue: fatigue({ usesProxyLoad: true, loadSource: "distance" }),
      }),
    );
    const acwr = r.find((p) => p.id === "acwr_spike");
    expect(acwr!.confidence).toBe("low");
  });
});

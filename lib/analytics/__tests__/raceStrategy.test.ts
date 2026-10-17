import { describe, expect, it } from "vitest";
import { buildSplitPlan, fadeRiskScore, simulateRaceStrategy } from "../raceStrategy";
import type { RaceGoal } from "../readiness";
import type { RacePredictionAnalysis } from "../predictions";
import type { FatigueSnapshot } from "../fatigue";

const minimalPrediction: RacePredictionAnalysis = {
  efforts: [
    {
      distanceKm: 18,
      timeSec: 5400,
      runId: "1",
      runName: "Long",
      date: "2025-01-01",
      source: "Full run",
    },
  ],
  models: [],
  consensus: [
    {
      label: "Half Marathon",
      distanceKm: 21.0975,
      timeSec: 6600,
      timeMin: 6500,
      timeMax: 6700,
      spreadSec: 200,
    },
  ],
  primaryAnchor: null,
  regression: {
    exponent: 1.09,
    coefficient: 1,
    rSquared: 0.9,
    residualLogSd: 0.04,
    exponentStdError: 0.02,
    pointCount: 5,
    curve: [],
  },
  explanation: [],
  confidence: "medium",
};

const fatigue: FatigueSnapshot = {
  ctl: 80,
  atl: 85,
  tsb: -5,
  formPct: -8.75,
  freshness: 50,
  label: "Neutral",
  readiness: { balance: "neutral", currency: "current", volumeRatio: null },
  restDaysSinceLastRun: 1,
  evidence: [],
  usesProxyLoad: false,
  loadSource: "training_load",
  loadEvidence: {
    sufficient: true,
    confidence: "high",
    historyDays: 120,
    runCount: 40,
    reasons: [],
  },
};

describe("buildSplitPlan", () => {
  it("HM 1h50 splits sum to target within 30s", () => {
    const target = 110 * 60;
    const splits = buildSplitPlan(21.0975, target, "even");
    const last = splits[splits.length - 1];
    expect(Math.abs(last.cumulativeSec - target)).toBeLessThanOrEqual(30);
    for (let i = 1; i < splits.length; i++) {
      expect(splits[i].cumulativeSec).toBeGreaterThanOrEqual(splits[i - 1].cumulativeSec);
    }
  });
});

describe("fadeRiskScore", () => {
  it("flags high risk with short long run and negative tsb", () => {
    const { level } = fadeRiskScore(1.1, -17.5, 14, 21.0975);
    expect(level).toBe("high");
  });
});

describe("simulateRaceStrategy", () => {
  it("returns strategy for HM goal", () => {
    const goal: RaceGoal = {
      distance: "hm",
      date: "2025-06-01",
      targetTimeSec: 6600,
    };
    const result = simulateRaceStrategy(goal, minimalPrediction, fatigue, null, "even");
    expect(result).not.toBeNull();
    expect(result!.splits.length).toBeGreaterThan(3);
    expect(result!.fadeRisk).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import { buildForecastV2View } from "../forecastV2ViewModel";
import { buildGoalsRaceBrief } from "../goalsRaceBrief";
import { nearRaceEvidenceRunnerInput } from "@/lib/forecasting-v2/evaluation/fixtures";
import type { RaceGoal } from "@/lib/analytics/readiness";
import type { DashboardInsights } from "@/lib/analytics";

const hmGoal: RaceGoal = {
  distance: "hm",
  date: "2026-06-01",
  targetTimeSec: 6540,
};

function minimalAnalytics(): DashboardInsights {
  const efforts = nearRaceEvidenceRunnerInput.efforts.map((e) => ({
    distanceKm: e.distanceKm,
    timeSec: e.timeSec,
    runId: e.runId,
    runName: e.runName,
    date: e.date,
    source: e.source,
  }));

  return {
    racePredictionAnalysis: {
      efforts,
      models: [],
      consensus: [],
      confidence: "medium",
      regression: null,
    },
    trainingBlocks: nearRaceEvidenceRunnerInput.recentBlocks,
    fatigue: {
      freshness: 68,
      tsb: 4,
      ctl: 50,
      atl: 45,
      formPct: 10,
      loadEvidence: {
        sufficient: true,
        confidence: "high",
        historyDays: 120,
        runCount: 40,
        reasons: [],
      },
      rampRate: 0,
      label: "neutral",
      restDaysSinceLastRun: 1,
      readiness: { balance: "neutral", currency: "current", volumeRatio: null },
    },
    intensityAdvice: {
      hardRunsLast14d: 2,
      currentEasyPct: 60,
      status: "ok",
      recommendation: "",
    },
    efficiencySummary: { trend: "stable", deltaPct: 0, label: "Stable" },
    halfMarathonReadiness: {
      score: 80,
      label: "Good",
      longestRunKm: 20.5,
      longestRunPct: 97,
      fourWeekVolumeKm: 145,
      volumePct: 90,
    },
    raceReadiness: null,
    weeklyVolume: [],
    dataConfidence: "medium",
    predictionTimeline: [],
    bestBlock: null,
    personalRecords: [],
    trainingEcosystem: { archetype: { label: "Runner" } },
  } as unknown as DashboardInsights;
}

describe("buildGoalsRaceBrief", () => {
  it("builds non-empty belief with key efforts for near-race profile", () => {
    const forecast = buildForecastV2View({
      analytics: minimalAnalytics(),
      goal: hmGoal,
    });

    expect(forecast).not.toBeNull();
    expect(forecast!.keyEfforts.length).toBeGreaterThan(0);

    const brief = buildGoalsRaceBrief({
      forecast: forecast!,
      goal: hmGoal,
      readiness: null,
    });

    expect(brief.belief.length).toBeGreaterThan(40);
    expect(brief.belief).toMatch(/20\.5|10-mile|10 mile/i);
    expect(brief.evidenceBullets.length).toBeGreaterThan(0);
    expect(brief.coachPrompts.length).toBeGreaterThanOrEqual(3);
    expect(brief.coachPrompts.every((p) => p.href.includes("investigate=1"))).toBe(true);
    expect(brief.primaryAction).not.toMatch(/^Recommendation:/i);
  });

  it("mentions target gap when goal is ambitious", () => {
    const forecast = buildForecastV2View({
      analytics: minimalAnalytics(),
      goal: hmGoal,
    });

    const brief = buildGoalsRaceBrief({
      forecast: forecast!,
      goal: hmGoal,
      readiness: null,
    });

    expect(brief.belief).toMatch(/1:49|goal/i);
  });
});

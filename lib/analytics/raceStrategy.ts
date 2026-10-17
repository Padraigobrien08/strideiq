import type { RaceGoal } from "./readiness";
import { RACE_READINESS_CONFIG } from "./readiness";
import type { RaceReadiness } from "./readiness";
import type { RacePredictionAnalysis } from "./predictions";
import type { FatigueSnapshot } from "./fatigue";

export type StrategyMode = "even" | "negative" | "conservative" | "aggressive";

export interface SplitPoint {
  km: number;
  cumulativeSec: number;
  paceSecPerKm: number;
  segmentKm: number;
  segmentSec: number;
}

export interface RaceStrategy {
  targetTimeSec: number;
  targetTimeSource: string;
  distanceKm: number;
  distanceLabel: string;
  strategy: StrategyMode;
  splits: SplitPoint[];
  fadeRisk: "low" | "medium" | "high";
  fadeFactors: string[];
  narrative: string[];
  warnings: string[];
  uncertaintyNote: string;
}

function splitMarkers(distanceKm: number): number[] {
  const steps = [5, 10, 15, 20, 25, 30, 35, 40];
  const markers: number[] = [];
  for (const km of steps) {
    if (km < distanceKm - 0.01) markers.push(km);
  }
  const rounded = Math.round(distanceKm * 1000) / 1000;
  if (markers.length === 0 || markers[markers.length - 1] < rounded - 0.01) {
    markers.push(rounded);
  }
  return markers;
}

function segmentMultipliers(
  mode: StrategyMode,
  distanceKm: number,
  midKm: number,
  kmEnd: number,
  applyDrift: boolean,
): number {
  const isSecondHalf = kmEnd > midKm;
  if (mode === "even") {
    if (applyDrift && isSecondHalf) return 1.02;
    return 1;
  }
  if (mode === "negative") {
    return isSecondHalf ? 0.97 : 1.03;
  }
  if (mode === "conservative") {
    return isSecondHalf ? 0.99 : 1.03;
  }
  // aggressive — faster early, payback second half
  return isSecondHalf ? 1.05 : 0.94;
}

export function buildSplitPlan(
  distanceKm: number,
  targetTimeSec: number,
  mode: StrategyMode,
): SplitPoint[] {
  const markers = splitMarkers(distanceKm);
  const basePace = targetTimeSec / distanceKm;
  const midKm = distanceKm / 2;
  const applyDrift = distanceKm >= 15;

  let prevKm = 0;
  const rawSegments: { kmEnd: number; segKm: number; weight: number }[] = [];

  for (const kmEnd of markers) {
    const segKm = kmEnd - prevKm;
    const mid = prevKm + segKm / 2;
    const mult = segmentMultipliers(mode, distanceKm, midKm, mid, applyDrift);
    rawSegments.push({ kmEnd, segKm, weight: basePace * mult * segKm });
    prevKm = kmEnd;
  }

  const rawTotal = rawSegments.reduce((s, r) => s + r.weight, 0);
  const scale = rawTotal > 0 ? targetTimeSec / rawTotal : 1;

  const splits: SplitPoint[] = [];
  let cumulative = 0;
  prevKm = 0;

  for (const seg of rawSegments) {
    const segmentSec = seg.weight * scale;
    cumulative += segmentSec;
    const segKm = seg.segKm;
    splits.push({
      km: seg.kmEnd,
      cumulativeSec: Math.round(cumulative),
      paceSecPerKm: segKm > 0 ? segmentSec / segKm : basePace,
      segmentKm: Math.round(segKm * 100) / 100,
      segmentSec: Math.round(segmentSec),
    });
    prevKm = seg.kmEnd;
  }

  // Ensure final cumulative matches target
  if (splits.length > 0) {
    const last = splits[splits.length - 1];
    const drift = targetTimeSec - last.cumulativeSec;
    if (Math.abs(drift) > 0) {
      last.cumulativeSec = Math.round(targetTimeSec);
      last.segmentSec += drift;
      if (last.segmentKm > 0) {
        last.paceSecPerKm = last.segmentSec / last.segmentKm;
      }
    }
  }

  return splits;
}

export function fadeRiskScore(
  exponent: number | null,
  /** Form: TSB as a percentage of CTL (`FatigueSnapshot.formPct`). */
  formPct: number,
  longestRunKm: number,
  raceDistanceKm: number,
): { level: "low" | "medium" | "high"; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  const longestRatio = longestRunKm / raceDistanceKm;
  if (longestRatio < 0.8) {
    score += 35;
    factors.push(
      `Longest run ${longestRunKm.toFixed(1)} km is ${Math.round(longestRatio * 100)}% of race distance. Pacing conservatively is safer.`,
    );
  }

  if (exponent !== null && exponent > 1.08) {
    score += 30;
    factors.push(
      `Your performance curve exponent (${exponent.toFixed(2)}) suggests pace fades as distance grows.`,
    );
  }

  const form = `${formPct > 0 ? "+" : ""}${Math.round(formPct)}% of chronic load`;
  if (formPct < -15) {
    score += 35;
    factors.push(`Training stress balance is ${form}: fatigue may amplify late-race fade.`);
  } else if (formPct < -9) {
    score += 20;
    factors.push(`Slightly negative training balance (${form}): watch early pace discipline.`);
  }

  if (score === 0) {
    factors.push("Long run and freshness support your target pacing plan.");
  }

  const level: "low" | "medium" | "high" = score >= 50 ? "high" : score >= 25 ? "medium" : "low";

  return { level, factors };
}

function uncertaintyNote(distance: RaceGoal["distance"]): string {
  switch (distance) {
    case "5k":
      return "Typical prediction error at 5K: ±30–60 seconds vs training form on race day.";
    case "10k":
      return "Typical prediction error at 10K: ±1–2 minutes depending on conditions.";
    case "hm":
      return "Typical prediction error at half marathon: ±2–4 minutes.";
    case "marathon":
      return "Typical prediction error at marathon: ±5–8 minutes. Weather and fueling matter.";
    default:
      return "Race-day conditions can shift finish time materially.";
  }
}

function strategyNarrative(mode: StrategyMode, fade: "low" | "medium" | "high"): string[] {
  const lines: string[] = [];
  if (mode === "even") {
    lines.push(
      "Even-split plan: steady effort with a slight slowdown built into the second half for races 15 km+.",
    );
  } else if (mode === "negative") {
    lines.push(
      "Negative-split plan: controlled first half (~3% slower than even), then ~3% faster second half.",
    );
  } else if (mode === "conservative") {
    lines.push(
      "Conservative plan: easier first half (+3% vs even), only modest pickup after halfway.",
    );
  } else {
    lines.push(
      "Aggressive plan: faster first half (~6% quicker than even), expect heavier fade risk late.",
    );
  }
  if (fade === "high") {
    lines.push("High fade risk: consider conservative mode or revise target time.");
  } else if (fade === "medium") {
    lines.push("Moderate fade risk: start at the slower end of each split range.");
  }
  return lines;
}

export function simulateRaceStrategy(
  goal: RaceGoal,
  prediction: RacePredictionAnalysis,
  fatigue: FatigueSnapshot,
  readiness: RaceReadiness | null,
  strategy: StrategyMode = "even",
): RaceStrategy | null {
  const cfg = RACE_READINESS_CONFIG[goal.distance];
  const consensus = prediction.consensus.find((c) => c.label === cfg.consensusLabel);

  const targetTimeSec = goal.targetTimeSec ?? consensus?.timeSec ?? 0;
  const targetTimeSource = goal.targetTimeSec
    ? "Your goal time"
    : consensus
      ? "Consensus prediction"
      : "";

  if (targetTimeSec <= 0) return null;

  const longestRunKm =
    readiness?.longestRunKm ?? prediction.efforts.reduce((m, e) => Math.max(m, e.distanceKm), 0);

  const exponent = prediction.regression?.exponent ?? null;
  const { level: fadeRisk, factors } = fadeRiskScore(
    exponent,
    fatigue.formPct,
    longestRunKm,
    cfg.raceDistanceKm,
  );

  const splits = buildSplitPlan(cfg.raceDistanceKm, targetTimeSec, strategy);
  const warnings: string[] = [];

  if (goal.targetTimeSec && consensus) {
    const gap = goal.targetTimeSec - consensus.timeSec;
    if (gap < -consensus.spreadSec * 0.5) {
      warnings.push(
        "Goal time is faster than consensus predictions: aggressive unless recent workouts support it.",
      );
    }
  }

  if (fadeRisk === "high") {
    warnings.push("Consider adding 2–3% to target pace in the first half.");
  }

  return {
    targetTimeSec: Math.round(targetTimeSec),
    targetTimeSource,
    distanceKm: cfg.raceDistanceKm,
    distanceLabel: cfg.label,
    strategy,
    splits,
    fadeRisk,
    fadeFactors: factors,
    narrative: strategyNarrative(strategy, fadeRisk),
    warnings,
    uncertaintyNote: uncertaintyNote(goal.distance),
  };
}

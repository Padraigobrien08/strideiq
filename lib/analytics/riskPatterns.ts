import type { WeeklyVolume } from "./volume";
import type { IntensityAdvice } from "./intensityAdvisor";
import type { RunWorkoutLabel } from "./workoutType";
import type { FatigueSnapshot } from "./fatigue";
import { formPercent } from "./fatigue";
import type { RunActivity } from "@/lib/strava/types";
import type { DashboardInsights } from "./index";

/**
 * Risk-pattern matching — detect known dangerous training patterns from the
 * athlete's own series and surface them as named, evidence-backed flags with a
 * mitigation. Deterministic; language layers present these, they must not
 * invent them.
 *
 * Patterns: acute-load spike (ACWR), rapid weekly-volume ramp, negative-balance
 * overreaching streak, excessive hard-run density, and long-run jumping too fast.
 */

export type RiskSeverity = "low" | "medium" | "high";

export interface RiskPattern {
  id: string;
  name: string;
  severity: RiskSeverity;
  /** Normalized 0–1 for ranking within a severity. */
  score: number;
  evidence: string[];
  mitigation: string;
  confidence: "low" | "medium" | "high";
}

export interface RiskPatternInput {
  weeklyVolume: WeeklyVolume[];
  loadHistory: { weekStart: string; label: string; ctl: number; atl: number }[];
  intensityAdvice: IntensityAdvice;
  fatigue: FatigueSnapshot;
  /** Recent long-run distances, oldest → newest (km). */
  recentLongRunsKm: number[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Confidence is capped when load is a distance-based proxy rather than measured. */
function loadConfidence(fatigue: FatigueSnapshot, weeks: number): "low" | "medium" | "high" {
  if (fatigue.usesProxyLoad) return "low";
  return weeks >= 8 ? "high" : weeks >= 4 ? "medium" : "low";
}

function detectAcwrSpike(i: RiskPatternInput): RiskPattern | null {
  const last = i.loadHistory[i.loadHistory.length - 1];
  if (!last || last.ctl < 0.5) return null;
  const acwr = last.atl / last.ctl;
  if (acwr < 1.3) return null;
  const severity: RiskSeverity = acwr >= 1.5 ? "high" : "medium";
  return {
    id: "acwr_spike",
    name: "Acute load spike",
    severity,
    score: clamp((acwr - 1) / 0.6, 0, 1),
    evidence: [
      `Acute:chronic load ratio ${round1(acwr)} (acute ${Math.round(last.atl)} vs chronic ${Math.round(last.ctl)})`,
      "Ratios above ~1.5 are associated with elevated injury risk in the literature.",
    ],
    mitigation: "Insert an easier day or two; let acute load settle back toward chronic fitness.",
    confidence: loadConfidence(i.fatigue, i.loadHistory.length),
  };
}

function detectVolumeRamp(i: RiskPatternInput): RiskPattern | null {
  const weeks = i.weeklyVolume.filter((w) => w.runCount > 0);
  if (weeks.length < 4) return null;
  const recent = weeks[weeks.length - 1].distanceKm;
  const prior = weeks.slice(-4, -1);
  const avgPrior = prior.reduce((s, w) => s + w.distanceKm, 0) / prior.length;
  if (avgPrior <= 0) return null;
  const pct = (recent - avgPrior) / avgPrior;
  if (pct < 0.15) return null; // matches the +15% plan-safety cap
  const severity: RiskSeverity = pct >= 0.3 ? "high" : "medium";
  return {
    id: "volume_ramp",
    name: "Rapid volume ramp",
    severity,
    score: clamp((pct - 0.15) / 0.35, 0, 1),
    evidence: [
      `Weekly volume ${round1(avgPrior)} → ${round1(recent)} km (+${Math.round(pct * 100)}% vs the prior 3-week average)`,
      "Volume jumps beyond ~10–15%/week outpace tissue adaptation.",
    ],
    mitigation: "Hold or trim this week's volume; ramp by no more than ~10% week to week.",
    confidence: weeks.length >= 8 ? "high" : "medium",
  };
}

function detectNegativeBalanceStreak(i: RiskPatternInput): RiskPattern | null {
  let streak = 0;
  for (let k = i.loadHistory.length - 1; k >= 0; k--) {
    const h = i.loadHistory[k];
    if (formPercent(h.ctl, h.atl) < -15) streak++;
    else break;
  }
  if (streak < 2) return null;
  const severity: RiskSeverity = streak >= 3 ? "high" : "medium";
  return {
    id: "tsb_streak",
    name: "Overreaching streak",
    severity,
    score: clamp(streak / 4, 0, 1),
    evidence: [
      `${streak} consecutive weeks of negative training balance (acute above chronic)`,
      `Current freshness ${Math.round(i.fatigue.freshness)} (TSB ${Math.round(i.fatigue.tsb)}).`,
    ],
    mitigation:
      "Schedule a recovery week: reduce volume ~30% and cut hard sessions to rebuild freshness.",
    confidence: loadConfidence(i.fatigue, i.loadHistory.length),
  };
}

function detectHardDensity(i: RiskPatternInput): RiskPattern | null {
  if (i.intensityAdvice.status !== "too_hard") return null;
  const hard = i.intensityAdvice.hardRunsLast14d;
  const severity: RiskSeverity = hard >= 5 ? "high" : "medium";
  return {
    id: "hard_density",
    name: "Excessive intensity",
    severity,
    score: clamp(hard / 6, 0, 1),
    evidence: [
      `${hard} hard runs in the last 14 days`,
      `Easy share ${Math.round(i.intensityAdvice.currentEasyPct)}% vs a ${Math.round(i.intensityAdvice.easyTargetPct)}% target`,
    ],
    mitigation: "Convert one or two hard runs to easy; aim for ~80% of running at easy effort.",
    confidence: "high",
  };
}

function detectLongRunJump(i: RiskPatternInput): RiskPattern | null {
  const longs = i.recentLongRunsKm.filter((k) => k > 0);
  if (longs.length < 2) return null;
  const recent = longs[longs.length - 1];
  const priorMax = Math.max(...longs.slice(0, -1));
  if (priorMax <= 0) return null;
  const pct = (recent - priorMax) / priorMax;
  const absJump = recent - priorMax;
  if (pct < 0.2 && absJump < 3) return null;
  const severity: RiskSeverity = pct >= 0.4 || absJump >= 6 ? "high" : "medium";
  return {
    id: "long_run_jump",
    name: "Long run jumped too fast",
    severity,
    score: clamp(pct / 0.5, 0, 1),
    evidence: [
      `Longest run ${round1(priorMax)} → ${round1(recent)} km (+${Math.round(pct * 100)}%)`,
      "Long-run distance is best extended by ~1–3 km at a time.",
    ],
    mitigation: "Pull the next long run back toward the prior distance, then build gradually.",
    confidence: "medium",
  };
}

const DETECTORS = [
  detectAcwrSpike,
  detectVolumeRamp,
  detectNegativeBalanceStreak,
  detectHardDensity,
  detectLongRunJump,
];

const SEVERITY_RANK: Record<RiskSeverity, number> = { high: 2, medium: 1, low: 0 };

export function detectRiskPatterns(input: RiskPatternInput): RiskPattern[] {
  const patterns = DETECTORS.map((d) => d(input)).filter((p): p is RiskPattern => p !== null);
  return patterns.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.score - a.score,
  );
}

/** Recent long-run distances (km), oldest → newest, from labels joined to runs. */
export function recentLongRunsKm(
  runs: RunActivity[],
  workoutLabels: RunWorkoutLabel[],
  limit = 4,
): number[] {
  const distById = new Map(runs.map((r) => [r.id, r.distanceM / 1000]));
  return workoutLabels
    .filter((l) => l.classification.type === "long")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map((l) => distById.get(l.runId))
    .filter((d): d is number => typeof d === "number" && d > 0);
}

/** Adapter from the analytics bundle (for the Coach tool). */
export function buildRiskPatternInput(
  analytics: DashboardInsights,
  runs: RunActivity[],
): RiskPatternInput {
  return {
    weeklyVolume: analytics.weeklyVolume,
    loadHistory: analytics.loadHistory,
    intensityAdvice: analytics.intensityAdvice,
    fatigue: analytics.fatigue,
    recentLongRunsKm: recentLongRunsKm(runs, analytics.workoutLabels),
  };
}

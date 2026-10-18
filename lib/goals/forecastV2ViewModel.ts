import type { DashboardInsights } from "@/lib/analytics";
import type { RaceGoal } from "@/lib/analytics/readiness";
import type { RunActivity } from "@/lib/strava/types";
import type { FitRunDetail } from "@/lib/strava/fitTypes";
import {
  buildRaceForecastInput,
  buildRaceForecastV2,
  computeForecastSensitivity,
  distanceRelevanceWeight,
  type RaceForecastV2,
  type SensitivityFactor,
} from "@/lib/forecasting-v2";
import { differenceInDays, parseISO } from "date-fns";
import { formatDuration } from "@/lib/utils";

export interface ForecastV2ComponentView {
  key: string;
  label: string;
  score: number;
  effect: "improves" | "weakens" | "neutral";
  explanation: string;
}

export interface ForecastV2KeyEffort {
  label: string;
  time: string;
  distanceKm: number;
  date: string;
}

export interface ForecastV2View {
  enabled: boolean;
  distanceLabel: string;
  keyEfforts: ForecastV2KeyEffort[];
  capabilityBase: string;
  mostLikely: string;
  rangeDisplay: string;
  conservative: string;
  optimistic: string;
  confidence: string;
  confidenceScore: number;
  targetChance: string | null;
  targetGapDisplay: string | null;
  targetRealistic: boolean | null;
  targetPath: string | null;
  components: ForecastV2ComponentView[];
  positiveContributors: { label: string; evidence: string; magnitude: string }[];
  negativeContributors: { label: string; evidence: string; magnitude: string }[];
  modelRows: {
    name: string;
    time: string;
    weightPct: number;
    reason: string;
  }[];
  modelAgreement: {
    label: string;
    spread: string;
    explanation: string;
  };
  scenarios: { name: string; time: string; description: string }[];
  observability: {
    summary: string;
    evidenceChain: string[];
    warnings: string[];
    changeDrivers: string[] | null;
  };
  uncertaintyDrivers: { label: string; impact: string; explanation: string }[];
  sensitivity: SensitivityFactor[];
  limitations: string[];
  recommendation: string;
  raw: RaceForecastV2;
}

function intervalRange(f: RaceForecastV2): string {
  const { innerLowSec, innerHighSec } = f.predictionIntervalSec;
  return `${formatDuration(innerLowSec)}–${formatDuration(innerHighSec)}`;
}

function confidenceLabel(c: RaceForecastV2["confidence"]): string {
  const map: Record<RaceForecastV2["confidence"], string> = {
    low: "Low",
    medium: "Medium",
    medium_high: "Medium-high",
    high: "High",
  };
  return map[c];
}

export function buildKeyEfforts(
  input: NonNullable<ReturnType<typeof buildRaceForecastInput>>,
): ForecastV2KeyEffort[] {
  const targetKm = input.goal.distanceMeters / 1000;
  const now = new Date();

  return [...input.efforts]
    .map((e) => {
      const days = Math.max(0, differenceInDays(now, parseISO(e.date)));
      const recency = Math.exp(-days / 90);
      const relevance = distanceRelevanceWeight(e.distanceKm, targetKm);
      return { e, score: recency * relevance * (e.isRaceLike ? 1.1 : 1) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ e }) => ({
      label: e.runName,
      time: formatDuration(e.timeSec),
      distanceKm: e.distanceKm,
      date: e.date,
    }));
}

export function buildForecastV2View(opts: {
  analytics: DashboardInsights;
  goal: RaceGoal | null;
  runs?: RunActivity[];
  fitDetails?: FitRunDetail[];
  /** Distance to forecast when no race goal is set. */
  fallbackDistance?: RaceGoal["distance"];
}): ForecastV2View | null {
  const input = buildRaceForecastInput({
    analytics: opts.analytics,
    goal: opts.goal,
    runs: opts.runs,
    fitDetails: opts.fitDetails,
    fallbackDistance: opts.fallbackDistance,
  });
  if (!input || input.efforts.length === 0) return null;

  const raw = buildRaceForecastV2(input);

  let targetChance: string | null = null;
  let targetGapDisplay: string | null = null;
  let targetRealistic: boolean | null = null;
  let targetPath: string | null = null;

  if (raw.targetAnalysis) {
    const { gapSec, realistic, targetTimeSec } = raw.targetAnalysis;
    targetRealistic = realistic;
    targetGapDisplay =
      gapSec <= 0
        ? `${formatDuration(Math.abs(gapSec))} ahead of target`
        : `${formatDuration(gapSec)} behind target`;
    const beatsTarget = targetTimeSec >= raw.predictionIntervalSec.innerLowSec;
    targetChance = beatsTarget
      ? "Current evidence suggests target is within the realistic range."
      : "Target is more ambitious than the current prediction interval suggests.";
    targetPath = realistic
      ? "Maintain specificity and freshness; execution discipline on race day."
      : `Likely needs ~${formatDuration(gapSec)} improvement in capability or durability support.`;
  }

  return {
    enabled: true,
    distanceLabel: raw.distanceLabel,
    sensitivity: computeForecastSensitivity(input),
    keyEfforts: buildKeyEfforts(input),
    capabilityBase: formatDuration(raw.capabilityBaseTimeSec),
    mostLikely: formatDuration(raw.mostLikelyTimeSec),
    rangeDisplay: intervalRange(raw),
    conservative: formatDuration(raw.conservativeTimeSec),
    optimistic: formatDuration(raw.optimisticTimeSec),
    confidence: confidenceLabel(raw.confidence),
    confidenceScore: raw.confidenceScore,
    targetChance,
    targetGapDisplay,
    targetRealistic,
    targetPath,
    components: raw.observability.componentBreakdown.map((c) => ({
      key: c.component.toLowerCase(),
      label: c.component,
      score: c.score,
      effect: c.effect,
      explanation: c.explanation,
    })),
    positiveContributors: raw.contributors.positive.map((c) => ({
      label: c.label,
      evidence: c.evidence,
      magnitude: c.magnitude,
    })),
    negativeContributors: raw.contributors.negative.map((c) => ({
      label: c.label,
      evidence: c.evidence,
      magnitude: c.magnitude,
    })),
    modelRows: raw.modelEstimates.map((est) => {
      const meta = raw.observability.modelWeights.find((m) => m.modelName === est.modelName);
      return {
        name: est.modelName,
        time: formatDuration(est.predictedTimeSec),
        weightPct: Math.round(est.weight * 100),
        reason: meta?.reason ?? "",
      };
    }),
    modelAgreement: {
      label: raw.modelAgreement.label,
      spread: formatDuration(raw.modelAgreement.spreadSec),
      explanation: raw.modelAgreement.explanation,
    },
    scenarios: raw.scenarios.map((s) => ({
      name: s.name,
      time: formatDuration(s.predictedTimeSec),
      description: s.description,
    })),
    observability: {
      summary: raw.observability.summary,
      evidenceChain: raw.observability.evidenceChain,
      warnings: raw.observability.warnings,
      changeDrivers: raw.observability.whyPredictionChanged?.drivers ?? null,
    },
    uncertaintyDrivers: raw.uncertaintyDrivers.map((d) => ({
      label: d.label,
      impact: d.impact,
      explanation: d.explanation,
    })),
    limitations: raw.limitations.map((l) => l.detail),
    recommendation: raw.recommendation,
    raw,
  };
}

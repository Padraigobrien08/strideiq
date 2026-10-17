import type { TrainingBlock } from "@/lib/analytics/block";
import type { ReadinessCurrency } from "@/lib/analytics/fatigue";
import type { NormalizedActivity } from "@/lib/ecosystem/types";

/** Race-quality effort used by capability models */
export type RaceQualityEffort = {
  distanceKm: number;
  timeSec: number;
  runId: string;
  runName: string;
  date: string;
  source: string;
  hasHr?: boolean;
  isRaceLike?: boolean;
};

export type RaceForecastGoal = {
  distanceMeters: number;
  targetTimeSec?: number;
  raceDate?: string;
  distanceKey?: "5k" | "10k" | "hm" | "marathon";
};

export type RaceForecastInput = {
  activities: NormalizedActivity[];
  runs: NormalizedActivity[];
  efforts: RaceQualityEffort[];
  recentBlocks: TrainingBlock[];
  trainingEcosystem?: unknown;
  goal: RaceForecastGoal;
  athleteContext?: {
    maxHr?: number;
    readinessScore?: number;
    freshnessScore?: number;
    tsb?: number;
    /** TSB as a percentage of CTL. Preferred over `tsb` for every threshold. */
    formPct?: number;
    ctl?: number;
    atl?: number;
    hardRunsLast14d?: number;
    easyPct?: number;
    efficiencyTrend?: "improving" | "declining" | "stable" | null;
    archetypeLabel?: string;
    /**
     * Whether the training behind these numbers is still current. Without it
     * this model reads a layoff's positive balance as taper-sharpness.
     * See docs/proposals/readiness-model.md.
     */
    currency?: ReadinessCurrency;
    restDaysSinceLastRun?: number;
  };
  /** Prior forecast for observability delta */
  previousMostLikelyTimeSec?: number;
};

export type ForecastModelEstimate = {
  modelName: string;
  predictedTimeSec: number;
  confidence: number;
  weight: number;
  anchorEfforts: string[];
  assumptions: string[];
  limitations: string[];
};

export type DurabilityAssessment = {
  score: number;
  label: "weak" | "moderate" | "strong";
  evidence: string[];
  penalties: string[];
  explanation: string;
  timeMultiplier: number;
};

export type FreshnessAssessment = {
  score: number;
  /**
   * Deliberately still three values. Stale training reports as `fatigued`,
   * because that is the conservative branch every downstream model already
   * takes (wider uncertainty, no optimistic scenario, negative contribution).
   * Read `currency` to tell detraining apart from acute fatigue; the evidence
   * and risk copy says which one it is.
   */
  label: "fatigued" | "neutral" | "fresh";
  timeAdjustmentSec: number;
  evidence: string[];
  risks: string[];
  /** Undefined when the caller supplied no currency (older inputs, fixtures). */
  currency?: ReadinessCurrency;
};

export type SpecificityAssessment = {
  score: number;
  label: "low" | "moderate" | "high";
  evidence: string[];
  gaps: string[];
  timeMultiplier: number;
};

export type ExecutionAssessment = {
  score: number;
  fadeRisk: "low" | "medium" | "high";
  pacingRisk: "low" | "medium" | "high";
  evidence: string[];
  recommendation: string;
  conservativePaddingSec: number;
};

export type ForecastUncertaintyDriver = {
  label: string;
  impact: "low" | "medium" | "high";
  explanation: string;
  /** Seconds this driver adds to the prediction-interval width. */
  widthSec: number;
};

export type UncertaintyAssessment = {
  score: number;
  intervalWidthSec: number;
  /** Irreducible width from model spread alone, before any driver adds to it. */
  baseWidthSec: number;
  drivers: ForecastUncertaintyDriver[];
  confidenceLabel: "low" | "medium" | "medium_high" | "high";
};

export type ForecastContributor = {
  label: string;
  direction: "positive" | "negative" | "neutral";
  magnitude: "small" | "medium" | "large";
  component:
    "capability" | "durability" | "freshness" | "specificity" | "execution" | "uncertainty";
  evidence: string;
  confidence: "low" | "medium" | "high";
};

export type ForecastScenario = {
  name: string;
  predictedTimeSec: number;
  description: string;
};

/**
 * One step of the prediction waterfall — how the forecast moves from raw
 * capability to the most-likely time. Step deltas sum exactly to
 * (mostLikelyTimeSec − capabilityBaseTimeSec).
 */
export type ForecastDerivationStep = {
  key: "capability" | "durability" | "specificity" | "freshness" | "bounds";
  label: string;
  /** Seconds this step added (+, slower) or removed (−, faster); 0 for the base. */
  deltaSec: number;
  /** Running total after this step. */
  cumulativeSec: number;
  /** Multiplier applied, where the step is multiplicative. */
  factor?: number;
  evidence?: string;
};

export type ForecastEvidence = {
  label: string;
  detail: string;
};

export type ForecastLimitation = {
  label: string;
  detail: string;
};

export type ForecastObservability = {
  summary: string;
  whyPredictionChanged?: {
    previousPredictionSec?: number;
    currentPredictionSec: number;
    drivers: string[];
  };
  componentBreakdown: {
    component: string;
    score: number;
    effect: "improves" | "weakens" | "neutral";
    explanation: string;
  }[];
  modelWeights: {
    modelName: string;
    weight: number;
    reason: string;
  }[];
  evidenceChain: string[];
  warnings: string[];
};

export type RaceForecastV2 = {
  distanceMeters: number;
  distanceLabel: string;

  /** Weighted capability models before durability/freshness adjustments */
  capabilityBaseTimeSec: number;
  mostLikelyTimeSec: number;
  conservativeTimeSec: number;
  optimisticTimeSec: number;
  /**
   * The band shown to the athlete, in seconds, widest first.
   *
   * **These are not quantiles, and the names deliberately no longer pretend to be.**
   * They were `p10/p25/p50/p75/p90` until this commit, which asserted a distribution
   * that has never been fitted: the width comes from `uncertaintyModel`, which sums
   * hand-chosen seconds per risk driver and then applies a minimum-width floor as a
   * share of predicted time. The five points are a symmetric spread of that width via
   * fixed multipliers. Nothing about the construction makes 10% of outcomes fall below
   * `outerLowSec`.
   *
   * Symmetry is also wrong on its own terms — race times are right-skewed, because a
   * blow-up costs far more than a good day gains — but a symmetric heuristic is honest
   * where a symmetric *quantile* is not, so the shape is left alone and only the claim
   * is withdrawn.
   *
   * Replace with fitted quantiles when enough races have been scored to fit one; the
   * observed hit rate in `summarizeCalibration` is exactly that input.
   */
  predictionIntervalSec: {
    outerLowSec: number;
    innerLowSec: number;
    mostLikelySec: number;
    innerHighSec: number;
    outerHighSec: number;
  };

  confidence: "low" | "medium" | "medium_high" | "high";
  confidenceScore: number;

  componentScores: {
    capability: number;
    durability: number;
    freshness: number;
    specificity: number;
    execution: number;
    uncertainty: number;
  };

  modelEstimates: ForecastModelEstimate[];
  modelAgreement: {
    score: number;
    label: "low" | "medium" | "high";
    spreadSec: number;
    explanation: string;
  };

  contributors: {
    positive: ForecastContributor[];
    negative: ForecastContributor[];
    neutral: ForecastContributor[];
  };

  uncertaintyDrivers: ForecastUncertaintyDriver[];
  /** Prediction-interval width (sec) and its irreducible base (from model spread). */
  uncertaintyWidthSec: number;
  uncertaintyBaseWidthSec: number;

  observability: ForecastObservability;
  /** Step-by-step derivation from capability base to most-likely time. */
  derivation: ForecastDerivationStep[];
  scenarios: ForecastScenario[];

  evidence: ForecastEvidence[];
  limitations: ForecastLimitation[];

  recommendation: string;

  /** Target gap when goal.targetTimeSec set */
  targetAnalysis?: {
    targetTimeSec: number;
    gapSec: number;
    realistic: boolean;
    explanation: string;
  };
};

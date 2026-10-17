import type { DashboardInsights } from "@/lib/analytics";
import type { TrainingLoadBalancePayload } from "./loadBalancePayload";
import type { Insight } from "@/lib/insights/types";
import type { ImportQualityReport } from "@/lib/quality/assessImport";
import type { RaceGoal } from "@/lib/analytics/readiness";
import type { StrategyMode } from "@/lib/analytics/raceStrategy";
import type { LegFeel } from "@/lib/wellness/types";

export type IntelligenceConfidence = "low" | "medium" | "high";

export interface IntelligenceEnvelope<T> {
  dataAsOf: string;
  confidence: IntelligenceConfidence;
  evidence: string[];
  limitations: string[];
  payload: T;
}

export interface IntelligenceSettings {
  defaultWeeklyRuns: number;
  maxWeeklyKm: number;
}

export interface IntelligenceContext {
  userId: string;
  raceGoal?: RaceGoal | null;
  settings?: Partial<IntelligenceSettings>;
  /** Today's reported leg-feel, resolved from the DB per request. */
  legFeel?: LegFeel;
}

export interface RecentRunSummary {
  runId: string;
  date: string;
  name: string;
  type: string;
  distanceKm: number;
  pace: string | null;
  durationMin?: number;
  avgHr?: number | null;
  maxHr?: number | null;
  elevationGainM?: number | null;
  executionQuality?: string;
  executionScore?: number;
  lateFadePct?: number | null;
  hrDriftPct?: number | null;
  fatigueCost?: string;
  streams?: string;
  narrative?: string;
}

export interface AthleteIntelligenceBundle {
  analytics: DashboardInsights;
  insights: Insight[];
  quality: ImportQualityReport;
  recentRuns: RecentRunSummary[];
  runs: import("@/lib/strava/types").RunActivity[];
  fitDetails: import("@/lib/strava/fitTypes").FitRunDetail[];
}

export interface IntelligenceBrief {
  briefVersion: 1;
  dataAsOf: string;
  confidence: IntelligenceConfidence;
  athleteState: string;
  recommendation: string;
  race: {
    hasGoal: boolean;
    distanceLabel: string | null;
    daysUntilRace: number | null;
    readinessScore: number;
    readinessLabel: string;
    projectedFinish: string | null;
    largestRisk: string | null;
  };
  fatigue: {
    /** Null when there is not enough load history; quote `trainingLoadBalance` instead. */
    freshness: number | null;
    label: string;
    tsb: number | null;
    trainingLoadBalance: TrainingLoadBalancePayload;
  };
  weekPlan: {
    weekLabel: string;
    template: string;
    totalKm: string;
    sessions: { day: string; type: string; description: string }[];
  };
  predictions: { label: string; time: string; spread: string }[];
  topInsights: {
    title: string;
    evidence: string[];
    confidence: IntelligenceConfidence;
  }[];
  dataQuality: {
    runCount: number;
    fitParsed: number;
    fitPct: number;
    warnings: string[];
  };
  limitations: string[];
}

export type IntelligenceToolName =
  | "get_coach_brief"
  | "get_readiness"
  | "get_predictions"
  | "get_week_plan"
  | "recommend_today_session"
  | "get_goal_scenarios"
  | "explain_prediction"
  | "get_physiology"
  | "get_capability_radar"
  | "get_progression_burndown"
  | "get_session_zscores"
  | "get_anomalies"
  | "get_uncertainty"
  | "get_correlations"
  | "get_change_points"
  | "get_forecast_accuracy"
  | "get_recommendation_outcomes"
  | "get_risk_patterns"
  | "get_monthly_narrative"
  | "get_pre_race_narrative"
  | "get_training_phases"
  | "get_race_strategy"
  | "get_fatigue_load"
  | "list_recent_runs"
  | "get_run_detail"
  | "get_data_quality"
  | "get_connection_status"
  | "compare_sessions"
  | "explain_readiness_delta"
  | "find_best_phase"
  | "attribute_improvement"
  | "analyze_fade_pattern"
  | "pr_context"
  | "get_training_ecosystem"
  | "get_training_ecosystem_summary"
  | "get_modality_distribution"
  | "get_cross_training_support"
  | "get_interference_risks"
  | "get_athlete_archetype"
  | "compare_modality_blocks"
  | "get_race_week_interference_check"
  | "get_strength_mobility_support"
  | "get_athlete_memory"
  | "generate_next_week_training_plan";

export interface EcosystemWindowArgs {
  window?: number;
}

export interface CompareModalityBlocksArgs {
  blockADays?: number;
  blockBDays?: number;
}

export interface RaceWeekInterferenceArgs {
  goalId?: string;
}

export interface CompareSessionsToolArgs {
  type?: "tempo" | "interval" | "long" | "race";
  n?: number;
}

export interface ExplainReadinessDeltaToolArgs {
  weeks?: number;
}

export interface FindBestPhaseToolArgs {
  metric?: "aerobic" | "volume" | "consistency" | "efficiency";
}

export interface AttributeImprovementToolArgs {
  metric?: "pace" | "efficiency" | "volume";
}

export interface AnalyzeFadePatternToolArgs {
  distanceKm?: number;
}

export interface PrContextToolArgs {
  bucket?: "5k" | "10k" | "hm" | "long";
  runId?: string;
}

export interface ListRecentRunsArgs {
  limit?: number;
}

export interface GetRunDetailArgs {
  runId?: string;
  /** YYYY-MM-DD — most recent run on that day if runId omitted */
  date?: string;
}

export interface GetRaceStrategyArgs {
  mode?: StrategyMode;
}

export interface GenerateNextWeekTrainingPlanArgs {
  goalId?: string;
  windowDays?: 14 | 21 | 28;
  planPreference?: "conservative" | "balanced" | "aggressive";
  availableDays?: string[];
  constraints?: string[];
  planningContext?: string;
}

export interface ToolCallInput {
  name: IntelligenceToolName;
  arguments?: Record<string, unknown>;
}

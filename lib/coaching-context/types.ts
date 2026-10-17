import type { AthleteArchetype } from "@/lib/ecosystem/types";
import type { LegFeel } from "@/lib/wellness/types";
import type { TrainingLoadBalancePayload } from "@/lib/intelligence/loadBalancePayload";

export type ConfidenceLevel = "low" | "medium" | "high";

export type GoalPriority = "low" | "medium" | "high";

export type FatigueStateLabel = "fresh" | "neutral" | "fatigued" | "unknown";

export type DurabilityLabel = "weak" | "moderate" | "strong" | "unknown";

export type SpecificityLabel = "low" | "moderate" | "high" | "unknown";

export type IntensityBalanceLabel = "easy_biased" | "balanced" | "intensity_heavy" | "unknown";

export type CoverageLevel = "low" | "medium" | "high";

export interface AthletePattern {
  id: string;
  label: string;
  summary: string;
  confidence: ConfidenceLevel;
}

export interface NotableSession {
  date: string;
  label: string;
  distanceKm?: number;
  durationMin?: number;
  type: string;
  note: string;
}

/** Per-run coaching payload: summary + stream-backed execution analysis. */
export interface RunCoachDetail {
  runId: string;
  date: string;
  name: string;
  workoutType: string;
  workoutTypeLabel: string;
  distanceKm: number;
  durationMin: number;
  pace: string | null;
  avgHr: number | null;
  maxHr: number | null;
  elevationGainM: number | null;
  trainingLoad: number | null;
  gradeAdjustedPace: string | null;
  streams: string;
  lapCount: number;
  lapSummary?: string;
  hrDriftPct: number | null;
  lateFadePct: number | null;
  executionQuality: string;
  executionScore: number;
  fatigueCost: string;
  goalAlignment: string;
  pacingAssessment: string;
  hrAssessment?: string;
  historicalComparison?: string;
  likelyAdaptations: string[];
  narrative: string;
  evidence: string[];
}

export interface RecentTrainingWeek {
  weekStart: string;
  weekLabel: string;
  runDistanceKm: number;
  runCount: number;
  hardRunCount: number;
  longRunDistanceKm: number;
  totalTrainingMinutes: number;
  strengthSessions: number;
  mobilitySessions: number;
  crossTrainingMinutes: number;
  highIntensityNonRunSessions: number;
  restDaysEstimate: number;
  changeNotes: string[];
}

export interface RecentTrainingBlock {
  windowDays: number;
  weeks: RecentTrainingWeek[];
  summary: string;
  keyChanges: string[];
  notableSessions: NotableSession[];
}

export interface CoachingGoalContext {
  raceType: string;
  distanceMeters: number;
  raceDate?: string;
  daysUntilRace?: number;
  targetTimeSec?: number;
  priority: GoalPriority;
}

export interface CoachingCurrentState {
  readiness?: number;
  /** Absent when there is not enough load history (see `trainingLoadBalance`). */
  freshness?: number;
  /** The load reading the app's decisions use; the one the planning LLM should quote. */
  trainingLoadBalance: TrainingLoadBalancePayload;
  /** Athlete's reported leg-feel for the day, if any. */
  reportedLegFeel?: LegFeel;
  fatigueState: FatigueStateLabel;
  durability: DurabilityLabel;
  specificity: SpecificityLabel;
  intensityBalance: IntensityBalanceLabel;
  primaryFocus: string;
  stateSummary: string;
}

export interface CoachingForecastContext {
  mostLikelyTimeSec?: number;
  realisticRangeSec?: { low: number; high: number };
  confidence: "low" | "medium" | "medium_high" | "high";
  positiveContributors: string[];
  negativeContributors: string[];
  uncertaintyDrivers: string[];
  recommendation?: string;
}

export interface CoachingModalityContext {
  athleteArchetype: AthleteArchetype;
  modalityDistribution: Record<string, number>;
  crossTrainingSummary: string;
  strengthSummary: string;
  mobilitySummary: string;
  interferenceRisks: string[];
}

export interface CoachingRiskItem {
  label: string;
  severity: "low" | "medium" | "high";
  evidence: string[];
  confidence: ConfidenceLevel;
}

export interface CoachingOpportunityItem {
  label: string;
  evidence: string[];
  confidence: ConfidenceLevel;
}

export interface CoachingConstraints {
  maxWeeklyVolumeKm?: number;
  maxHardSessions?: number;
  raceWeek?: boolean;
  tapering?: boolean;
  avoidIntensityStacking?: boolean;
  notes: string[];
}

export interface CoachingRecommendationHistory {
  recentRecommendations: string[];
  observedOutcomes: string[];
}

export interface CoachingDataQuality {
  activityCount: number;
  hrCoverage: CoverageLevel;
  streamCoverage: CoverageLevel;
  confidenceLimitations: string[];
}

export interface CoachingContext {
  generatedAt: string;
  athlete: {
    archetype: AthleteArchetype;
    profileSummary: string;
    knownPatterns: AthletePattern[];
  };
  goal?: CoachingGoalContext;
  currentState: CoachingCurrentState;
  recentTraining: RecentTrainingBlock;
  /** Last ~12 runs with pace/HR/lap/execution detail when FIT data exists. */
  recentSessionDetails: RunCoachDetail[];
  forecast?: CoachingForecastContext;
  modalityContext: CoachingModalityContext;
  risks: CoachingRiskItem[];
  opportunities: CoachingOpportunityItem[];
  constraints: CoachingConstraints;
  recommendationHistory: CoachingRecommendationHistory;
  dataQuality: CoachingDataQuality;
}

export type CoachingContextWindowDays = 14 | 21 | 28;

export interface CoachingContextOptions {
  windowDays?: CoachingContextWindowDays;
  includeRawSessions?: boolean;
  /** Include per-run execution detail (default true when runs are provided). */
  includeSessionDetails?: boolean;
  sessionDetailLimit?: number;
  includeForecast?: boolean;
  includeMemory?: boolean;
  includeModality?: boolean;
  goalId?: string;
  recentRecommendations?: string[];
  observedOutcomes?: string[];
}

export interface CoachingContextInput {
  options?: CoachingContextOptions;
}

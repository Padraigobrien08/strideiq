import type { DashboardInsights } from "@/lib/analytics";
import type { RunActivity } from "@/lib/strava/types";
import type { FitRunDetail } from "@/lib/strava/fitTypes";
import { RACE_READINESS_CONFIG, type RaceGoal } from "@/lib/analytics/readiness";
import { isRaceLikeEffort } from "@/lib/analytics/predictions";
import { effortsFromRuns } from "./capabilityModels";
import { prepareCapabilityEfforts } from "./effortSelection";
import type { RaceForecastInput, RaceQualityEffort } from "./forecastTypes";
import type { NormalizedActivity } from "@/lib/ecosystem/types";

function runsToNormalized(runs: RunActivity[]): NormalizedActivity[] {
  return runs.map((r) => ({
    id: r.id,
    source: "strava_export" as const,
    sportType: "Run",
    modality: "run" as const,
    name: r.name,
    startDate: r.date,
    movingTimeSec: r.movingSec ?? Math.round((r.distanceM / 1000) * 300),
    elapsedTimeSec: r.elapsedSec ?? r.movingSec ?? 0,
    distanceMeters: r.distanceM,
    avgHr: r.avgHr ?? undefined,
    hasStreams: false,
    hasLaps: false,
    perceivedIntensity: "unknown" as const,
    intensity: { level: "unknown" as const, confidence: "low" as const, evidence: [] },
    confidence: "low" as const,
  }));
}

function effortsFromAnalysis(
  analytics: DashboardInsights,
  runs: RunActivity[],
): RaceQualityEffort[] {
  // Callers may hand in a partial DashboardInsights; without labels an effort is
  // judged on its source alone, as it was before classifications were threaded through.
  const typeById = new Map(
    (analytics.workoutLabels ?? []).map((l) => [l.runId, l.classification.type]),
  );
  return analytics.racePredictionAnalysis.efforts.map((e) => ({
    ...e,
    hasHr: runs.some((r) => r.id === e.runId && r.avgHr != null),
    isRaceLike: isRaceLikeEffort(e, typeById.get(e.runId)),
  }));
}

export function buildRaceForecastInput(opts: {
  runs?: RunActivity[];
  fitDetails?: FitRunDetail[];
  analytics: DashboardInsights;
  goal: RaceGoal | null;
  /**
   * Distance to forecast when no race is set.
   *
   * Without this the function returns null, and every caller falls back to
   * whatever older model it has. On the live account that meant the Performance
   * page quietly showed the legacy Riegel/consensus projection, which backtests
   * at +29% against a held-out race where this engine came in at +7.5%. An
   * athlete with no goal should still get the better model, not a worse one.
   */
  fallbackDistance?: RaceGoal["distance"];
  previousMostLikelyTimeSec?: number;
}): RaceForecastInput | null {
  const { analytics } = opts;
  const distance = opts.goal?.distance ?? opts.fallbackDistance;
  if (!distance) return null;
  const goal = opts.goal;

  const runs = opts.runs ?? [];
  const fitDetails = opts.fitDetails ?? [];
  const rawEfforts =
    runs.length > 0
      ? effortsFromRuns(runs, fitDetails, analytics.workoutLabels)
      : effortsFromAnalysis(analytics, runs);
  const efforts = prepareCapabilityEfforts(rawEfforts);
  const normalized = runsToNormalized(runs);
  const cfg = RACE_READINESS_CONFIG[distance];

  return {
    activities: normalized,
    runs: normalized,
    efforts,
    recentBlocks: analytics.trainingBlocks ?? [],
    goal: {
      distanceMeters: Math.round(cfg.raceDistanceKm * 1000),
      distanceKey: distance,
      // No goal means no date and no target: downstream taper and target logic
      // must stay silent rather than invent a race.
      targetTimeSec: goal?.targetTimeSec ?? undefined,
      raceDate: goal?.date,
    },
    athleteContext: {
      readinessScore: analytics.raceReadiness?.score,
      // Without load evidence the freshness model gets nothing to adjust from and
      // stays neutral, rather than moving the race time on a week or two of load.
      ...(analytics.fatigue.loadEvidence.sufficient
        ? {
            freshnessScore: analytics.fatigue.freshness,
            tsb: analytics.fatigue.tsb,
            formPct: analytics.fatigue.formPct,
          }
        : { loadEvidenceInsufficient: true }),
      ctl: analytics.fatigue.ctl,
      atl: analytics.fatigue.atl,
      hardRunsLast14d: analytics.intensityAdvice.hardRunsLast14d,
      easyPct: analytics.intensityAdvice.currentEasyPct,
      efficiencyTrend: analytics.efficiencySummary.trend,
      // Optional-chained on purpose: callers cast analytics past the type in
      // places, and a forecast should degrade to the rest-days fallback in
      // assessFreshness rather than throw if readiness is absent.
      currency: analytics.fatigue.readiness?.currency,
      restDaysSinceLastRun: analytics.fatigue.restDaysSinceLastRun,
    },
    previousMostLikelyTimeSec: opts.previousMostLikelyTimeSec,
  };
}

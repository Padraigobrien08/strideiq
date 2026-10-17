import type { DashboardInsights } from "@/lib/analytics";
import { buildOutcomeEvidenceFromAnalytics } from "./buildOutcomeEvidence";
import { confidenceToScore, evaluateRecommendationOutcome } from "./evaluateRecommendationOutcome";
import type { OutcomeTrackingInput, TrackedRecommendationOutcome } from "./types";

const MAX_STORED = 40;

/**
 * How long a recommendation must stand before its outcome can be judged.
 *
 * `buildAdaptiveIntelligence` tracks a recommendation and then evaluates pending
 * outcomes in the same call, so every recommendation was being graded in the instant
 * it was issued, against the very analytics that produced it. A verdict of
 * "supported" then meant "this advice matched the current state", not "this advice
 * worked" — and `updateBeliefsFromOutcome` minted a belief captioned "Historical
 * evidence suggests…" on that basis. Unearned beliefs are worse than no beliefs.
 *
 * A training recommendation needs at least a day before any signal could exist:
 * freshness, readiness and efficiency all move on daily-or-slower timescales.
 * Anything younger stays pending rather than being resolved on no evidence.
 */
export const MIN_OBSERVATION_HOURS = 24;

/**
 * In-process working set.
 *
 * This used to be the whole story, which is why the loop could not close in a
 * serverless deployment: a pending outcome never survived to the request that could
 * have judged it. Durability now lives in `recommendation_outcome_log` — server
 * callers hydrate this map before building and persist it after, via
 * `./persistence.ts`. Keeping the map as the working set is what lets
 * `buildAdaptiveIntelligence` stay synchronous and lets the client path, which has no
 * database, behave exactly as before.
 */
const outcomeStore = new Map<string, TrackedRecommendationOutcome[]>();

/** Has enough time passed since issue for an effect to be observable? */
export function isObservable(
  outcome: Pick<TrackedRecommendationOutcome, "issuedAt">,
  now: Date = new Date(),
): boolean {
  const issued = Date.parse(outcome.issuedAt);
  if (Number.isNaN(issued)) return false;
  return now.getTime() - issued >= MIN_OBSERVATION_HOURS * 60 * 60 * 1000;
}

export function trackRecommendationOutcome(
  athleteKey: string,
  input: OutcomeTrackingInput,
): TrackedRecommendationOutcome {
  const pending: TrackedRecommendationOutcome = {
    recommendationId: input.recommendationId,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    recommendation: input.recommendation,
    expectedOutcome: input.expectedOutcome,
    observedSignals: [],
    evaluation: "inconclusive",
    confidenceBefore: input.confidenceBefore ?? confidenceToScore("medium"),
    evidence: [],
  };

  const list = outcomeStore.get(athleteKey) ?? [];
  const filtered = list.filter((o) => o.recommendationId !== input.recommendationId);
  filtered.unshift(pending);
  outcomeStore.set(athleteKey, filtered.slice(0, MAX_STORED));
  return pending;
}

export function getTrackedOutcomes(athleteKey: string): TrackedRecommendationOutcome[] {
  return [...(outcomeStore.get(athleteKey) ?? [])];
}

export function evaluatePendingOutcomes(
  athleteKey: string,
  analytics: DashboardInsights,
  priorSnapshot?: { freshness?: number; tsb?: number; readiness?: number },
  now: Date = new Date(),
): TrackedRecommendationOutcome[] {
  const list = outcomeStore.get(athleteKey) ?? [];
  const evidence = buildOutcomeEvidenceFromAnalytics(analytics, priorSnapshot);
  const updated = list.map((o) => {
    if (o.evaluatedAt && o.evaluation !== "inconclusive") return o;
    // Too soon to tell. Leave it pending rather than resolving it on no evidence —
    // `applyOutcomesToMemory` skips an outcome with no `evaluatedAt`, so an unjudged
    // recommendation cannot reach a belief.
    if (!isObservable(o, now)) return o;
    const withSignals = {
      ...o,
      observedSignals: evidence,
      evidence,
    };
    return evaluateRecommendationOutcome({
      outcome: withSignals,
      // Too little history and the balance would be judged on noise.
      ...(analytics.fatigue.loadEvidence.sufficient
        ? { freshness: analytics.fatigue.freshness, tsb: analytics.fatigue.tsb }
        : {}),
      readinessScore: analytics.raceReadiness?.score ?? analytics.halfMarathonReadiness.score,
      efficiencyTrend: analytics.efficiencySummary.trend,
      hardRuns14d: analytics.intensityAdvice.hardRunsLast14d,
    });
  });
  outcomeStore.set(athleteKey, updated);
  return updated;
}

/**
 * Load previously tracked outcomes into the working set.
 *
 * The store is a per-process Map, which is fine as a working set but cannot span
 * requests on its own — that is why the loop could never close in a serverless
 * deployment. Callers with database access hydrate before building and persist after,
 * which keeps `buildAdaptiveIntelligence` synchronous and leaves the client path (no
 * database, nothing tracked) working exactly as before.
 *
 * Stored outcomes are merged *under* anything already in memory for that key, so a
 * fresher in-flight record is never clobbered by an older stored one.
 */
export function hydrateOutcomeStore(
  athleteKey: string,
  stored: TrackedRecommendationOutcome[],
): void {
  const existing = outcomeStore.get(athleteKey) ?? [];
  const byId = new Map<string, TrackedRecommendationOutcome>();
  for (const o of stored) byId.set(o.recommendationId, o);
  for (const o of existing) byId.set(o.recommendationId, o);
  const merged = [...byId.values()]
    .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt))
    .slice(0, MAX_STORED);
  outcomeStore.set(athleteKey, merged);
}

export function clearOutcomeStore(athleteKey?: string): void {
  if (athleteKey) outcomeStore.delete(athleteKey);
  else outcomeStore.clear();
}

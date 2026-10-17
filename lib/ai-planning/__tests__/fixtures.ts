import {
  hybridAthlete,
  insightsFrom,
  lowData,
  mkRun,
  overloadedBlock,
  raceWeekAthlete,
  taperWeek,
} from "@/lib/coaching-context/__tests__/fixtures";
import { buildCoachingContext } from "@/lib/coaching-context";
import type { CoachingContext } from "@/lib/coaching-context";
import type { RaceGoal } from "@/lib/analytics/readiness";
import { format, addDays } from "date-fns";

export function coachingContextFrom(
  fixture: ReturnType<typeof insightsFrom>,
  goal?: RaceGoal | null,
): CoachingContext {
  return buildCoachingContext({
    analytics: fixture.analytics,
    quality: fixture.quality,
    runs: fixture.runs,
    raceGoal: goal ?? null,
    options: { windowDays: 21, includeForecast: false },
  });
}

export const contexts = {
  lowData: () => coachingContextFrom(lowData),
  noGoal: () =>
    coachingContextFrom(
      insightsFrom(Array.from({ length: 12 }, (_, i) => mkRun(i + 1, { distanceM: 10000 }))),
    ),
  hybrid: () => coachingContextFrom(hybridAthlete()),
  overloaded: () => coachingContextFrom(overloadedBlock()),
  raceWeek: () => {
    const f = raceWeekAthlete();
    return coachingContextFrom(f, {
      distance: "hm",
      date: f.analytics.raceReadiness?.raceDate ?? format(addDays(new Date(), 5), "yyyy-MM-dd"),
      targetTimeSec: 7200,
    });
  },
  taper: () => {
    const f = taperWeek();
    return coachingContextFrom(f, {
      distance: "hm",
      date: f.analytics.raceReadiness?.raceDate ?? "",
    });
  },
  missingHr: () => coachingContextFrom(lowData),
  fatigueHeavy: () => {
    // Four weeks of easy base before the heavy fortnight, so the load balance has the
    // history it needs to count as evidence (see `assessLoadEvidence`).
    const base = Array.from({ length: 10 }, (_, i) =>
      mkRun(16 + i * 3, { distanceM: 8000, id: `base-${i}` }),
    );
    const heavy = Array.from({ length: 14 }, (_, i) => mkRun(i, { distanceM: 12000, avgHr: 170 }));
    const runs = [...base, ...heavy];
    const f = insightsFrom(runs, {
      distance: "hm",
      date: format(addDays(new Date(), 30), "yyyy-MM-dd"),
    });
    f.analytics.fatigue.freshness = 38;
    f.analytics.fatigue.tsb = -22;
    f.analytics.fatigue.formPct = -30; // -22 through form = 1.25 × tsb − 2.5
    return coachingContextFrom(f, {
      distance: "hm",
      date: format(addDays(new Date(), 30), "yyyy-MM-dd"),
    });
  },
};

export function invalidLlmPlan(weekStart: string) {
  return {
    weekStart,
    planType: "build",
    summary: "Bad plan with too much work",
    hardSessionCount: 5,
    totalRunDistanceKm: 120,
    workouts: Array.from({ length: 5 }, (_, i) => ({
      day: ["Mon", "Tue", "Wed", "Thu", "Fri"][i],
      modality: "run",
      type: "tempo",
      title: `Hard ${i}`,
      intensity: "hard",
      purpose: "Go hard",
      constraintsApplied: [],
      reasoning: "Too much quality work for current fatigue state",
    })),
    rationale: {
      primaryGoal: "Get fit",
      evidenceUsed: ["Recent overload signal"],
      tradeoffs: [],
      risksManaged: [],
    },
    confidence: "high",
    limitations: ["Test fixture"],
  };
}

export function invalidPlanMissingEvidence(weekStart: string) {
  const base = invalidLlmPlan(weekStart) as Record<string, unknown>;
  return {
    ...base,
    rationale: {
      primaryGoal: "Train hard",
      evidenceUsed: ["placeholder"],
      tradeoffs: [],
      risksManaged: [],
    },
    limitations: ["fixture"],
    workouts: (base.workouts as unknown[]).slice(0, 4),
    hardSessionCount: 5,
    totalRunDistanceKm: 90,
  };
}

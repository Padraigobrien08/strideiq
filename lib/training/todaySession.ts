import { differenceInCalendarDays, parseISO } from "date-fns";
import type { FatigueSnapshot } from "@/lib/analytics/fatigue";
import type { IntensityAdvice } from "@/lib/analytics/intensityAdvisor";
import type { RaceReadiness } from "@/lib/analytics/readiness";
import type { RunWorkoutLabel, WorkoutType } from "@/lib/analytics/workoutType";
import { WORKOUT_TYPE_LABELS } from "@/lib/analytics/workoutType";
import type { WeeklyVolume } from "@/lib/analytics/volume";

/**
 * "What should I run today?" — a single-session recommendation.
 *
 * Deterministic: the engine reasons only from current fatigue, recent
 * intensity balance, time since the last quality/long session, and race
 * proximity. Language layers (Coach) surface it; they must not invent it.
 */
export type TodaySessionKind = "rest" | "recovery" | "easy" | "long" | "tempo" | "interval";

export interface TodaySessionRecommendation {
  kind: TodaySessionKind;
  typeLabel: string;
  headline: string;
  distanceKmRange: [number, number] | null;
  intensity: "rest" | "easy" | "moderate" | "hard";
  rationale: string[];
  alternatives: string[];
  confidence: "low" | "medium" | "high";
  evidence: string[];
}

export interface TodaySessionInput {
  fatigue: FatigueSnapshot;
  intensityAdvice: IntensityAdvice;
  raceReadiness: RaceReadiness | null;
  /** Typical single-run distance (km) from recent weeks; 0 if unknown. */
  typicalRunKm: number;
  longestRunKm: number;
  /** Days since the last tempo/interval/race session; null if none found. */
  daysSinceLastHard: number | null;
  /** Days since the last long run; null if none found. */
  daysSinceLastLong: number | null;
  runCount: number;
}

const HARD_TYPES: ReadonlySet<WorkoutType> = new Set(["tempo", "interval", "race"]);

function kmRange(mid: number): [number, number] | null {
  if (mid <= 0) return null;
  const lo = Math.max(2, Math.round(mid * 0.85));
  const hi = Math.round(mid * 1.15);
  return [lo, hi <= lo ? lo + 1 : hi];
}

function make(
  kind: TodaySessionKind,
  typeLabel: string,
  distanceKmRange: [number, number] | null,
  intensity: TodaySessionRecommendation["intensity"],
  rationale: string[],
  alternatives: string[],
  confidence: TodaySessionRecommendation["confidence"],
  evidence: string[],
): TodaySessionRecommendation {
  const dist = distanceKmRange ? `${distanceKmRange[0]}–${distanceKmRange[1]} km` : null;
  return {
    kind,
    typeLabel,
    headline: dist ? `${typeLabel}, ${dist}` : typeLabel,
    distanceKmRange,
    intensity,
    rationale,
    alternatives,
    confidence,
    evidence,
  };
}

export function recommendTodaySession(i: TodaySessionInput): TodaySessionRecommendation {
  const confidence = i.runCount >= 20 ? "high" : i.runCount >= 8 ? "medium" : "low";
  const days = i.raceReadiness?.daysUntilRace ?? null;
  const freshness = Math.round(i.fatigue.freshness);
  // Under four weeks of history the balance is not evidence: it neither forces
  // recovery nor unlocks quality, and the schedule and intensity rules decide.
  const loadKnown = i.fatigue.loadEvidence.sufficient;
  const evidence = [
    loadKnown
      ? `Freshness ${freshness} (TSB ${Math.round(i.fatigue.tsb)})`
      : `Not enough load history yet (${i.fatigue.loadEvidence.historyDays} days)`,
    i.daysSinceLastHard != null
      ? `${i.daysSinceLastHard}d since last quality session`
      : "No recent quality session",
    ...(days != null ? [`Race in ${days} days`] : []),
  ];

  // 1. Race day / day before.
  if (days != null && days <= 1) {
    return make(
      "rest",
      days === 0 ? "Rest: race day" : "Rest or shakeout",
      null,
      "rest",
      [
        days === 0
          ? "Race day: trust the taper; nothing to gain from training now."
          : "Day before your race: rest, or a 10–15 min shakeout with a few strides.",
      ],
      ["10–15 min easy shakeout with 3–4 strides"],
      confidence,
      evidence,
    );
  }

  // 2. Deep fatigue → recovery or rest.
  if (loadKnown && (i.fatigue.freshness < 30 || i.fatigue.formPct < -34)) {
    return make(
      "recovery",
      "Recovery run or rest",
      kmRange(Math.min(i.typicalRunKm * 0.6, 6)),
      "easy",
      [
        `Fatigue is high (freshness ${freshness}). Take a rest day or a very easy short jog to absorb load before your next quality session.`,
      ],
      ["Full rest day"],
      confidence,
      evidence,
    );
  }

  // 3. Taper week (2–10 days out) → easy + strides.
  if (days != null && days <= 10) {
    return make(
      "easy",
      "Easy with strides",
      kmRange(Math.min(i.typicalRunKm, 8)),
      "easy",
      [
        "Taper week: keep the effort easy and add 4–6 short strides to stay sharp without adding fatigue.",
      ],
      ["Rest if your legs feel heavy"],
      confidence,
      evidence,
    );
  }

  // 4. Intensity has been too high lately → keep it easy.
  if (i.intensityAdvice.status === "too_hard") {
    return make(
      "easy",
      "Easy aerobic",
      kmRange(i.typicalRunKm),
      "easy",
      [
        `Intensity has been high (${i.intensityAdvice.hardRunsLast14d} hard runs in 14 days; easy share ${Math.round(i.intensityAdvice.currentEasyPct)}% vs a ${Math.round(i.intensityAdvice.easyTargetPct)}% target). Keep today easy.`,
      ],
      ["Recovery run"],
      confidence,
      evidence,
    );
  }

  // 5. Fresh and due for quality → tempo. Without load evidence, only an athlete with
  // quality sessions on record is "due" one: schedule, not balance, decides.
  const dueForQuality = loadKnown
    ? i.fatigue.freshness >= 50 && (i.daysSinceLastHard == null || i.daysSinceLastHard >= 3)
    : i.daysSinceLastHard != null && i.daysSinceLastHard >= 3;
  if (dueForQuality) {
    const gap = i.daysSinceLastHard == null ? "a while" : `${i.daysSinceLastHard} days`;
    return make(
      "tempo",
      WORKOUT_TYPE_LABELS.tempo,
      kmRange(i.typicalRunKm),
      "hard",
      [
        loadKnown
          ? `You're fresh (freshness ${freshness}) and it's been ${gap} since a quality session, a good day for a tempo/threshold effort.`
          : `It's been ${gap} since a quality session, so one is due. There isn't enough training history yet to judge your load, so keep it controlled.`,
      ],
      ["Intervals (e.g. 5–6 × 3 min hard)", "Easy run if you're not feeling it"],
      confidence,
      evidence,
    );
  }

  // 6. Long run overdue.
  if (
    i.daysSinceLastLong != null &&
    i.daysSinceLastLong >= 6 &&
    (!loadKnown || i.fatigue.freshness >= 45) &&
    i.longestRunKm > 0
  ) {
    return make(
      "long",
      WORKOUT_TYPE_LABELS.long,
      kmRange(i.longestRunKm * 0.9),
      "moderate",
      [
        `It's been ${i.daysSinceLastLong} days since your last long run, a good day to extend endurance at easy effort.`,
      ],
      ["Easy run if time-limited"],
      confidence,
      evidence,
    );
  }

  // 7. Default: easy aerobic.
  return make(
    "easy",
    "Easy aerobic",
    kmRange(i.typicalRunKm),
    "easy",
    ["A steady easy run keeps aerobic volume up without adding fatigue."],
    ["Recovery run", "Add a few strides if you feel good"],
    confidence,
    evidence,
  );
}

/** Derive the engine input from the analytics bundle. */
export function buildTodaySessionInput(analytics: {
  fatigue: FatigueSnapshot;
  intensityAdvice: IntensityAdvice;
  raceReadiness: RaceReadiness | null;
  workoutLabels: RunWorkoutLabel[];
  weeklyVolume: WeeklyVolume[];
  halfMarathonReadiness: { longestRunKm: number };
}): TodaySessionInput {
  const recent = analytics.weeklyVolume.slice(-4).filter((w) => w.runCount > 0);
  const totalKm = recent.reduce((s, w) => s + w.distanceKm, 0);
  const totalRuns = recent.reduce((s, w) => s + w.runCount, 0);
  const typicalRunKm = totalRuns > 0 ? totalKm / totalRuns : 0;

  const now = new Date();
  const daysSince = (match: (t: WorkoutType) => boolean): number | null => {
    const dates = analytics.workoutLabels
      .filter((l) => match(l.classification.type))
      .map((l) => parseISO(l.date).getTime())
      .filter((t) => !Number.isNaN(t));
    if (dates.length === 0) return null;
    return Math.max(0, differenceInCalendarDays(now, new Date(Math.max(...dates))));
  };

  return {
    fatigue: analytics.fatigue,
    intensityAdvice: analytics.intensityAdvice,
    raceReadiness: analytics.raceReadiness,
    typicalRunKm,
    longestRunKm: analytics.halfMarathonReadiness.longestRunKm,
    daysSinceLastHard: daysSince((t) => HARD_TYPES.has(t)),
    daysSinceLastLong: daysSince((t) => t === "long"),
    runCount: analytics.workoutLabels.length,
  };
}

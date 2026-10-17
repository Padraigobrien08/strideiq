import type { CoachingContext } from "@/lib/coaching-context";
import type { WeeklyPlanGuardrails, WeeklyTrainingPlan, PlannedWorkout } from "./types";

function session(
  partial: Omit<PlannedWorkout, "constraintsApplied" | "reasoning"> & {
    constraintsApplied?: string[];
    reasoning?: string;
  },
): PlannedWorkout {
  return {
    constraintsApplied: partial.constraintsApplied ?? ["Deterministic fallback"],
    reasoning: partial.reasoning ?? "Conservative default session based on current training state.",
    ...partial,
  };
}

/** Planned distances are shown to the athlete, so keep them to one decimal. */
function km(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Below this, calling a session the "long run" overstates it: on a very reduced
 * week the longest run can be shorter than a normal easy run, and labelling that
 * a weekly endurance anchor reads as nonsense.
 */
const LONG_RUN_MIN_KM = 8;

/**
 * The week's longest easy run, named for what it actually is. When volume is
 * capped low the distance no longer earns the "long run" framing, so it becomes
 * the week's longest easy run instead of claiming endurance work it isn't.
 */
function longSession(
  rawKm: number,
  day: string,
  opts?: { longTitle?: string; longPurpose?: string },
): PlannedWorkout {
  const distanceKm = km(rawKm);
  const isLong = distanceKm >= LONG_RUN_MIN_KM;
  return session({
    day,
    modality: "run",
    type: isLong ? "long" : "easy",
    title: isLong ? (opts?.longTitle ?? "Long run") : "Longest easy run",
    distanceKm,
    intensity: "easy",
    purpose: isLong
      ? (opts?.longPurpose ?? "Weekly endurance anchor")
      : "Longest run of a reduced week, kept easy while volume is low",
  });
}

/**
 * Scale planned run distances down to fit the weekly cap.
 *
 * A no-op whenever the plan already fits, which is the common case — the branches that
 * derive their distances from `cap` are untouched. It only binds on the branches with
 * fixed distances (recovery, taper) when the athlete's cap is lower than the template
 * assumed. Proportional rather than truncating, so the shape of the week survives.
 */
function fitRunVolumeToCap(workouts: PlannedWorkout[], cap: number): PlannedWorkout[] {
  if (!Number.isFinite(cap) || cap <= 0) return workouts;

  const total = workouts
    .filter((w) => w.modality === "run")
    .reduce((sum, w) => sum + (w.distanceKm ?? 0), 0);
  if (total <= cap) return workouts;

  const factor = cap / total;
  return workouts.map((w) =>
    w.modality === "run" && w.distanceKm != null
      ? { ...w, distanceKm: km(w.distanceKm * factor) }
      : w,
  );
}

export function buildSafeFallbackWeeklyPlan(
  context: CoachingContext,
  guardrails: WeeklyPlanGuardrails,
): WeeklyTrainingPlan {
  const type = guardrails.planTypeHint;
  const cap = guardrails.maxWeeklyRunKm;
  const evidence = [
    ...guardrails.evidenceUsed,
    ...context.dataQuality.confidenceLimitations.slice(0, 2),
  ].filter(Boolean);

  let workouts: PlannedWorkout[] = [];
  let summary = "";
  let primaryGoal = "Maintain aerobic rhythm without excess fatigue";
  let hardSessionCount = 0;

  if (type === "race_week" || guardrails.raceWeek) {
    hardSessionCount = 1;
    workouts = [
      session({
        day: "Mon",
        modality: "run",
        type: "easy",
        title: "Easy aerobic",
        distanceKm: 5,
        intensity: "easy",
        purpose: "Keep legs loose without fatigue",
      }),
      session({
        day: "Wed",
        modality: "run",
        type: "easy",
        title: "Strides",
        distanceKm: 4,
        durationMin: 30,
        intensity: "easy",
        purpose: "Easy run with 4–6 × 20 sec strides, not a workout",
        constraintsApplied: ["No hard sessions before race: strides only"],
      }),
      session({
        day: "Fri",
        modality: "run",
        type: "shakeout",
        title: "Pre-race shakeout",
        distanceKm: 3,
        intensity: "easy",
        purpose: "Optional easy jog or rest",
      }),
      session({
        day: "Sun",
        modality: "run",
        type: "race",
        title: context.goal?.raceType ?? "Race",
        distanceKm: context.goal
          ? Math.round((context.goal.distanceMeters / 1000) * 10) / 10
          : 21.1,
        intensity: "hard",
        purpose: "Race execution: even pacing, trust the taper",
      }),
    ];
    summary =
      "Race week: minimal volume, one optional sharpener, race on the weekend. Freshness over fitness.";
    primaryGoal = "Arrive fresh and execute race day";
  } else if (type === "recovery" || context.currentState.fatigueState === "fatigued") {
    workouts = [
      session({
        day: "Mon",
        modality: "rest",
        type: "rest",
        title: "Rest",
        intensity: "rest",
        purpose: "Absorb recent load",
      }),
      session({
        day: "Wed",
        modality: "run",
        type: "easy",
        title: "Easy run",
        distanceKm: 6,
        intensity: "easy",
        purpose: "Conversational aerobic",
      }),
      session({
        day: "Fri",
        modality: "mobility",
        type: "mobility",
        title: "Mobility",
        durationMin: 25,
        intensity: "recovery",
        purpose: "Restore range of motion",
      }),
      session({
        day: "Sun",
        modality: "run",
        type: "easy",
        title: "Easy endurance",
        distanceKm: 7,
        intensity: "easy",
        purpose: "Optional easy volume: stop if heavy",
      }),
    ];
    summary = "Recovery week: reduced run volume, extra rest, no hard sessions.";
    primaryGoal = "Restore freshness before building again";
  } else if (type === "taper" || guardrails.taperPhase) {
    hardSessionCount = 1;
    const longKm = Math.min(guardrails.longRunMaxKm, 12);
    workouts = [
      session({
        day: "Mon",
        modality: "run",
        type: "easy",
        title: "Easy aerobic",
        distanceKm: 6,
        intensity: "easy",
        purpose: "Maintain rhythm",
      }),
      session({
        day: "Wed",
        modality: "run",
        type: "tempo",
        title: "Short tempo",
        distanceKm: 5,
        intensity: "moderate",
        purpose: "Brief steady effort, not a full workout",
        constraintsApplied: ["Single quality session"],
      }),
      longSession(longKm, "Sat", {
        longTitle: "Moderate long run",
        longPurpose: "Last longer effort before the race, kept controlled",
      }),
      session({
        day: "Sun",
        modality: "recovery",
        type: "recovery",
        title: "Recovery",
        distanceKm: 4,
        intensity: "recovery",
        purpose: "Flush legs",
      }),
    ];
    summary = `Taper week: volume ~${Math.round(cap)} km cap, one short quality touch, controlled long run.`;
    primaryGoal = "Reduce fatigue while keeping specificity";
  } else if (!context.goal) {
    // Sized from the weekly cap, but no easy run may outgrow the long run, and the long
    // run (per × 1.4) may not pass its own cap. For a high-volume athlete cap / 4 alone
    // gave 46 km easy runs against a 22 km long-run cap, which the validator rejects.
    const per = Math.round(Math.min(cap / 4, guardrails.longRunMaxKm / 1.4) * 10) / 10;
    workouts = [
      session({
        day: "Mon",
        modality: "rest",
        type: "rest",
        title: "Rest or cross-train",
        intensity: "rest",
        purpose: "Recovery from weekend",
      }),
      session({
        day: "Tue",
        modality: "run",
        type: "easy",
        title: "Easy run",
        distanceKm: per,
        intensity: "easy",
        purpose: "Aerobic maintenance",
      }),
      session({
        day: "Thu",
        modality: "run",
        type: "easy",
        title: "Easy run",
        distanceKm: per,
        intensity: "easy",
        purpose: "Volume support",
      }),
      longSession(Math.min(guardrails.longRunMaxKm, per * 1.4), "Sat"),
    ];
    summary = "Maintenance week: steady easy volume, no race-specific sharpening.";
    primaryGoal = "Sustain consistency without a target race";
  } else {
    hardSessionCount = Math.min(2, guardrails.maxHardSessions);
    const longKm = Math.min(guardrails.longRunMaxKm, cap * 0.35);
    // Easy runs keep their 0.22 : 0.35 proportion to the long run once the long run is
    // capped, so they cannot come out longer than it (same failure as the branch above).
    const easyKm = Math.round(Math.min(cap * 0.22, longKm * (0.22 / 0.35)) * 10) / 10;
    workouts = [
      session({
        day: "Mon",
        modality: "run",
        type: "easy",
        title: "Easy run",
        distanceKm: easyKm,
        intensity: "easy",
        purpose: "Start the week relaxed",
      }),
      session({
        day: "Wed",
        modality: "run",
        type: "tempo",
        title: "Steady tempo",
        distanceKm: km(Math.max(5, easyKm)),
        intensity: hardSessionCount > 0 ? "hard" : "moderate",
        purpose: "Controlled quality, not all-out",
      }),
      session({
        day: "Fri",
        modality: "run",
        type: "easy",
        title: "Easy run",
        distanceKm: easyKm,
        intensity: "easy",
        purpose: "Volume between quality days",
      }),
      longSession(longKm, "Sun"),
    ];
    if (context.modalityContext.strengthSummary.includes("strength")) {
      workouts.push(
        session({
          day: "Tue",
          modality: "strength",
          type: "strength",
          title: "Strength support",
          durationMin: 35,
          intensity: "moderate",
          purpose: "Maintain durability: avoid failure sets",
          constraintsApplied: ["Not within 24h of hard run"],
        }),
      );
    }
    summary = `Build week toward ${context.goal.raceType}: modest progression within ${cap} km cap.`;
    primaryGoal = `Progress toward ${context.goal.raceType} on ${context.goal.raceDate ?? "goal date"}`;
  }

  // The recovery and taper branches prescribe fixed distances (6 km, 7 km, and so
  // on) that were chosen for a typical athlete and take no notice of `cap`. For a
  // low-volume athlete — `lowData` and `taper` fixtures both sit near 12 km — that
  // overshoots the weekly cap, and `validateWeeklyPlan` then rejects the result with
  // severity "error". A fallback its own validator refuses is the one thing this
  // generator must never produce: it is what an athlete gets when the LLM has already
  // failed, so there is nothing further to fall back to.
  //
  // Race week is exempt. The race distance is not ours to shrink.
  if (!(type === "race_week" || guardrails.raceWeek)) {
    workouts = fitRunVolumeToCap(workouts, cap);
  }

  const totalRunDistanceKm =
    Math.round(
      workouts.filter((w) => w.modality === "run").reduce((s, w) => s + (w.distanceKm ?? 0), 0) *
        10,
    ) / 10;

  hardSessionCount = workouts.filter((w) => w.modality === "run" && w.intensity === "hard").length;

  return {
    weekStart: guardrails.weekStart,
    planType: type,
    summary,
    totalRunDistanceKm,
    hardSessionCount,
    workouts,
    rationale: {
      primaryGoal,
      evidenceUsed: evidence.length ? evidence : ["Limited data: conservative template"],
      tradeoffs: ["Deterministic plan used when LLM output is unavailable or invalid"],
      risksManaged: guardrails.constraintNotes.slice(0, 4),
    },
    confidence: context.dataQuality.hrCoverage === "high" ? "medium" : "low",
    limitations: [
      "This is a rule-based fallback plan, not a personalized LLM synthesis.",
      "Adjust sessions based on how you feel, not medical advice.",
      ...context.dataQuality.confidenceLimitations.slice(0, 2),
    ],
  };
}

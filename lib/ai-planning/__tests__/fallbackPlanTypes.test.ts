import { describe, expect, it } from "vitest";
import { buildSafeFallbackWeeklyPlan } from "../buildSafeFallbackWeeklyPlan";
import { computeWeeklyPlanGuardrails } from "../weeklyPlanGuardrails";
import { validateWeeklyPlan } from "../validateWeeklyPlan";
import { contexts } from "./fixtures";
import type { WeeklyPlanGuardrails, WeeklyPlanType } from "../types";

/**
 * The deterministic fallback, across every plan type it can be asked for.
 *
 * The audit called the fallback ladder the durable protection around the LLM: the
 * denylists and repair passes catch what they recognise, and this is what the athlete
 * gets when none of that works. So it is the one plan generator that must never
 * produce something the app would refuse — which is the strongest property here, and
 * the one nothing previously checked: **the fallback is run through the app's own
 * validator**, not merely inspected.
 *
 * A fallback that fails validation would leave a failed generation with nothing to
 * fall back to.
 */

const PLAN_TYPES: WeeklyPlanType[] = ["build", "maintain", "taper", "recovery", "race_week"];

function guardrailsFor(
  context: ReturnType<typeof contexts.noGoal>,
  overrides: Partial<WeeklyPlanGuardrails> = {},
) {
  return { ...computeWeeklyPlanGuardrails(context), ...overrides };
}

const runKm = (plan: { workouts: { modality: string; distanceKm?: number }[] }) =>
  plan.workouts
    .filter((w) => w.modality === "run")
    .reduce((sum, w) => sum + (w.distanceKm ?? 0), 0);

describe("every plan type produces a usable week", () => {
  it.each(PLAN_TYPES)("%s builds a plan", (planTypeHint) => {
    const context = contexts.noGoal();
    const plan = buildSafeFallbackWeeklyPlan(context, guardrailsFor(context, { planTypeHint }));

    expect(plan.workouts.length).toBeGreaterThan(0);
    expect(plan.summary.length).toBeGreaterThan(0);
    expect(plan.rationale.primaryGoal.length).toBeGreaterThan(0);
  });

  /**
   * The property that matters most. If the deterministic plan cannot pass the same
   * validator the LLM's output must pass, then a failed generation has nothing to fall
   * back to and the athlete gets an error instead of a week.
   */
  it.each(PLAN_TYPES.filter((t) => t !== "race_week"))(
    "%s passes the app's own validator",
    (planTypeHint) => {
      const context = contexts.noGoal();
      const guardrails = guardrailsFor(context, { planTypeHint });
      const plan = buildSafeFallbackWeeklyPlan(context, guardrails);

      const blocking = validateWeeklyPlan(plan, context, guardrails).issues.filter(
        (i) => i.severity === "error",
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    },
  );

  /**
   * Every real fixture with its own unmodified guardrails. This is the assertion that
   * found the defect: `lowData`, `taper` and `missingHr` all sit near a 12 km cap, and
   * the recovery/taper branches prescribed fixed 6–7 km runs that overshot it, so the
   * fallback produced a week its own validator rejected.
   *
   * Forcing a hint onto a mismatched context (my first attempt) manufactured failures
   * that no athlete could reach; these are the combinations the app actually builds.
   */
  it.each(Object.keys(contexts))("%s: the real context validates cleanly", (name) => {
    const context = (contexts as Record<string, () => ReturnType<typeof contexts.noGoal>>)[name]();
    const guardrails = computeWeeklyPlanGuardrails(context);
    const plan = buildSafeFallbackWeeklyPlan(context, guardrails);

    const blocking = validateWeeklyPlan(plan, context, guardrails).issues.filter(
      (i) => i.severity === "error",
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  it.each(PLAN_TYPES)("%s explains every session it prescribes", (planTypeHint) => {
    const context = contexts.noGoal();
    const plan = buildSafeFallbackWeeklyPlan(context, guardrailsFor(context, { planTypeHint }));

    for (const w of plan.workouts) {
      expect(w.reasoning.length, `${w.title} has no reasoning`).toBeGreaterThan(0);
      expect(w.purpose.length, `${w.title} has no purpose`).toBeGreaterThan(0);
      expect(w.constraintsApplied.length).toBeGreaterThan(0);
    }
  });
});

describe("respecting the guardrails it was given", () => {
  /**
   * Race week is deliberately exempt: the race distance is fixed, so a half marathon
   * cannot be shrunk to fit a 30 km cap. Every other type stays inside it.
   */
  it.each(PLAN_TYPES.filter((t) => t !== "race_week"))(
    "%s stays within the weekly volume cap",
    (planTypeHint) => {
      const context = contexts.noGoal();
      const guardrails = guardrailsFor(context, { planTypeHint, maxWeeklyRunKm: 30 });
      expect(runKm(buildSafeFallbackWeeklyPlan(context, guardrails))).toBeLessThanOrEqual(30);
    },
  );

  it("lets race week exceed the cap, because the race distance is not negotiable", () => {
    const context = contexts.raceWeek();
    const guardrails = guardrailsFor(context, {
      planTypeHint: "race_week",
      raceWeek: true,
      maxWeeklyRunKm: 30,
    });
    expect(runKm(buildSafeFallbackWeeklyPlan(context, guardrails))).toBeGreaterThan(30);
  });

  it.each(PLAN_TYPES)("%s stays within the hard-session cap", (planTypeHint) => {
    const context = contexts.noGoal();
    const guardrails = guardrailsFor(context, { planTypeHint, maxHardSessions: 1 });
    const plan = buildSafeFallbackWeeklyPlan(context, guardrails);
    expect(plan.hardSessionCount).toBeLessThanOrEqual(1);
  });

  /**
   * The recovery and taper branches prescribe fixed distances chosen for a typical
   * athlete. They now scale down when the cap is lower than the template assumed,
   * because a low-volume athlete was otherwise handed a week that overshot their cap
   * and that `validateWeeklyPlan` rejected outright.
   *
   * A no-op when the cap is generous: the plan an ordinary athlete gets is unchanged.
   */
  it("scales fixed recovery distances down to a tight cap", () => {
    const context = contexts.noGoal();
    const tight = buildSafeFallbackWeeklyPlan(
      context,
      guardrailsFor(context, { planTypeHint: "recovery", maxWeeklyRunKm: 10 }),
    );
    expect(runKm(tight)).toBeLessThanOrEqual(10);
  });

  it("leaves the plan alone when the cap is generous", () => {
    const context = contexts.noGoal();
    const loose = buildSafeFallbackWeeklyPlan(
      context,
      guardrailsFor(context, { planTypeHint: "recovery", maxWeeklyRunKm: 60 }),
    );
    // The template's own distances, untouched.
    expect(runKm(loose)).toBe(13);
  });

  it("keeps the shape of the week when it scales", () => {
    const context = contexts.noGoal();
    const tight = buildSafeFallbackWeeklyPlan(
      context,
      guardrailsFor(context, { planTypeHint: "recovery", maxWeeklyRunKm: 10 }),
    );
    const runs = tight.workouts.filter((w) => w.modality === "run");
    expect(runs).toHaveLength(2);
    expect(runs.every((w) => (w.distanceKm ?? 0) > 0)).toBe(true);
  });

  it("reports its own hard-session count honestly", () => {
    const context = contexts.noGoal();
    for (const planTypeHint of PLAN_TYPES) {
      const plan = buildSafeFallbackWeeklyPlan(context, guardrailsFor(context, { planTypeHint }));
      const actualHard = plan.workouts.filter((w) => w.intensity === "hard").length;
      expect(plan.hardSessionCount, `${planTypeHint} miscounts hard sessions`).toBe(actualHard);
    }
  });
});

describe("recovery and taper hold back", () => {
  it("prescribes no hard running in a recovery week", () => {
    const context = contexts.noGoal();
    const plan = buildSafeFallbackWeeklyPlan(
      context,
      guardrailsFor(context, { planTypeHint: "recovery" }),
    );
    expect(plan.workouts.filter((w) => w.intensity === "hard")).toEqual([]);
  });

  /**
   * Fatigue outranks the hint. A fatigued athlete gets the recovery week whatever the
   * caller asked for — including "build" — because the branch order puts the fatigue
   * check above every type except race week. That is the safety-first reading, and
   * worth pinning: it is the behaviour someone would most likely "fix" by accident
   * while making the hint authoritative.
   */
  it("gives a fatigued athlete a recovery week even when asked to build", () => {
    // Fatigued with the history to show it. `noGoal` (12 days) once stood in here but
    // only read as fatigued because the averages started from zero, and `overloaded`
    // (9 days) is now, correctly, not enough evidence for a load-based recovery week.
    const context = contexts.fatigueHeavy();
    expect(context.currentState.fatigueState).toBe("fatigued");

    const build = buildSafeFallbackWeeklyPlan(
      context,
      guardrailsFor(context, { planTypeHint: "build" }),
    );
    expect(build.summary).toMatch(/recovery/i);
    expect(build.workouts.filter((w) => w.intensity === "hard")).toEqual([]);
  });
});

describe("race week", () => {
  const raceContext = () => contexts.raceWeek();

  it("puts the race in the week", () => {
    const context = raceContext();
    const plan = buildSafeFallbackWeeklyPlan(
      context,
      guardrailsFor(context, { planTypeHint: "race_week", raceWeek: true }),
    );
    expect(plan.workouts.some((w) => w.type === "race")).toBe(true);
  });

  // Anything hard in the days before a race costs more than it gains, so the only
  // hard effort in the week should be the race itself.
  it("schedules no hard session other than the race", () => {
    const context = raceContext();
    const plan = buildSafeFallbackWeeklyPlan(
      context,
      guardrailsFor(context, { planTypeHint: "race_week", raceWeek: true }),
    );
    const hard = plan.workouts.filter((w) => w.intensity === "hard");
    expect(hard.every((w) => w.type === "race")).toBe(true);
  });

  it("uses the goal's own distance for the race", () => {
    const context = raceContext();
    const plan = buildSafeFallbackWeeklyPlan(
      context,
      guardrailsFor(context, { planTypeHint: "race_week", raceWeek: true }),
    );
    const race = plan.workouts.find((w) => w.type === "race");
    expect(race?.distanceKm).toBeGreaterThan(0);
  });

  it("treats the raceWeek flag as decisive, whatever the hint says", () => {
    const context = raceContext();
    const plan = buildSafeFallbackWeeklyPlan(
      context,
      guardrailsFor(context, { planTypeHint: "build", raceWeek: true }),
    );
    expect(plan.workouts.some((w) => w.type === "race")).toBe(true);
  });
});

describe("thin data", () => {
  // The fallback exists for exactly this athlete: too little history for the LLM to
  // say anything useful, so it must still produce a week rather than nothing.
  it("still builds a week for an athlete with almost no history", () => {
    const context = contexts.lowData();
    const guardrails = computeWeeklyPlanGuardrails(context);
    const plan = buildSafeFallbackWeeklyPlan(context, guardrails);

    expect(plan.workouts.length).toBeGreaterThan(0);
    const blocking = validateWeeklyPlan(plan, context, guardrails).issues.filter(
      (i) => i.severity === "error",
    );
    expect(blocking).toEqual([]);
  });

  it("admits its limitations rather than projecting confidence", () => {
    const context = contexts.lowData();
    const plan = buildSafeFallbackWeeklyPlan(context, computeWeeklyPlanGuardrails(context));
    expect(plan.confidence).not.toBe("high");
  });
});

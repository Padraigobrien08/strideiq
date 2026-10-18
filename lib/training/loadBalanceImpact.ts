import type { FatigueSnapshot } from "@/lib/analytics/fatigue";
import {
  buildTodaySessionInput,
  recommendTodaySession,
  type TodaySessionKind,
  type TodaySessionInput,
} from "./todaySession";

/**
 * Did the training load balance change today's recommendation?
 *
 * The UI overhaul's rule (SPEC §6.7): show readiness/load only when it materially
 * changes today's session, saying what changed, the evidence, and what is recommended
 * now. This answers the first half for every surface, from one place.
 *
 * It is a counterfactual, not a list of rule names: today's session is recommended
 * twice, once as normal and once with the balance taken out — the same path an athlete
 * without enough load history takes (`loadEvidence.sufficient = false`), so "without
 * load" means exactly what the engine already does when it cannot trust the number. If
 * the session kind differs, the balance mattered. That keeps this correct as rules are
 * added or reordered, which a hand-kept list of "load-driven" branches would not.
 */

export interface TodayLoadImpact {
  /** True when the balance changed today's session kind. */
  affects: boolean;
  /** Today's session as recommended. */
  actual: TodaySessionKind;
  /** What it would have been with the balance left out. */
  withoutLoad: TodaySessionKind;
  /**
   * `held_back`: the balance made today easier (e.g. recovery instead of tempo).
   * `unlocked`: it made a harder session possible. `null` when it did not matter.
   */
  direction: "held_back" | "unlocked" | null;
  /** Evidence lines for the warning; empty when it did not matter. */
  evidence: string[];
}

/** Rough demand of each session kind, to tell holding back from unlocking. */
const DEMAND: Record<TodaySessionKind, number> = {
  rest: 0,
  recovery: 1,
  easy: 2,
  long: 3,
  tempo: 4,
  interval: 4,
};

function withoutBalance(fatigue: FatigueSnapshot): FatigueSnapshot {
  return { ...fatigue, loadEvidence: { ...fatigue.loadEvidence, sufficient: false } };
}

export function loadImpactFor(input: TodaySessionInput): TodayLoadImpact {
  const actual = recommendTodaySession(input).kind;
  const withoutLoad = recommendTodaySession({
    ...input,
    fatigue: withoutBalance(input.fatigue),
  }).kind;

  // Nothing to attribute when the balance was not used in the first place.
  if (!input.fatigue.loadEvidence.sufficient || actual === withoutLoad) {
    return { affects: false, actual, withoutLoad, direction: null, evidence: [] };
  }

  const f = input.fatigue;
  const form = `${f.formPct > 0 ? "+" : ""}${Math.round(f.formPct)}%`;
  return {
    affects: true,
    actual,
    withoutLoad,
    direction: DEMAND[actual] < DEMAND[withoutLoad] ? "held_back" : "unlocked",
    evidence: [
      `Training load balance ${form} of chronic load (${f.label}).`,
      `Acute load ${f.atl} against chronic load ${f.ctl}.`,
      ...(f.loadEvidence.confidence === "low" ? f.loadEvidence.reasons.slice(0, 1) : []),
    ],
  };
}

/** `loadImpactFor` from the analytics bundle, the shape every caller already has. */
export function todayLoadImpact(
  analytics: Parameters<typeof buildTodaySessionInput>[0],
): TodayLoadImpact {
  return loadImpactFor(buildTodaySessionInput(analytics));
}

import { describe, expect, it } from "vitest";
import { MIN_LOAD_HISTORY_DAYS, MIN_LOAD_RUNS, assessLoadEvidence } from "../fatigue";
import { resolveLoadModel } from "../loadModel";
import { insightsFrom, mkRun } from "@/lib/coaching-context/__tests__/fixtures";
import { buildTodaySessionInput, recommendTodaySession } from "@/lib/training/todaySession";
import { buildAthleteStateSummary } from "@/lib/coaching-context/buildAthleteStateSummary";
import { buildRaceForecastInput } from "@/lib/forecasting-v2";
import { assessFreshness } from "@/lib/forecasting-v2/freshnessModel";
import type { RunActivity } from "@/lib/strava/types";

/** Every-other-day runs ending `endDaysAgo`, spanning `spanDays`. */
function history(spanDays: number, endDaysAgo = 1, extra: Partial<RunActivity> = {}) {
  const runs: RunActivity[] = [];
  for (let d = endDaysAgo; d <= spanDays + endDaysAgo; d += 2) {
    runs.push({ ...mkRun(d, { id: `h${d}` }), relativeEffort: 60, ...extra });
  }
  return runs;
}

const evidenceOf = (runs: RunActivity[]) => assessLoadEvidence(runs, resolveLoadModel(runs));

describe("assessLoadEvidence", () => {
  it(`needs ${MIN_LOAD_HISTORY_DAYS} days of history`, () => {
    expect(evidenceOf(history(MIN_LOAD_HISTORY_DAYS - 3)).sufficient).toBe(false);
    expect(evidenceOf(history(MIN_LOAD_HISTORY_DAYS)).sufficient).toBe(true);
  });

  it(`needs at least ${MIN_LOAD_RUNS} runs, however long the span`, () => {
    const sparse = [mkRun(60), mkRun(30), mkRun(2)];
    const e = evidenceOf(sparse);
    expect(e.historyDays).toBeGreaterThanOrEqual(MIN_LOAD_HISTORY_DAYS);
    expect(e.sufficient).toBe(false);
    expect(e.reasons.join(" ")).toMatch(/only 3 runs/i);
  });

  it("is low confidence when intensity is not counted", () => {
    const e = evidenceOf(history(100, 1, { relativeEffort: null, trainingLoad: null }));
    expect(e.sufficient).toBe(true);
    expect(e.confidence).toBe("low");
    expect(e.reasons.join(" ")).toMatch(/distance only/i);
  });

  it("is medium under twelve weeks and high after", () => {
    expect(evidenceOf(history(50)).confidence).toBe("medium");
    expect(evidenceOf(history(100)).confidence).toBe("high");
  });

  it("is insufficient with no runs at all", () => {
    expect(evidenceOf([])).toMatchObject({ sufficient: false, historyDays: 0, runCount: 0 });
  });
});

/** Ten days of history ending in a very heavy few days: a deep negative balance. */
function shortAndSpiky(): RunActivity[] {
  return [
    ...[10, 9, 8].map((d) => ({ ...mkRun(d, { id: `e${d}` }), relativeEffort: 30 })),
    ...[4, 3, 2, 1].map((d) => ({
      ...mkRun(d, { distanceM: 25_000, id: `s${d}` }),
      relativeEffort: 250,
    })),
  ];
}

describe("decisions do not act on a balance without evidence", () => {
  it("Today does not force recovery from a short history's balance", () => {
    const { analytics } = insightsFrom(shortAndSpiky());
    expect(analytics.fatigue.loadEvidence.sufficient).toBe(false);
    // Either arm of Today's deep-fatigue rule would have forced recovery.
    expect(analytics.fatigue.freshness < 30 || analytics.fatigue.formPct < -34).toBe(true);
    const today = recommendTodaySession(buildTodaySessionInput(analytics));
    expect(today.kind).not.toBe("recovery");
    expect(today.evidence.join(" ")).toMatch(/not enough load history/i);
  });

  it("Today only unlocks quality on schedule when quality sessions are on record", () => {
    const { analytics } = insightsFrom(history(14));
    expect(analytics.fatigue.loadEvidence.sufficient).toBe(false);
    const input = buildTodaySessionInput(analytics);

    const none = recommendTodaySession({ ...input, daysSinceLastHard: null, daysSinceLastLong: 2 });
    expect(none.kind).not.toBe("tempo");

    const due = recommendTodaySession({
      ...input,
      // Isolate the load rule: intensity balance has its own, separate rule.
      intensityAdvice: { ...input.intensityAdvice, status: "balanced" },
      daysSinceLastHard: 4,
    });
    expect(due.kind).toBe("tempo");
    expect(due.rationale.join(" ")).not.toMatch(/freshness/i);
    expect(due.rationale.join(" ")).toMatch(/enough training history/i);
  });

  it("gives the planner and the LLM no freshness number and an unknown state", () => {
    const state = buildAthleteStateSummary(insightsFrom(shortAndSpiky()).analytics);
    expect(state.freshness).toBeUndefined();
    expect(state.fatigueState).toBe("unknown");
    expect(state.stateSummary).toMatch(/not enough training history/i);
  });

  it("keeps the forecast's freshness modifier neutral", () => {
    const { analytics, runs } = insightsFrom(shortAndSpiky());
    const input = buildRaceForecastInput({ analytics, runs, goal: null, fallbackDistance: "hm" })!;
    expect(input.athleteContext?.freshnessScore).toBeUndefined();
    const fresh = assessFreshness(input);
    // The load-balance arms are silent: no fatigue charge or risk. (Other rules, like
    // hard-session density, still apply and may move the score and time.)
    expect(fresh.risks.join(" ")).not.toMatch(/elevated fatigue|fatigue balance strained/i);
    expect(fresh.evidence.join(" ")).toMatch(/not enough training history/i);
    expect(fresh.evidence.join(" ")).not.toMatch(/acute load may outweigh/i);
  });

  it("still acts on the balance once the history is there", () => {
    const { analytics } = insightsFrom(history(60));
    expect(analytics.fatigue.loadEvidence.sufficient).toBe(true);
    expect(buildAthleteStateSummary(analytics).freshness).toBe(
      Math.round(analytics.fatigue.freshness),
    );
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildWeekTelemetry,
  formatPlanTimestamp,
  goalContextLabel,
  planPhaseLabel,
  sessionExplainability,
} from "../planWorkspaceView";
import { calendarWeekFixture, WEEK_START } from "@/test/plan-fixtures";
import type { TrainingCalendarWeek } from "@/lib/training-calendar";

/**
 * The read model behind the plan page: what the week is called, what today is, and
 * what the app claims it knows.
 *
 * The telemetry numbers are the interesting part. They are the summary an athlete
 * reads before deciding whether to run, so a volume figure that quietly counts a
 * skipped session — or a hard-session count that misses one — is a wrong answer
 * presented with the same confidence as a right one.
 */

// Pinned to the Wednesday of the fixed fixture week (see test/time-travel.ts for why
// this matters).
const INSIDE_THE_WEEK = "2026-03-11T09:00:00.000Z";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(INSIDE_THE_WEEK));
});
afterAll(() => vi.useRealTimers());

const week = () => calendarWeekFixture();

describe("planPhaseLabel", () => {
  it("names an unspecified plan rather than showing a blank", () => {
    expect(planPhaseLabel(undefined)).toBe("Adaptive week");
  });

  it("humanises an unmapped plan type instead of leaking the enum", () => {
    expect(planPhaseLabel("race_week")).not.toContain("_");
  });

  it("maps a known plan type", () => {
    expect(planPhaseLabel("build")).toBeTruthy();
  });
});

describe("goalContextLabel", () => {
  it("says nothing when there is no goal and no readiness", () => {
    expect(goalContextLabel(null, null)).toBeNull();
  });

  // Readiness wins because it carries the countdown, which is the actionable half.
  it("prefers readiness, which knows how many days are left", () => {
    const analytics = {
      raceReadiness: { distanceLabel: "Half marathon", daysUntilRace: 21 },
    } as never;
    expect(goalContextLabel(null, analytics)).toBe("Half marathon · 21 days out");
  });

  it.each([
    ["hm", "Half marathon goal"],
    ["marathon", "Marathon goal"],
    ["5k", "Race goal set"],
  ])("falls back to naming the %s goal without readiness", (distance, expected) => {
    expect(goalContextLabel({ distance, date: "2026-10-01" } as never, null)).toBe(expected);
  });
});

describe("week telemetry", () => {
  it("totals the planned running volume", () => {
    // The fixture is an 8 km easy run and a 10 km tempo.
    expect(buildWeekTelemetry(week(), null).volumeKm).toBe(18);
  });

  /**
   * A skipped session did not happen, so counting its distance would inflate the
   * number an athlete uses to judge their week.
   */
  it("excludes a skipped session from volume", () => {
    const w = week();
    const withSkip: TrainingCalendarWeek = {
      ...w,
      workouts: w.workouts.map((x) => (x.distanceKm === 8 ? { ...x, status: "skipped" } : x)),
    };
    expect(buildWeekTelemetry(withSkip, null).volumeKm).toBe(10);
  });

  it("counts the hard sessions", () => {
    expect(buildWeekTelemetry(week(), null).hardSessions).toBe(1);
  });

  it("reports no volume rather than zero when nothing is planned", () => {
    expect(buildWeekTelemetry(calendarWeekFixture([]), null).volumeKm).toBeNull();
  });

  it("does not invent a load balance without analytics", () => {
    expect(buildWeekTelemetry(week(), null).loadBalance).toBe("—");
  });

  // The telemetry card used to show the 0–100 freshness score under its old name; it
  // now reads like the rest of the app (load-balance phases 1b–3a).
  it("shows load balance as form % of chronic load with its band", () => {
    const analytics = {
      fatigue: { formPct: 6.4, label: "Neutral", loadEvidence: { sufficient: true } },
      halfMarathonReadiness: { score: 70 },
      intensityAdvice: { status: "ok" },
    } as never;
    expect(buildWeekTelemetry(week(), analytics).loadBalance).toBe("+6% · Neutral");
  });

  it("says when there is not enough load history to judge", () => {
    const analytics = {
      fatigue: { formPct: -30, label: "Fatigued", loadEvidence: { sufficient: false } },
      halfMarathonReadiness: { score: 70 },
      intensityAdvice: { status: "ok" },
    } as never;
    expect(buildWeekTelemetry(week(), analytics).loadBalance).toBe("Not enough evidence");
  });

  it("reads confidence as prose, not as an enum", () => {
    expect(buildWeekTelemetry(week(), null).confidence).not.toContain("_");
  });
});

describe("session explainability", () => {
  it("explains each session in the athlete's terms", () => {
    const lines = sessionExplainability(week());
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatch(/:/);
  });

  it("skips rest days, which need no justification", () => {
    expect(sessionExplainability(week()).some((l) => /^Rest/i.test(l))).toBe(false);
  });

  // A one-word purpose is not an explanation; showing it would be worse than the
  // week summary it falls back to.
  it("falls back to the week summary when no session explains itself", () => {
    const w = week();
    const terse: TrainingCalendarWeek = {
      ...w,
      summary: "Steady build week",
      workouts: w.workouts.map((x) => ({ ...x, reasoning: "ok", purpose: "ok" })),
    };
    expect(sessionExplainability(terse)).toEqual(["Steady build week"]);
  });

  it("caps the list so it cannot become the page", () => {
    expect(sessionExplainability(week()).length).toBeLessThanOrEqual(6);
  });
});

describe("formatPlanTimestamp", () => {
  it("formats a real timestamp for reading", () => {
    expect(formatPlanTimestamp(`${WEEK_START}T14:30:00.000Z`)).toMatch(/Mar/);
  });

  // Returning the raw string beats throwing inside a render.
  it("returns the input unchanged when it cannot be parsed", () => {
    expect(formatPlanTimestamp("not-a-timestamp")).toBe("not-a-timestamp");
  });
});

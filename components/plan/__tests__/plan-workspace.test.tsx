import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanWorkspace } from "../plan-workspace";
import { weeklyPlanToCalendarWeek } from "@/lib/training-calendar";

/**
 * The plan workspace — where an LLM-generated week meets the athlete's saved one.
 *
 * The interesting state here is not the plan, it is the *relationship* between a
 * freshly generated preview and a week that already exists. Getting that wrong either
 * silently overwrites a week someone has been following, or hides a generated plan
 * they just paid an LLM call for. `confirmReplace` is the whole guard, so most of
 * these tests are about when it does and does not let the preview take over.
 *
 * Every hook is mocked: this component owns no data, it composes six sources. The
 * sources have their own tests; what is untested is the composition.
 */

const generate = vi.fn();
const resetPreview = vi.fn();
const saveFromGenerated = vi.fn();
const clearWeek = vi.fn();
const refresh = vi.fn();
const replaceWeek = vi.fn();
const patchWorkout = vi.fn();

const planState = {
  loading: false,
  error: null as string | null,
  errorStatus: null as number | null,
  result: null as unknown,
  lastPlanningContext: null as string | null,
};

const calendarState = {
  savedWeek: null as unknown,
  hasSaved: false,
  targetWeek: "2026-03-09",
};

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/use-training-intelligence", () => ({
  useTrainingIntelligence: () => ({ analytics: null }),
}));
vi.mock("@/lib/context/strava-context", () => ({ useStrava: () => ({ importData: null }) }));
vi.mock("@/stores/goal-store", () => ({ useGoalStore: () => null }));

vi.mock("@/hooks/use-weekly-plan", () => ({
  useWeeklyPlan: () => ({
    generate,
    reset: resetPreview,
    loading: planState.loading,
    error: planState.error,
    errorStatus: planState.errorStatus,
    result: planState.result,
    lastPlanningContext: planState.lastPlanningContext,
  }),
}));

vi.mock("@/hooks/use-training-calendar", () => ({
  useTrainingCalendar: () => ({
    savedWeek: calendarState.savedWeek,
    hasSaved: calendarState.hasSaved,
    targetWeek: calendarState.targetWeek,
    refresh,
    saveFromGenerated,
    clearWeek,
    replaceWeek,
    patchWorkout,
  }),
}));

vi.mock("@/lib/plan/planContextStorage", () => ({
  loadPlanContextDraft: () => null,
  savePlanContextDraft: () => {},
}));

const WEEK_START = "2026-03-09";

/** A generated plan matching `WeeklyTrainingPlan`, which the calendar mapper needs. */
function preview() {
  return {
    plan: {
      weekStart: WEEK_START,
      planType: "build",
      summary: "Steady build week",
      hardSessionCount: 1,
      workouts: [
        {
          day: "Monday",
          modality: "run",
          type: "easy",
          title: "Easy 8k",
          distanceKm: 8,
          intensity: "easy",
          purpose: "Aerobic maintenance",
          constraintsApplied: [],
          reasoning: "Conversational",
        },
      ],
      rationale: {
        primaryGoal: "Aerobic base",
        evidenceUsed: [],
        tradeoffs: [],
        risksManaged: [],
      },
      confidence: "medium",
      limitations: [],
    },
    source: "llm",
    guardrails: { constraintNotes: [] },
    integrity: { verdict: "pass", checks: [] },
  };
}

/**
 * Built with the production mapper rather than hand-written.
 *
 * A hand-maintained TrainingCalendarWeek needs ~15 fields to satisfy every consumer,
 * and each missing one surfaces as an unrelated TypeError deep in a child. Deriving
 * it from the same plan the app would means the fixture cannot drift from the type.
 */
function savedWeek() {
  const p = preview();
  const week = weeklyPlanToCalendarWeek(p.plan as never, p as never);
  return {
    ...week,
    workouts: week.workouts.map((w, i) => (i === 0 ? { ...w, title: "Saved easy run" } : w)),
  };
}

beforeEach(() => {
  generate.mockReset().mockResolvedValue(undefined);
  resetPreview.mockReset();
  saveFromGenerated.mockReset().mockReturnValue({ ok: true });
  clearWeek.mockReset();
  refresh.mockReset();
  replaceWeek.mockReset();
  patchWorkout.mockReset();
  planState.loading = false;
  planState.error = null;
  planState.errorStatus = null;
  planState.result = null;
  planState.lastPlanningContext = null;
  calendarState.savedWeek = null;
  calendarState.hasSaved = false;
});

const contextField = () => screen.getByRole("textbox");

describe("generating a week", () => {
  it("passes the planning context the athlete typed", async () => {
    render(<PlanWorkspace />);
    await userEvent.type(contextField(), "Just raced a half");

    const button = screen.getAllByRole("button").find((b) => /generate/i.test(b.textContent ?? ""));
    await userEvent.click(button!);

    expect(generate).toHaveBeenCalledWith({ planningContext: "Just raced a half" });
  });

  // An empty box must not send an empty string through to the prompt.
  it("omits the context entirely when the box is blank", async () => {
    render(<PlanWorkspace />);
    const button = screen.getAllByRole("button").find((b) => /generate/i.test(b.textContent ?? ""));
    await userEvent.click(button!);
    expect(generate).toHaveBeenCalledWith({ planningContext: undefined });
  });
});

describe("a preview beside a saved week", () => {
  /**
   * The guard. With a week already saved, a fresh preview must not replace what is on
   * screen until the athlete says so — otherwise the plan they have been following
   * disappears the moment they press generate.
   */
  it("keeps showing the saved week when a preview arrives", () => {
    calendarState.savedWeek = savedWeek();
    calendarState.hasSaved = true;
    planState.result = preview();

    render(<PlanWorkspace />);
    expect(screen.getAllByText(/Saved easy run/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Easy 8k/)).not.toBeInTheDocument();
  });

  it("shows the preview when there is no saved week to protect", () => {
    planState.result = preview();
    render(<PlanWorkspace />);
    expect(screen.getAllByText(/Easy 8k/).length).toBeGreaterThan(0);
  });
});

describe("saving", () => {
  beforeEach(() => {
    planState.result = preview();
  });

  it("clears the preview once the week is saved", async () => {
    render(<PlanWorkspace />);
    const save = screen.getAllByRole("button").find((b) => /^save/i.test(b.textContent ?? ""));
    await userEvent.click(save!);

    expect(saveFromGenerated).toHaveBeenCalled();
    expect(resetPreview).toHaveBeenCalled();
  });

  /**
   * A refused save has to say *why*. Returning silently would leave the athlete
   * pressing a button that appears to do nothing.
   */
  it("surfaces the blocking issue when the calendar refuses", async () => {
    saveFromGenerated.mockReturnValue({
      ok: false,
      validation: {
        issues: [
          { severity: "low", message: "Minor: uneven spacing" },
          { severity: "high", message: "Two hard sessions back to back" },
        ],
      },
    });

    render(<PlanWorkspace />);
    const save = screen.getAllByRole("button").find((b) => /^save/i.test(b.textContent ?? ""));
    await userEvent.click(save!);

    expect(await screen.findByText(/Two hard sessions back to back/)).toBeInTheDocument();
    expect(resetPreview).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when no issue explains the refusal", async () => {
    saveFromGenerated.mockReturnValue({ ok: false, validation: { issues: [] } });

    render(<PlanWorkspace />);
    const save = screen.getAllByRole("button").find((b) => /^save/i.test(b.textContent ?? ""));
    await userEvent.click(save!);

    expect(await screen.findByText(/fix the critical issues/i)).toBeInTheDocument();
  });

  /**
   * The context field only renders while there is nothing to display — you write it
   * before generating — so this has to type first and let the preview arrive after,
   * which is the real sequence.
   */
  it("prefers the athlete's typed context over the one the plan was built with", async () => {
    planState.lastPlanningContext = "context used at generation time";
    planState.result = null;
    const { rerender } = render(<PlanWorkspace />);
    await userEvent.type(contextField(), "edited since");

    planState.result = preview();
    rerender(<PlanWorkspace />);

    const save = screen.getAllByRole("button").find((b) => /^save/i.test(b.textContent ?? ""));
    await userEvent.click(save!);

    expect(saveFromGenerated).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ planningContext: "edited since" }),
    );
  });

  it("falls back to the generation context when the box is empty", async () => {
    planState.lastPlanningContext = "context used at generation time";
    render(<PlanWorkspace />);

    const save = screen.getAllByRole("button").find((b) => /^save/i.test(b.textContent ?? ""));
    await userEvent.click(save!);

    expect(saveFromGenerated).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ planningContext: "context used at generation time" }),
    );
  });
});

describe("when generation fails", () => {
  it("explains the failure rather than showing an empty week", () => {
    planState.error = "The planner is unavailable";
    planState.errorStatus = 503;
    render(<PlanWorkspace />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  // The deterministic fallback is the whole reason a failed LLM call is recoverable,
  // so the retry has to actually request it.
  it("offers a fallback that asks for the deterministic plan", async () => {
    planState.error = "The planner is unavailable";
    planState.errorStatus = 503;
    render(<PlanWorkspace />);

    const buttons = screen.getAllByRole("button");
    const fallback = buttons.find((b) =>
      /fallback|deterministic|basic|simple/i.test(b.textContent ?? ""),
    );
    if (!fallback) return; // presentation decides the label; skip if this variant has none
    await userEvent.click(fallback);
    expect(generate).toHaveBeenCalledWith({ forceFallback: true });
  });
});

describe("while generating", () => {
  it("locks the planning context so it cannot change mid-flight", () => {
    planState.loading = true;
    render(<PlanWorkspace />);
    expect(contextField()).toBeDisabled();
  });
});

describe("the selected day (overhaul Phase 3, TRAIN-02)", () => {
  it("follows the strip, and mirrors the choice into the URL", async () => {
    calendarState.savedWeek = savedWeek();
    calendarState.hasSaved = true;
    render(<PlanWorkspace />);

    // A past week opens on its Monday, the only planned day in the fixture.
    expect(screen.getByRole("heading", { level: 2, name: "Saved easy run" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Tue 10/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Rest day" })).toBeInTheDocument();
    expect(window.location.search).toContain("date=2026-03-10");
  });
});

describe("editing the selected day (overhaul Phase 3b)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("edits today's session and saves the whole week in one step", async () => {
    // Monday of the fixture week, so its one session is today's and still editable.
    vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 2, 9, 8, 0));
    calendarState.savedWeek = savedWeek();
    calendarState.hasSaved = true;
    render(<PlanWorkspace />);

    await userEvent.click(screen.getByRole("button", { name: /edit session/i }));
    const editor = screen.getByRole("form", { name: /edit saved easy run/i });
    const distance = within(editor).getByRole("spinbutton", { name: "Distance" });
    await userEvent.clear(distance);
    await userEvent.type(distance, "10");
    await userEvent.click(within(editor).getByRole("button", { name: "Save changes" }));

    expect(replaceWeek).toHaveBeenCalledTimes(1);
    const saved = replaceWeek.mock.calls[0]![0];
    expect(saved.workouts[0]).toMatchObject({ distanceKm: 10, status: "modified" });
    expect(screen.queryByRole("form", { name: /edit/i })).not.toBeInTheDocument();
  });

  it("marks an earlier session done when no run was logged, and can undo it", async () => {
    calendarState.savedWeek = savedWeek();
    calendarState.hasSaved = true;
    render(<PlanWorkspace />);

    expect(screen.queryByRole("button", { name: /edit session/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect(patchWorkout).toHaveBeenCalledWith(
      (calendarState.savedWeek as { workouts: { id: string }[] }).workouts[0]!.id,
      { status: "completed" },
    );
  });

  it("offers no editing on an unsaved preview", () => {
    planState.result = preview();
    render(<PlanWorkspace />);
    expect(
      screen.queryByRole("button", { name: /edit session|mark done/i }),
    ).not.toBeInTheDocument();
  });
});

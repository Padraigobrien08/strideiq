import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompactRaceGoalForm } from "../compact-race-goal-form";
import type { RaceGoal } from "@/lib/analytics/readiness";

/**
 * Race goal entry, tested through the form rather than around it.
 *
 * `parseTargetTime` is not exported, and that is the right call — it is an
 * implementation detail of this input. So these drive the actual text field, which
 * also means they cover the bit that matters: what reaches `setRaceGoal`. A target
 * time flows into race prediction comparisons, so a wrong number here is not a
 * cosmetic problem, it silently skews every projection shown against the goal.
 */

const setRaceGoal = vi.fn();
const clearRaceGoal = vi.fn();
const state: { raceGoal: RaceGoal | null } = { raceGoal: null };

vi.mock("@/stores/goal-store", () => ({
  useGoalStore: () => ({ raceGoal: state.raceGoal, setRaceGoal, clearRaceGoal }),
}));

beforeEach(() => {
  setRaceGoal.mockReset();
  clearRaceGoal.mockReset();
  state.raceGoal = null;
});

/** Fill the target-time box and submit; returns the goal that was saved. */
async function submitWithTarget(value: string) {
  render(<CompactRaceGoalForm />);
  if (value) {
    await userEvent.type(screen.getByLabelText(/target time/i), value);
  }
  await userEvent.click(screen.getByRole("button", { name: /update mission/i }));
  return setRaceGoal.mock.calls[0]?.[0] as RaceGoal | undefined;
}

describe("target time parsing", () => {
  it.each([
    ["h:mm:ss", "1:49:00", 6540],
    ["mm:ss", "49:30", 2970],
    ["bare minutes", "90", 5400],
    ["fractional minutes", "89.5", 5370],
  ])("reads %s", async (_label, input, expected) => {
    expect((await submitWithTarget(input))?.targetTimeSec).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["letters", "abc"],
    ["too many parts", "1:2:3:4"],
    ["a non-numeric part", "1:ab"],
    ["zero", "0"],
  ])("omits the target entirely for %s", async (_label, input) => {
    const goal = await submitWithTarget(input);
    expect(goal).toBeDefined();
    expect(goal).not.toHaveProperty("targetTimeSec");
  });

  /**
   * The gap. `parseTargetTime` guards `min > 0` on the bare-number path but not on
   * the colon path, and the caller's `if (targetTimeSec)` treats a negative as
   * truthy — so "-1:00" saved a goal of minus sixty seconds, which would then be
   * compared against real predictions.
   */
  it.each([
    ["a negative mm:ss", "-1:00"],
    ["a negative h:mm:ss", "-1:00:00"],
    ["a negative bare number", "-30"],
  ])("refuses %s rather than storing a negative goal", async (_label, input) => {
    const goal = await submitWithTarget(input);
    expect(goal).not.toHaveProperty("targetTimeSec");
  });
});

describe("saving a goal", () => {
  it("always saves the distance and date", async () => {
    const goal = await submitWithTarget("");
    expect(goal?.distance).toBe("hm");
    expect(goal?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("defaults the race date to a trainable distance away, not today", async () => {
    const goal = await submitWithTarget("");
    const days = (new Date(goal!.date).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(30);
  });

  it("collapses the form once a goal is saved", async () => {
    render(<CompactRaceGoalForm />);
    expect(screen.getByLabelText(/race date/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /update mission/i }));
    expect(screen.queryByLabelText(/race date/i)).not.toBeInTheDocument();
  });
});

describe("an existing goal", () => {
  beforeEach(() => {
    state.raceGoal = { distance: "marathon", date: "2026-10-11" };
  });

  it("summarises it on the collapsed trigger", () => {
    render(<CompactRaceGoalForm />);
    expect(screen.getByText(/marathon/i)).toBeInTheDocument();
  });

  it("starts collapsed, unlike the empty state", () => {
    render(<CompactRaceGoalForm />);
    expect(screen.queryByLabelText(/race date/i)).not.toBeInTheDocument();
  });

  it("offers a clear action that the empty state does not", async () => {
    render(<CompactRaceGoalForm />);
    await userEvent.click(screen.getByRole("button", { name: /race mission setup/i }));
    await userEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(clearRaceGoal).toHaveBeenCalled();
  });
});

describe("race name (overhaul D6)", () => {
  it("saves a trimmed name when given", async () => {
    render(<CompactRaceGoalForm />);
    await userEvent.type(screen.getByLabelText(/race name/i), "  Edinburgh Half Marathon ");
    await userEvent.click(screen.getByRole("button", { name: /update mission/i }));
    expect(setRaceGoal.mock.calls[0]?.[0]).toMatchObject({ name: "Edinburgh Half Marathon" });
  });

  it("leaves the name out rather than saving a blank one", async () => {
    const goal = await submitWithTarget("");
    expect(goal).not.toHaveProperty("name");
  });

  it("shows the name on the collapsed trigger, falling back to the distance", () => {
    state.raceGoal = { distance: "hm", date: "2026-12-20", name: "Edinburgh Half Marathon" };
    render(<CompactRaceGoalForm />);
    expect(screen.getByText(/edinburgh half marathon/i)).toBeInTheDocument();
  });
});

describe("editing a saved goal keeps what was there", () => {
  it("re-saves the existing target time and name untouched", async () => {
    state.raceGoal = {
      distance: "hm",
      date: "2026-12-20",
      targetTimeSec: 6300,
      name: "Edinburgh Half Marathon",
    };
    render(<CompactRaceGoalForm />);
    await userEvent.click(screen.getByRole("button", { name: /race mission setup/i }));
    await userEvent.click(screen.getByRole("button", { name: /update mission/i }));
    expect(setRaceGoal.mock.calls[0]?.[0]).toMatchObject({
      targetTimeSec: 6300,
      name: "Edinburgh Half Marathon",
    });
  });
});

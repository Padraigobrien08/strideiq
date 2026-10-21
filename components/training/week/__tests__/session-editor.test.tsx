import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CalendarWorkout, TrainingCalendarWeek } from "@/lib/training-calendar";
import { SessionEditor } from "../session-editor";

/**
 * Editing one session (overhaul Phase 3b; SPEC §7.6, §9.5): direct controls, the week's
 * totals before save, warnings that never block, and nothing saved until Save.
 */

function workout(over: Partial<CalendarWorkout> & Pick<CalendarWorkout, "date">): CalendarWorkout {
  return {
    id: `w-${over.date}`,
    day: "Monday",
    modality: "run",
    type: "easy",
    title: "Easy run",
    intensity: "easy",
    purpose: "Aerobic volume.",
    status: "planned",
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
    ...over,
  };
}

const WEEK: TrainingCalendarWeek = {
  id: "week-2026-10-19",
  weekStart: "2026-10-19",
  weekEnd: "2026-10-25",
  source: "manual",
  summary: "",
  workouts: [
    workout({ date: "2026-10-19", distanceKm: 8 }),
    workout({
      date: "2026-10-20",
      type: "tempo",
      title: "Tempo 3 × 10 min",
      intensity: "hard",
      distanceKm: 10,
    }),
    workout({
      date: "2026-10-23",
      type: "interval",
      title: "6 × 800 m",
      intensity: "hard",
      distanceKm: 9,
    }),
    workout({
      date: "2026-10-24",
      type: "long",
      title: "Long run",
      intensity: "moderate",
      distanceKm: 16,
    }),
  ],
  evidenceUsed: [],
  constraintsApplied: [],
  risksManaged: [],
  limitations: [],
  confidence: "medium",
  savedAt: "2026-10-18T00:00:00Z",
  updatedAt: "2026-10-18T00:00:00Z",
};

const physiology = {
  thresholdEconomy: { ltPaceSecPerKm: 282 },
  criticalSpeed: { csPaceSecPerKm: null },
} as never;

function setup(workoutIndex = 3) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <SessionEditor
      week={WEEK}
      workout={WEEK.workouts[workoutIndex]!}
      todayIso="2026-10-21"
      physiology={physiology}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );
  return { onSave, onCancel };
}

const totalsRow = (name: RegExp) =>
  within(screen.getByRole("table", { name: /after the change/i })).getByRole("row", { name });

describe("the session editor", () => {
  it("offers day, type and distance, with today onwards as the days", () => {
    setup();
    const day = screen.getByRole("combobox", { name: "Day" });
    const days = within(day)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(days).toEqual(["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(screen.getByRole("radio", { name: "Long" })).toBeChecked();
    expect(screen.getByRole("spinbutton", { name: "Distance" })).toHaveValue(16);
  });

  it("names the session a move would swap with", () => {
    setup();
    expect(
      screen.getByRole("option", { name: /Fri 23 Oct · swaps with 6 × 800 m/ }),
    ).toBeInTheDocument();
  });

  it("keeps Save off until something changes, and saves nothing on Cancel", async () => {
    const { onSave, onCancel } = setup();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the week's totals change before saving", async () => {
    setup();
    const distance = screen.getByRole("spinbutton", { name: "Distance" });
    await userEvent.clear(distance);
    await userEvent.type(distance, "20");
    expect(totalsRow(/Planned distance/)).toHaveTextContent("47 km");
    expect(totalsRow(/Planned distance/)).toHaveTextContent("+4 km");
    expect(totalsRow(/Hard sessions/)).toHaveTextContent("unchanged");
  });

  it("warns about a third hard session but still lets it be saved", async () => {
    const { onSave } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Tempo" }));
    expect(screen.getByText(/3 hard sessions this week/)).toBeInTheDocument();
    expect(screen.getByText(/you can still save/i)).toBeInTheDocument();
    expect(screen.getByText(/Target pace 4:35–4:50\/km/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    const saved = onSave.mock.calls[0]![0] as TrainingCalendarWeek;
    expect(saved.workouts.find((w) => w.id === "w-2026-10-24")).toMatchObject({
      type: "tempo",
      intensity: "hard",
      status: "modified",
    });
  });

  it("refuses a distance that is not a positive number, and says why", async () => {
    setup();
    const distance = screen.getByRole("spinbutton", { name: "Distance" });
    await userEvent.clear(distance);
    await userEvent.type(distance, "0");
    expect(distance).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/a number above zero/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("hides distance for a rest day", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "Rest" }));
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(totalsRow(/Sessions/)).toHaveTextContent("−1");
  });
});

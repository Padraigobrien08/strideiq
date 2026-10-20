import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LegFeelCard } from "../leg-feel-card";
import type { LegFeel } from "@/lib/wellness/types";

/**
 * First component test in the repo, and a deliberate choice of subject.
 *
 * Leg feel is the one input an athlete gives that no sensor can: it feeds the
 * readiness model directly, and its store was the subject of defect D-4 (a stale
 * report overwriting a newer one). The card is where that data is entered, so the
 * contract worth pinning is what it *sends* — the arguments handed to `setFeel` — not
 * how it looks.
 *
 * `useLegFeel` is mocked because the store's own behaviour is already covered in
 * `stores/__tests__`; duplicating it here would test the mock.
 */

const setFeel = vi.fn();
const state: { legs: LegFeel | undefined; report: unknown } = { legs: undefined, report: null };

vi.mock("@/hooks/use-leg-feel", () => ({
  useLegFeel: () => ({ legs: state.legs, report: state.report, setFeel }),
}));

beforeEach(() => {
  setFeel.mockReset();
  state.legs = undefined;
  state.report = null;
});

const feelGroup = () => screen.getByRole("group", { name: /leg feel/i });

describe("choosing how the legs feel", () => {
  it("offers the three states", () => {
    render(<LegFeelCard />);
    const names = within(feelGroup())
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).toEqual(["Fresh", "Normal", "Heavy"]);
  });

  it("reports the chosen feel", async () => {
    render(<LegFeelCard />);
    await userEvent.click(screen.getByRole("button", { name: "Heavy" }));
    expect(setFeel).toHaveBeenCalledWith("heavy");
  });

  // aria-pressed is how a screen reader conveys the current answer; the colour
  // change alone communicates nothing to one.
  it("marks the current feel as pressed, and only that one", () => {
    state.legs = "normal";
    render(<LegFeelCard />);
    expect(screen.getByRole("button", { name: "Normal" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Heavy" })).toHaveAttribute("aria-pressed", "false");
  });

  it("prompts before an answer and confirms after", () => {
    const { rerender } = render(<LegFeelCard />);
    expect(screen.getByText(/what the numbers can't see/i)).toBeInTheDocument();

    state.legs = "heavy";
    rerender(<LegFeelCard />);
    expect(screen.getByText(/readiness eased/i)).toBeInTheDocument();
  });
});

describe("flagging a niggle", () => {
  it("stays out of the way until asked for", async () => {
    render(<LegFeelCard />);
    expect(screen.queryByRole("button", { name: "Knee" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /flag a niggle/i }));
    expect(screen.getByRole("button", { name: "Knee" })).toBeInTheDocument();
  });

  /**
   * The one that would actually bite. `flag` calls
   * `setFeel(legs ?? "normal", "morning", …)`, so recording a niggle also writes a
   * leg-feel value. If the athlete has already said "heavy", flagging a knee must not
   * quietly reset them to "normal" and soften the readiness adjustment they asked for.
   */
  it("preserves an existing feel when a niggle is added", async () => {
    state.legs = "heavy";
    render(<LegFeelCard />);

    await userEvent.click(screen.getByRole("button", { name: /flag a niggle/i }));
    await userEvent.click(screen.getByRole("button", { name: "Knee" }));

    expect(setFeel).toHaveBeenCalledWith("heavy", "morning", {
      niggle: { area: "Knee", severity: 2 },
    });
  });

  it("defaults to normal when no feel has been given yet", async () => {
    render(<LegFeelCard />);
    await userEvent.click(screen.getByRole("button", { name: /flag a niggle/i }));
    await userEvent.click(screen.getByRole("button", { name: "Calf" }));

    expect(setFeel).toHaveBeenCalledWith("normal", "morning", {
      niggle: { area: "Calf", severity: 2 },
    });
  });

  it("closes the area picker once one is chosen", async () => {
    render(<LegFeelCard />);
    await userEvent.click(screen.getByRole("button", { name: /flag a niggle/i }));
    await userEvent.click(screen.getByRole("button", { name: "Foot" }));
    expect(screen.queryByRole("button", { name: "Knee" })).not.toBeInTheDocument();
  });
});

describe("an existing niggle", () => {
  beforeEach(() => {
    state.legs = "normal";
    state.report = { niggle: { area: "Achilles", severity: 2 } };
  });

  it("shows the area and its severity", () => {
    render(<LegFeelCard />);
    expect(screen.getByText("Achilles")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Moderate" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("changes severity without losing the area", async () => {
    render(<LegFeelCard />);
    await userEvent.click(screen.getByRole("button", { name: "Strong" }));
    expect(setFeel).toHaveBeenCalledWith("normal", "morning", {
      niggle: { area: "Achilles", severity: 3 },
    });
  });

  // Clearing has to send an explicit null. Omitting the key would leave the merge
  // layer with nothing to act on and the niggle would persist.
  it("clears with an explicit null rather than an omission", async () => {
    render(<LegFeelCard />);
    await userEvent.click(screen.getByRole("button", { name: "clear" }));
    expect(setFeel).toHaveBeenCalledWith("normal", "morning", { niggle: null });
  });

  it("offers no area picker while one is already flagged", () => {
    render(<LegFeelCard />);
    expect(screen.queryByRole("button", { name: /flag a niggle/i })).not.toBeInTheDocument();
  });
});

describe("Today's compact row (overhaul Phase 2 decision)", () => {
  it("sends exactly what the card sends", async () => {
    render(<LegFeelCard compact />);
    await userEvent.click(within(feelGroup()).getByRole("button", { name: "Fresh" }));
    expect(setFeel).toHaveBeenCalledWith("fresh");
    await userEvent.click(screen.getByRole("button", { name: /flag a niggle/i }));
    await userEvent.click(screen.getByRole("button", { name: "Calf" }));
    expect(setFeel).toHaveBeenLastCalledWith("normal", "morning", {
      niggle: { area: "Calf", severity: 2 },
    });
  });

  it("is a labelled region, not a card", () => {
    render(<LegFeelCard compact />);
    expect(screen.getByRole("region", { name: "How do the legs feel?" })).toBeInTheDocument();
  });
});

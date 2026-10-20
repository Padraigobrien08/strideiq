import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanHeader } from "../plan-header";

/**
 * The phone "More" toggle (viewport contract rule 4): Duplicate, Revert and Clear stay
 * reachable on phones without taking a row of the first screen until asked for.
 */

const props = {
  title: "Oct 19–25",
  weekRange: "Oct 19 – Oct 25, 2026",
  status: "saved" as const,
  statusLabel: "Saved · your week",
  phaseLabel: "Adaptive week",
  goalContext: "Half marathon · 62 days out",
  confidence: "high" as const,
  canSave: false,
  canRevert: true,
  hasSaved: true,
  onGenerate: vi.fn(),
  onSave: vi.fn(),
  onClear: vi.fn(),
  onDuplicate: vi.fn(),
  onRevert: vi.fn(),
  coachHref: "/coach",
};

describe("plan header actions", () => {
  it("keeps the secondary actions behind More on phones until it is pressed", async () => {
    render(<PlanHeader {...props} />);
    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    const row = screen.getByRole("button", { name: /clear/i }).parentElement!;
    expect(row.className).toMatch(/\bhidden\b/);
    expect(row.className).toMatch(/sm:flex/);

    await userEvent.click(more);
    expect(screen.getByRole("button", { name: "Less" })).toHaveAttribute("aria-expanded", "true");
    expect(row.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("offers no More toggle when there is nothing behind it", () => {
    render(<PlanHeader {...props} hasSaved={false} canRevert={false} />);
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
  });

  it("puts the goal on the badge row", () => {
    render(<PlanHeader {...props} />);
    expect(screen.getByText("Half marathon · 62 days out").closest("div")).toHaveTextContent(
      /Saved · your week/,
    );
  });
});

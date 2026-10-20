import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TodayPage } from "../today-page";
import type { TodayView } from "@/lib/today/todayView";

/**
 * Today's layout contract (ACCEPTANCE-TESTS TODAY-01…06). The view model decides what
 * to show; these pin that the page shows it in the approved order and never invents
 * a figure or a routine readiness panel.
 */

const runView = (over: Partial<TodayView> = {}): TodayView => ({
  isoDate: "2026-10-18",
  dateLabel: "Sun 18 Oct",
  hasPlan: true,
  readinessException: null,
  session: {
    kind: "run",
    title: "Easy aerobic run",
    figures: {
      distance: "8 km",
      duration: { text: "45–50 min", estimated: true },
      pace: { text: "5:35–6:05/km", basis: "From your threshold pace (4:40/km)" },
    },
    why: "Keep aerobic volume up between quality days.",
    raceRelevance: "Builds the aerobic base Edinburgh Half Marathon depends on.",
    source: "plan",
    calendarWorkoutId: "w-2026-10-18",
  },
  outlook: {
    kind: "race",
    name: "Edinburgh Half Marathon",
    daysToRace: 62,
    status: { status: "on_track", label: "On track", likelyRangeSec: [5640, 6060] },
    goalTime: "1:40:00",
    likelyRange: "1:34:00–1:41:00",
    provenance: "Based on a recent 10K + 6 consistent weeks",
  },
  ...over,
});

describe("Today", () => {
  it("leads with the session: type, then distance, duration and pace (TODAY-01)", () => {
    render(<TodayPage view={runView()} />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Easy aerobic run");
    for (const value of ["8 km", "45–50 min", "5:35–6:05/km"]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText("Duration (est.)")).toBeInTheDocument();
    expect(screen.getByText(/pace from your threshold pace/i)).toBeInTheDocument();
  });

  it("says why today and how it serves the race (TODAY-02)", () => {
    render(<TodayPage view={runView()} />);
    expect(screen.getByRole("heading", { name: "Why today" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Race relevance" })).toBeInTheDocument();
  });

  it("shows only the figures it has, never a placeholder", () => {
    const view = runView();
    if (view.session.kind !== "run") throw new Error();
    view.session.figures = { distance: "8 km", duration: null, pace: null };
    render(<TodayPage view={view} />);
    expect(screen.queryByText(/duration/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^pace$/i)).not.toBeInTheDocument();
  });

  it("prescribes recovery on a rest day, with guidance (TODAY-03)", () => {
    render(
      <TodayPage
        view={runView({
          session: {
            kind: "rest",
            title: "Recovery day",
            why: "A planned rest day.",
            guidance: { mobility: "Mobility work.", sleep: "Sleep well.", fuel: "Eat well." },
            tomorrow: {
              title: "Tempo 3 × 10 min",
              figures: { distance: "10 km", duration: null, pace: null },
            },
            source: "plan",
            calendarWorkoutId: "w-rest",
          },
        })}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Recovery day");
    for (const t of ["Mobility", "Sleep", "Fuel", "Tempo 3 × 10 min"]) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    expect(screen.queryByText("Distance")).not.toBeInTheDocument();
  });

  it("has no readiness panel unless readiness changed the session (TODAY-04)", () => {
    const { rerender } = render(<TodayPage view={runView()} />);
    expect(screen.queryByRole("region", { name: /recent load/i })).not.toBeInTheDocument();
    rerender(
      <TodayPage
        view={runView({
          readinessException: {
            affects: true,
            actual: "recovery",
            withoutLoad: "tempo",
            direction: "held_back",
            evidence: ["Training load balance −33% of chronic load (Fatigued)."],
          },
        })}
      />,
    );
    const panel = screen.getByRole("region", { name: /eased today back/i });
    expect(within(panel).getByText(/would be a tempo session/i)).toBeInTheDocument();
    expect(within(panel).getByText(/recommends a recovery run/i)).toBeInTheDocument();
    expect(
      within(panel).getByRole("link", { name: /discuss this with coach/i }),
    ).toBeInTheDocument();
  });

  it("shows recent progress instead of a countdown without a race (TODAY-05)", () => {
    render(
      <TodayPage
        view={runView({
          outlook: {
            kind: "no_race",
            direction: "Fitness is rising: up 12% over 12 weeks.",
            trajectory: [10, 11, 12, 13, 14],
            observation: "Aerobic efficiency is improving.",
            pastRace: null,
          },
        })}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Recent progress" })).toBeInTheDocument();
    expect(screen.getByText(/fitness is rising/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /set a race goal/i })).toHaveAttribute(
      "href",
      "/progress",
    );
    expect(screen.queryByText(/to race/i)).not.toBeInTheDocument();
  });

  it("states race status in words, with the goal and projection link", () => {
    render(<TodayPage view={runView()} />);
    const outlook = screen.getByRole("complementary", { name: "Race outlook" });
    expect(within(outlook).getByText("Edinburgh Half Marathon")).toBeInTheDocument();
    expect(within(outlook).getByText("On track")).toBeInTheDocument();
    expect(within(outlook).getByText("1:40:00")).toBeInTheDocument();
    expect(within(outlook).getByRole("link", { name: /view projection/i })).toHaveAttribute(
      "href",
      "/progress",
    );
  });

  it("opens Coach with the session attached (TODAY-06), and the week one step away", () => {
    render(<TodayPage view={runView()} />);
    expect(screen.getByRole("link", { name: "Ask about this run" })).toHaveAttribute(
      "href",
      "/coach?source=today&date=2026-10-18&workout=w-2026-10-18",
    );
    expect(screen.getByRole("link", { name: /view this week/i })).toHaveAttribute(
      "href",
      "/training",
    );
  });

  it("keeps the race status by the date on phones, linking to the projection (rule 2)", () => {
    render(<TodayPage view={runView()} />);
    const chip = screen.getByRole("link", { name: /^Race status:/ });
    expect(chip).toHaveAccessibleName(
      "Race status: Edinburgh Half Marathon, On track, 62 days to go",
    );
    expect(chip).toHaveAttribute("href", "/progress");
    expect(chip.className).toMatch(/lg:hidden/);
  });

  it("caps its width on wide screens (rule 5)", () => {
    const { container } = render(<TodayPage view={runView()} />);
    expect(container.querySelector("[data-content-cap]")?.className).toMatch(/max-w-\[1360px\]/);
  });
});

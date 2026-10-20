import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DayDetail as DayDetailView, WeekDay } from "@/lib/training-week/weekView";
import { WeekStrip } from "../week-strip";
import { DayDetail } from "../day-detail";

/**
 * Training's strip and selected day (ACCEPTANCE TRAIN-01…04, 06). The view model
 * decides statuses and what each day may show; these pin how it is presented.
 */

const DAYS: WeekDay[] = [
  {
    date: "2026-10-19",
    label: "Mon 19",
    isToday: false,
    status: "completed",
    title: "Easy run",
    amount: "8 km",
  },
  {
    date: "2026-10-20",
    label: "Tue 20",
    isToday: false,
    status: "variance",
    title: "Tempo",
    amount: "10 km",
  },
  {
    date: "2026-10-21",
    label: "Wed 21",
    isToday: true,
    status: "today",
    title: "Easy run",
    amount: "6 km",
  },
  {
    date: "2026-10-22",
    label: "Thu 22",
    isToday: false,
    status: "rest",
    title: "Rest",
    amount: null,
  },
  {
    date: "2026-10-23",
    label: "Fri 23",
    isToday: false,
    status: "upcoming",
    title: "6 × 800 m",
    amount: "9 km",
  },
  {
    date: "2026-10-24",
    label: "Sat 24",
    isToday: false,
    status: "upcoming",
    title: "Long run",
    amount: "16 km",
  },
  {
    date: "2026-10-25",
    label: "Sun 25",
    isToday: false,
    status: "rest",
    title: "Rest",
    amount: null,
  },
];

const base: DayDetailView = {
  date: "2026-10-23",
  dateLabel: "Fri 23 Oct",
  status: "upcoming",
  title: "6 × 800 m",
  isRest: false,
  prescription: {
    figures: {
      distance: "9 km",
      duration: { text: "40–45 min", estimated: true },
      pace: { text: "4:20–4:35/km", basis: "From your threshold pace (4:42/km)" },
    },
    structure: {
      steps: [
        { name: "Warm up", amount: "10–15 min", effort: "Easy pace (5:40–6:05/km)" },
        { name: "Main set", amount: null, effort: "Interval pace (4:20–4:35/km)" },
        { name: "Cool down", amount: "5–10 min", effort: "Easy pace (5:40–6:05/km)" },
      ],
      note: null,
    },
  },
  why: "Sharpens speed for the 10K.",
  comparison: null,
  note: null,
  activityHref: null,
  alsoPlanned: [],
  coachHref: "/coach?source=training_week&date=2026-10-23&workout=w-1",
};

describe("the week strip", () => {
  it("shows seven days with today identified in words, not colour alone (TRAIN-01)", () => {
    render(<WeekStrip days={DAYS} selectedDate="2026-10-21" onSelect={() => {}} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(7);
    expect(screen.getByRole("button", { name: /Wed 21.*today/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const label of ["Completed", "Variance", "Today", "Rest", "Upcoming"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("still says Today in words once today's run is logged", () => {
    const days = DAYS.map((d) => (d.isToday ? { ...d, status: "completed" as const } : d));
    render(<WeekStrip days={days} selectedDate="2026-10-19" onSelect={() => {}} />);
    expect(screen.getByText("Wed 21 · Today")).toBeInTheDocument();
  });

  it("selects a day when it is pressed (TRAIN-02)", async () => {
    const onSelect = vi.fn();
    render(<WeekStrip days={DAYS} selectedDate="2026-10-21" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Fri 23/ }));
    expect(onSelect).toHaveBeenCalledWith("2026-10-23");
  });

  it("scrolls on its own on phones, and is a grid on desktop (TRAIN-06)", () => {
    render(<WeekStrip days={DAYS} selectedDate="2026-10-21" onSelect={() => {}} />);
    const list = screen.getByRole("list", { name: "Days this week" });
    expect(list.className).toMatch(/overflow-x-auto/);
    expect(list.className).toMatch(/lg:grid-cols-7/);
  });
});

describe("the selected day", () => {
  it("shows an upcoming session's prescription, structure and purpose, and no comparison (TRAIN-04)", () => {
    render(<DayDetail detail={base} />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("6 × 800 m");
    expect(screen.getByText("4:20–4:35/km")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Suggested structure" })).toBeInTheDocument();
    expect(screen.getByText("Interval pace (4:20–4:35/km)")).toBeInTheDocument();
    expect(screen.getByText("Sharpens speed for the 10K.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ask coach/i })).toHaveAttribute(
      "href",
      base.coachHref,
    );
  });

  it("compares planned with completed and links the activity (TRAIN-03)", () => {
    render(
      <DayDetail
        detail={{
          ...base,
          status: "completed",
          prescription: null,
          comparison: {
            distance: { planned: "8 km", actual: "8.1 km" },
            pace: { planned: "5:40–6:05/km", actual: "5:50/km" },
            duration: { planned: "45–50 min (est.)", actual: "47:15" },
          },
          activityHref: "/runs/r-1",
        }}
      />,
    );
    const table = screen.getByRole("table", { name: "Planned against completed" });
    const pace = within(table).getByRole("row", { name: /Pace/ });
    expect(within(pace).getByText("5:40–6:05/km")).toBeInTheDocument();
    expect(within(pace).getByText("5:50/km")).toBeInTheDocument();
    expect(screen.getByText("Completed as planned")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view activity/i })).toHaveAttribute(
      "href",
      "/runs/r-1",
    );
    expect(screen.queryByRole("heading", { name: "Suggested structure" })).not.toBeInTheDocument();
  });

  it("gives steady running one line, not a step table", () => {
    render(
      <DayDetail
        detail={{
          ...base,
          prescription: {
            figures: base.prescription!.figures,
            structure: { steps: null, note: "Easy pace throughout (5:40–6:05/km)." },
          },
        }}
      />,
    );
    expect(screen.getByText("Easy pace throughout (5:40–6:05/km).")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

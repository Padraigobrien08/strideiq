import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppWorkspaceShell } from "../workspace/shell";
import { activeDestination } from "../nav";

/**
 * The app shell after overhaul Phase 1: three destinations, a persistent Ask Coach
 * action that carries the page it came from, and the landmarks a keyboard or screen-
 * reader user starts from (ACCEPTANCE-TESTS NAV-01, NAV-03, A11Y-01).
 */

const nav = { pathname: "/home" };
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/stores/theme-store", () => ({
  useThemeStore: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));
vi.mock("@/lib/context/strava-context", () => ({
  useStrava: () => ({
    importData: null,
    clearData: vi.fn(),
    loadDemo: vi.fn(),
    refreshFromStravaApi: vi.fn(),
    apiConnected: false,
    dataSourceLabel: null,
    dataSources: {},
  }),
}));

function renderAt(pathname: string) {
  nav.pathname = pathname;
  return render(
    <AppWorkspaceShell>
      <h1>Page body</h1>
    </AppWorkspaceShell>,
  );
}

/** The inline (≥ sm) main nav; the phone row renders the same links a second time. */
const mainNavs = () => screen.getAllByRole("navigation", { name: "Main" });

beforeEach(() => {
  nav.pathname = "/home";
});

describe("primary navigation (NAV-01)", () => {
  it("offers exactly Today, Training and Progress", () => {
    renderAt("/home");
    for (const navEl of mainNavs()) {
      const labels = within(navEl)
        .getAllByRole("link")
        .map((a) => a.textContent);
      expect(labels).toEqual(["Today", "Training", "Progress"]);
    }
  });

  it("points Training at the current week and Progress at /progress", () => {
    renderAt("/home");
    const [inline] = mainNavs();
    expect(within(inline).getByRole("link", { name: "Training" })).toHaveAttribute("href", "/plan");
    expect(within(inline).getByRole("link", { name: "Progress" })).toHaveAttribute(
      "href",
      "/progress",
    );
  });

  it("marks the current destination with aria-current, not colour alone", () => {
    renderAt("/runs/123");
    const [inline] = mainNavs();
    expect(within(inline).getByRole("link", { name: "Training" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(inline).getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
  });

  it.each([
    ["/home", "/home"],
    ["/plan", "/plan"],
    ["/training", "/plan"],
    ["/runs/abc/route", "/plan"],
    ["/progress", "/progress"],
    ["/goals", "/progress"],
    ["/performance", "/progress"],
    ["/intelligence", "/progress"],
    ["/coach", null],
    ["/settings", null],
    ["/import", null],
  ])("files %s under %s", (pathname, expected) => {
    expect(activeDestination(pathname)).toBe(expected);
  });
});

describe("Ask Coach (NAV-03)", () => {
  it.each([
    ["/home", "/coach?source=today"],
    ["/plan", "/coach?source=training_week"],
    ["/runs/12345", "/coach?source=activity&activity=12345"],
    ["/progress", "/coach?source=progress"],
    ["/settings", "/coach"],
  ])("from %s opens %s", (pathname, href) => {
    renderAt(pathname);
    expect(screen.getByRole("link", { name: "Ask Coach" })).toHaveAttribute("href", href);
  });

  it("never auto-sends a question", () => {
    renderAt("/home");
    const href = screen.getByRole("link", { name: "Ask Coach" }).getAttribute("href")!;
    expect(href).not.toMatch(/investigate|[?&]q=/);
  });

  it("marks itself current on the Coach page", () => {
    renderAt("/coach");
    expect(screen.getByRole("link", { name: "Ask Coach" })).toHaveAttribute("aria-current", "page");
  });
});

describe("landmarks and keyboard entry (A11Y-01)", () => {
  it("has a skip link to the main region, first in tab order", async () => {
    renderAt("/home");
    await userEvent.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("puts the page inside main and the navigation inside the header", () => {
    renderAt("/home");
    expect(
      within(screen.getByRole("main")).getByRole("heading", { name: "Page body" }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("banner")).getAllByRole("navigation", { name: "Main" }),
    ).toHaveLength(2);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette, openCommandPalette } from "../command-palette";

/**
 * The command palette — the only route to several pages that were pulled out of the
 * top nav, so a break here does not degrade navigation, it removes it.
 *
 * The behaviours worth pinning are the ones a mouse never exercises: the global
 * shortcut, arrow-key bounds, and Enter running the highlighted row rather than the
 * first one. Those are also the ones that rot silently, because nobody clicks them.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const toggleTheme = vi.fn();
const themeState = { theme: "dark" as "dark" | "light" };
vi.mock("@/stores/theme-store", () => ({
  useThemeStore: () => ({ theme: themeState.theme, toggleTheme }),
}));

const loadDemo = vi.fn();
const clearData = vi.fn();
const refreshFromStravaApi = vi.fn();
const stravaState = { apiConnected: false, demo: false };
vi.mock("@/lib/context/strava-context", () => ({
  useStrava: () => ({
    loadDemo,
    clearData,
    refreshFromStravaApi,
    apiConnected: stravaState.apiConnected,
    dataSources: { demo: stravaState.demo },
  }),
}));

beforeEach(() => {
  push.mockReset();
  toggleTheme.mockReset();
  loadDemo.mockReset();
  clearData.mockReset();
  refreshFromStravaApi.mockReset().mockResolvedValue(undefined);
  themeState.theme = "dark";
  stravaState.apiConnected = false;
  stravaState.demo = false;
});

const search = () => screen.getByRole("textbox", { name: /search pages and actions/i });
const isOpen = () => screen.queryByLabelText("Command palette") !== null;

/** The command rows: plain buttons inside the palette, excluding the search box. */
const rows = () => screen.queryAllByRole("button").filter((b) => b.hasAttribute("data-index"));

/** Render and open it the way a header button does. */
async function open() {
  render(<CommandPalette />);
  await userEvent.keyboard("{Meta>}k{/Meta}");
  return search();
}

describe("opening and closing", () => {
  it("starts closed", () => {
    render(<CommandPalette />);
    expect(isOpen()).toBe(false);
  });

  it.each([
    ["Meta", "{Meta>}k{/Meta}"],
    ["Control", "{Control>}k{/Control}"],
  ])("opens on %s+K", async (_label, combo) => {
    render(<CommandPalette />);
    await userEvent.keyboard(combo);
    expect(isOpen()).toBe(true);
  });

  it("toggles shut on a second press", async () => {
    render(<CommandPalette />);
    await userEvent.keyboard("{Meta>}k{/Meta}");
    await userEvent.keyboard("{Meta>}k{/Meta}");
    expect(isOpen()).toBe(false);
  });

  it("ignores a bare k", async () => {
    render(<CommandPalette />);
    await userEvent.keyboard("k");
    expect(isOpen()).toBe(false);
  });

  // The exported helper is how the header button opens it, so it is part of the API.
  it("opens from the exported helper", async () => {
    render(<CommandPalette />);
    await userEvent.click(document.body);
    openCommandPalette();
    expect(await screen.findByLabelText("Command palette")).toBeInTheDocument();
  });

  it("forgets the previous query when reopened", async () => {
    const input = await open();
    await userEvent.type(input, "settings");
    await userEvent.keyboard("{Meta>}k{/Meta}"); // close
    await userEvent.keyboard("{Meta>}k{/Meta}"); // reopen
    expect(search()).toHaveValue("");
  });
});

describe("finding a command", () => {
  it("lists navigation and actions before any typing", async () => {
    await open();
    for (const name of [/^today/i, /^training$/i, /^progress/i, /^coach/i]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  // NAV-02: routes that left the top nav keep a way in.
  it("still lists every compatibility destination", async () => {
    await open();
    for (const name of [
      /activities/i,
      /intelligence/i,
      /performance/i,
      /training load/i,
      /report/i,
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("finds Today and Training by their old names", async () => {
    const input = await open();
    await userEvent.type(input, "home");
    expect(rows()[0]).toHaveTextContent(/today/i);
    await userEvent.clear(input);
    await userEvent.type(input, "plan");
    expect(rows()[0]).toHaveTextContent(/training/i);
  });

  it("filters by visible label", async () => {
    const input = await open();
    await userEvent.type(input, "intellig");
    const options = rows();
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent(/intelligence/i);
  });

  // Keywords are the point of a palette: "appearance" appears nowhere on screen but
  // is how someone would look for the theme toggle.
  it("filters by hidden keywords too", async () => {
    const input = await open();
    await userEvent.type(input, "appearance");
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent(/mode/i);
  });

  it("says nothing matched rather than showing everything", async () => {
    const input = await open();
    await userEvent.type(input, "zzzzz");
    expect(rows()).toHaveLength(0);
  });
});

describe("keyboard navigation", () => {
  it("runs the first command on Enter", async () => {
    const input = await open();
    // A query with exactly one match, so "first" is unambiguous — "training" also
    // matches other rows through their keywords.
    await userEvent.type(input, "intellig");
    await userEvent.type(search(), "{Enter}");
    expect(push).toHaveBeenCalledWith("/intelligence");
  });

  // The distinction that makes arrow keys worth having: Enter must run what is
  // highlighted, not what happens to be first.
  it("runs the highlighted command, not the first", async () => {
    await open();
    await userEvent.type(search(), "{ArrowDown}{Enter}");
    const first = push.mock.calls[0]?.[0];
    expect(first).toBeDefined();
    expect(first).not.toBe("/home");
  });

  it("does not run past the end of the list", async () => {
    const input = await open();
    await userEvent.type(input, "intellig");
    await userEvent.type(search(), "{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/intelligence");
  });

  it("does not run before the start of the list", async () => {
    const input = await open();
    await userEvent.type(input, "intellig");
    await userEvent.type(search(), "{ArrowUp}{ArrowUp}{Enter}");
    expect(push).toHaveBeenCalledWith("/intelligence");
  });

  it("does nothing on Enter when nothing matches", async () => {
    const input = await open();
    await userEvent.type(input, "zzzzz");
    await userEvent.type(search(), "{Enter}");
    expect(push).not.toHaveBeenCalled();
  });

  it("closes after running something", async () => {
    const input = await open();
    await userEvent.type(input, "intellig");
    await userEvent.type(search(), "{Enter}");
    expect(isOpen()).toBe(false);
  });
});

describe("actions offered depend on the athlete's state", () => {
  it("offers the demo when there is no data", async () => {
    await open();
    expect(screen.getByRole("button", { name: /try the demo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /exit demo/i })).not.toBeInTheDocument();
  });

  it("offers to leave the demo while in it", async () => {
    stravaState.demo = true;
    await open();
    expect(screen.getByRole("button", { name: /exit demo/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try the demo/i })).not.toBeInTheDocument();
  });

  // Syncing without a connection would fail; not offering it is the correct answer.
  it("hides sync until Strava is connected", async () => {
    await open();
    expect(screen.queryByRole("button", { name: /sync from strava/i })).not.toBeInTheDocument();

    stravaState.apiConnected = true;
    await open();
    expect(screen.getByRole("button", { name: /sync from strava/i })).toBeInTheDocument();
  });

  it("names the theme it would switch to, not the current one", async () => {
    themeState.theme = "dark";
    await open();
    expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeInTheDocument();
  });

  it("runs the action rather than navigating", async () => {
    const input = await open();
    await userEvent.type(input, "appearance");
    await userEvent.type(search(), "{Enter}");
    expect(toggleTheme).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

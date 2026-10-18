import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { composite, contrastRatio, parseColor, readDeclarations, type Rgba } from "../contrast";

/**
 * Every text/background pairing the theme defines meets WCAG 2.2 AA in both themes
 * (SPEC §13): 4.5:1 for text, 3:1 for the focus indicator. Values come straight from
 * app/globals.css, so retuning a token cannot silently break contrast.
 *
 * `npm run contrast` prints the full table.
 */

const css = readFileSync(path.resolve(__dirname, "../../../app/globals.css"), "utf8");

/** Tailwind's own zinc values: what the compatibility layer leaves untouched. */
const TAILWIND_ZINC: Record<string, string> = {
  "100": "#f4f4f5",
  "200": "#e4e4e7",
  "300": "#d4d4d8",
  "400": "#a1a1aa",
  "500": "#71717a",
  "600": "#52525b",
};

type Theme = "light" | "dark";
const TEXT = 4.5;
const FOCUS = 3;

interface Row {
  theme: Theme;
  pair: string;
  ratio: number;
  min: number;
}

function rowsFor(theme: Theme): Row[] {
  const vars = readDeclarations(css, `html.${theme}`);
  const color = (name: string): Rgba => {
    const c = parseColor(vars[`--${name}`] ?? "");
    if (!c) throw new Error(`${theme}: --${name} is missing or not a plain colour`);
    return c;
  };
  const bg = color("background");
  const surfaces: Record<string, Rgba> = {
    background: bg,
    "surface-elevated": composite(color("surface-elevated"), bg),
  };
  const rows: Row[] = [];
  const check = (pair: string, fg: Rgba, on: Rgba, min: number) =>
    rows.push({ theme, pair, ratio: contrastRatio(composite(fg, on), on), min });

  for (const [surfaceName, surface] of Object.entries(surfaces)) {
    for (const text of [
      "foreground",
      "muted-foreground",
      "muted-subtle",
      "accent",
      "positive",
      "caution",
      "risk",
      "destructive",
      "chart-tick-fill",
    ]) {
      check(`--${text} on --${surfaceName}`, color(text), surface, TEXT);
    }
  }
  for (const s of ["positive", "caution", "risk"]) {
    check(`--${s} on --${s}-wash`, color(s), composite(color(`${s}-wash`), bg), TEXT);
  }
  check("--primary-foreground on --primary", color("primary-foreground"), color("primary"), TEXT);
  check("--home-signal-ink on --home-signal", color("home-signal-ink"), color("home-signal"), TEXT);
  check("focus ring (--home-signal) on --background", color("home-signal"), bg, FOCUS);

  // The compatibility layer: hard-coded text-zinc-* utilities as they actually render.
  for (const shade of Object.keys(TAILWIND_ZINC)) {
    const override = readDeclarations(css, `html.${theme} .text-zinc-${shade}`).color;
    const rendered = parseColor(override ?? TAILWIND_ZINC[shade])!;
    check(`.text-zinc-${shade} on --background`, rendered, bg, TEXT);
  }
  return rows;
}

const rows = [...rowsFor("light"), ...rowsFor("dark")];

if (process.env.CONTRAST_REPORT) {
  const lines = rows.map(
    (r) =>
      `${r.ratio >= r.min ? "pass" : "FAIL"}  ${r.theme.padEnd(5)}  ${r.ratio.toFixed(2).padStart(5)}:1 (min ${r.min})  ${r.pair}`,
  );
  console.log(`\nTheme contrast (WCAG 2.2 AA)\n${lines.join("\n")}\n`);
}

describe("theme contrast meets WCAG 2.2 AA", () => {
  it.each(rows.map((r) => [`${r.theme}: ${r.pair}`, r] as const))("%s", (_name, r) => {
    expect(r.ratio, `${r.ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(r.min);
  });
});

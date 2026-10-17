import { describe, expect, it, vi } from "vitest";
import { insightsFrom, mkRun } from "@/lib/coaching-context/__tests__/fixtures";
import { buildDemoImport, demoRaceGoal } from "@/lib/demo/generateDemoData";
import { computeInsights } from "@/lib/analytics";
import { buildRaceForecastInput, buildRaceForecastV2 } from "@/lib/forecasting-v2";
import { buildTodaySessionInput, recommendTodaySession } from "@/lib/training/todaySession";
import type { RunActivity } from "@/lib/strava/types";
import type { RaceGoal } from "@/lib/analytics/readiness";

/**
 * Phase 0 of the load-balance rework: a recorded baseline of what the current
 * freshness model says, so the later phases (one load unit, a sufficiency gate, the
 * "only when it changes the recommendation" rule) show their effect as a reviewable
 * diff of `__snapshots__/load-balance-baseline.txt` instead of moving numbers silently.
 *
 * **This test asserts nothing about correctness.** Several rows are known to be wrong
 * — that is the point of recording them. A diff here is expected in phases 1–3; review
 * it, then update with `npx vitest run -u lib/analytics/__tests__/loadBalanceBaseline.test.ts`.
 *
 * Deterministic: the clock is pinned to noon UTC on each day of one fixed week, which
 * keeps every calendar date the same in any time zone from UTC−11 to UTC+11. Fixtures
 * are built under the pinned clock because `mkRun` dates runs relative to "now".
 */

const WEEK = [12, 13, 14, 15, 16, 17, 18].map((d) => Date.UTC(2026, 9, d, 12));

type Kind = "easy" | "long" | "tempo";

/** Per-run load fields as each import path actually delivers them. */
type Source = "csv-full" | "csv-mixed" | "api" | "no-hr";

const SESSION: Record<
  Kind,
  { distanceM: number; movingSec: number; avgHr: number; tl: number; re: number }
> = {
  easy: { distanceM: 10_000, movingSec: 3300, avgHr: 145, tl: 60, re: 45 },
  long: { distanceM: 18_000, movingSec: 6300, avgHr: 150, tl: 140, re: 110 },
  tempo: { distanceM: 12_000, movingSec: 3300, avgHr: 168, tl: 120, re: 105 },
};

function run(daysAgo: number, kind: Kind, source: Source, index: number, scale = 1): RunActivity {
  const s = SESSION[kind];
  const base = mkRun(daysAgo, {
    distanceM: Math.round(s.distanceM * scale),
    movingSec: Math.round(s.movingSec * scale),
    avgHr: source === "no-hr" ? null : s.avgHr,
    id: `r-${daysAgo}-${index}`,
  });
  return {
    ...base,
    // csv-full: Strava's Training Load and Relative Effort on every run.
    // csv-mixed: Training Load on roughly two runs in three, as in a real export (37/57).
    // api: the API path never sets trainingLoad; Relative Effort comes from suffer_score.
    // no-hr: neither, so only distance is left.
    trainingLoad:
      source === "csv-full" || (source === "csv-mixed" && index % 3 !== 0)
        ? Math.round(s.tl * scale)
        : null,
    relativeEffort: source === "no-hr" ? null : Math.round(s.re * scale),
  };
}

/** An every-other-day block: easy, easy, tempo, long — `count` runs ending `gapDays` ago. */
function block(count: number, source: Source, gapDays = 0, lastWeekScale = 1): RunActivity[] {
  const kinds: Kind[] = ["easy", "easy", "tempo", "long"];
  return Array.from({ length: count }, (_, i) => {
    const daysAgo = gapDays + (count - i) * 2;
    return run(daysAgo, kinds[i % 4], source, i, daysAgo <= 7 ? lastWeekScale : 1);
  });
}

function goal(): RaceGoal {
  return {
    distance: "hm",
    date: new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10),
  };
}

const FIXTURES: Record<string, () => { runs: RunActivity[]; demo?: boolean }> = {
  "steady/csv-full": () => ({ runs: block(40, "csv-full") }),
  "steady/csv-mixed": () => ({ runs: block(40, "csv-mixed") }),
  "steady/api": () => ({ runs: block(40, "api") }),
  "steady/no-hr": () => ({ runs: block(40, "no-hr") }),
  "new/1wk": () => ({ runs: block(3, "csv-full") }),
  "new/3wk": () => ({ runs: block(10, "csv-full") }),
  "new/6wk": () => ({ runs: block(21, "csv-full") }),
  sporadic: () => ({
    runs: [40, 31, 22, 12, 3].map((d, i) => run(d, "easy", "csv-full", i)),
  }),
  "spike/last7d×2": () => ({ runs: block(40, "csv-full", 0, 2) }),
  "rusty/10d-gap": () => ({ runs: block(40, "csv-full", 10) }),
  "detrained/20d-gap": () => ({ runs: block(40, "csv-full", 20) }),
  demo: () => ({ runs: [], demo: true }),
};

const COLUMNS = [
  "fixture",
  "day",
  "ctl",
  "atl",
  "tsb",
  "form%",
  "fresh",
  "label",
  "balance",
  "currency",
  "proxy",
  "today",
  "fc.fresh",
  "fc.likely",
  "fc.base",
] as const;

const hms = (sec: number) =>
  `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

function row(name: string, build: () => { runs: RunActivity[]; demo?: boolean }): string[] {
  const { runs, demo } = build();
  let analytics;
  let raceGoal: RaceGoal;
  let allRuns = runs;
  if (demo) {
    const now = new Date();
    const data = buildDemoImport(now);
    raceGoal = demoRaceGoal(now);
    analytics = computeInsights(data, [], 3, raceGoal);
    allRuns = data.runs;
  } else {
    raceGoal = goal();
    analytics = insightsFrom(runs, raceGoal).analytics;
  }
  const f = analytics.fatigue;
  const today = recommendTodaySession(buildTodaySessionInput(analytics));
  const input = buildRaceForecastInput({ runs: allRuns, analytics, goal: raceGoal });
  const forecast = input ? buildRaceForecastV2(input) : null;
  return [
    name,
    new Date().toUTCString().slice(0, 3),
    String(f.ctl),
    String(f.atl),
    String(f.tsb),
    String(f.formPct),
    String(f.freshness),
    f.label,
    f.readiness.balance,
    f.readiness.currency,
    f.usesProxyLoad ? "yes" : "no",
    today.kind,
    forecast ? String(forecast.componentScores.freshness) : "-",
    forecast ? hms(forecast.mostLikelyTimeSec) : "-",
    forecast ? hms(forecast.capabilityBaseTimeSec) : "-",
  ];
}

function table(rows: string[][]): string {
  const all = [[...COLUMNS], ...rows];
  const widths = COLUMNS.map((_, c) => Math.max(...all.map((r) => r[c].length)));
  return (
    all
      .map((r) =>
        r
          .map((cell, c) => cell.padEnd(widths[c]))
          .join("  ")
          .trimEnd(),
      )
      .join("\n") + "\n"
  );
}

/**
 * 84 full analytics + forecast runs: under a second alone, but CI's coverage job runs
 * it instrumented alongside every other file and measured 5.1 s, over Vitest's 5 s
 * default. The budget is for that contention, not for a slow test.
 */
const BASELINE_TIMEOUT_MS = 30_000;

describe("load-balance baseline (phase 0)", () => {
  it(
    "records the current freshness model across fixtures and weekdays",
    { timeout: BASELINE_TIMEOUT_MS },
    async () => {
      // test/time-travel.ts may already have faked Date; reuse it rather than undo it.
      const alreadyFaked = vi.isFakeTimers();
      const restoreTo = Date.now();
      if (!alreadyFaked) vi.useFakeTimers({ toFake: ["Date"] });
      const rows: string[][] = [];
      try {
        for (const [name, build] of Object.entries(FIXTURES)) {
          for (const instant of WEEK) {
            vi.setSystemTime(instant);
            rows.push(row(name, build));
          }
        }
      } finally {
        if (alreadyFaked) vi.setSystemTime(restoreTo);
        else vi.useRealTimers();
      }
      await expect(table(rows)).toMatchFileSnapshot("./__snapshots__/load-balance-baseline.txt");
    },
  );
});

import path from "path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(__dirname, ".") };

// A git worktree checked out inside the repo (e.g. .claude/worktrees/*) carries a
// full copy of the suite; without this the run collects every test twice and
// reports doubled counts.
//
// `.eval/` is the same hazard from the other direction: it is a git-ignored scratch
// area, so a throwaway probe written as a `.test.ts` joins `npm run check` locally
// while being invisible in CI and to everyone else.
// e2e/ is Playwright's (npm run test:e2e); its *.spec.ts would match Vitest's default.
const exclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/.claude/**",
  "**/.eval/**",
  "e2e/**",
];

// Clock displacement is opt-in via PROBE_NOW and costs nothing when unset — see
// test/time-travel.ts. Listed first so it runs before any other setup.
const timeTravel = "./test/time-travel.ts";

/**
 * Two projects, because the two kinds of test have genuinely different needs.
 *
 * The node project is everything that existed before: server code, analytics, parsing.
 * It must keep running without a DOM — several of those modules guard on
 * `typeof window === "undefined"`, and giving them a jsdom global would quietly stop
 * testing the server path they exist to cover.
 *
 * The ui project adds jsdom and Testing Library for component tests only. Scoping it
 * this way also keeps the ~1250 existing tests at their current speed, since jsdom
 * setup costs roughly a second per file.
 */
export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "node",
          environment: "node",
          setupFiles: [timeTravel],
          exclude: [...exclude, "components/**", "hooks/**", "app/**/__tests__/**/*.ui.test.*"],
        },
      },
      {
        // No @vitejs/plugin-react: its current major reaches @babel/core 8.0.0-rc
        // through a peer chain, and a release-candidate compiler is not worth pulling
        // in to run tests. tsconfig sets `jsx: react-jsx`, which Vite's esbuild
        // transform honours on its own — the plugin's real job is Fast Refresh, which
        // a test run has no use for.
        resolve: { alias },
        test: {
          name: "ui",
          environment: "jsdom",
          setupFiles: [timeTravel, "./test/ui-setup.ts"],
          include: [
            "components/**/*.test.{ts,tsx}",
            "hooks/**/*.test.{ts,tsx}",
            "app/**/*.ui.test.{ts,tsx}",
          ],
          exclude,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "text", "html"],
      /**
       * A ratchet, not a target.
       *
       * These sit a few points under what the suite actually reaches, so ordinary churn
       * never trips them and a real regression does. Deleting a covered module or
       * landing a large uncovered feature moves the number by more than the margin;
       * refactoring inside tested code does not.
       *
       * Measured 2026-08-09 **without a database**, which is the lower of the two
       * numbers: statements 63.0, branches 52.7, functions 56.7, lines 63.6. CI runs
       * these suites against Postgres and reads higher. The floors are set against the
       * no-database figure on purpose — a developer running `npm run test:coverage` on a
       * laptop must not fail a check that CI would pass.
       *
       * Raise them when a deliberate push lifts real coverage. Do not raise them to
       * whatever the number happens to be today; that turns every unrelated PR into a
       * coverage negotiation.
       */
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 53,
        lines: 60,
      },
      // Report on shipped code; skip tests, fixtures, types, and generated files.
      include: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "hooks/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
        "stores/**/*.{ts,tsx}",
      ],
      exclude: ["**/__tests__/**", "**/*.test.*", "**/*.d.ts", "**/types.ts", "**/fixtures*.ts"],
    },
  },
  resolve: { alias },
});

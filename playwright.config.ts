import { defineConfig } from "@playwright/test";

/**
 * Viewport contract (e2e/): layout rules checked in a real browser against a production
 * build, at phone, tablet and laptop sizes. Run `npm run build` first; Playwright starts
 * `next start` itself and stops it afterwards, so no server is left running.
 *
 * Port 3100 keeps clear of the dev server (3000) and the local review build (3001).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  // One worker locally: a production server plus a browser per worker is heavy.
  workers: CI ? 2 : 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /demo\.setup\.ts/ },
    { name: "viewport", testMatch: /\.spec\.ts/, dependencies: ["setup"] },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/home`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});

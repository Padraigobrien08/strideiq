import { test as setup, expect } from "@playwright/test";
import { STATE } from "./viewports";

/**
 * Loads the demo athlete the way a visitor does ("Try the demo"), then saves two browser
 * states for the viewport tests: one with a plan saved for the current week, one without.
 * Everything the app needs lives in localStorage, which `storageState` carries.
 */

setup("demo athlete, with and without this week's plan", async ({ page }) => {
  await page.goto("/home");
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    localStorage.setItem(
      "strideiq-theme-v1",
      JSON.stringify({ state: { theme: "light" }, version: 0 }),
    );
  });
  await page.context().storageState({ path: STATE.noPlan });

  // A full week for whichever week is current, so the suite runs on any date.
  await page.evaluate(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const monday = new Date();
    monday.setHours(12, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const day = (i: number) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d;
    };
    const names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const plan: Record<string, unknown>[] = [
      { type: "easy", title: "Easy aerobic run", intensity: "easy", distanceKm: 8 },
      { type: "tempo", title: "Tempo 3 × 10 min", intensity: "hard", distanceKm: 10 },
      { modality: "rest", type: "rest", title: "Rest", intensity: "rest" },
      { type: "easy", title: "Easy run", intensity: "easy", distanceKm: 6 },
      { type: "interval", title: "6 × 800 m", intensity: "hard", distanceKm: 9 },
      { type: "long", title: "Long run", intensity: "moderate", distanceKm: 16 },
      { modality: "rest", type: "rest", title: "Rest", intensity: "rest" },
    ];
    const now = new Date().toISOString();
    const weekStart = iso(day(0));
    const workouts = plan.map((p, i) => ({
      id: `e2e-${iso(day(i))}`,
      date: iso(day(i)),
      day: names[i],
      modality: "run",
      purpose: "Keeps the week balanced.",
      status: "planned",
      createdAt: now,
      updatedAt: now,
      ...p,
    }));
    const week = {
      id: `week-${weekStart}`,
      weekStart,
      weekEnd: iso(day(6)),
      source: "manual",
      summary: "Build week",
      workouts,
      evidenceUsed: [],
      constraintsApplied: [],
      risksManaged: [],
      limitations: [],
      confidence: "medium",
      savedAt: now,
      updatedAt: now,
      revision: 1,
    };
    const key = "strideiq-training-calendar-v1";
    const raw = JSON.parse(localStorage.getItem(key) ?? '{"version":1,"weeks":{}}');
    raw.weeks[weekStart] = week;
    localStorage.setItem(key, JSON.stringify(raw));
  });
  await page.context().storageState({ path: STATE.plan });
});

import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { STATE, VIEWPORTS, hasFirstScreenRules, type Viewport } from "./viewports";

/**
 * The viewport contract. Rules (agreed after the Phase 3a viewport audit):
 *
 *  1. Every page, 320–1920 px: no sideways scroll, and the page lays out at the device's
 *     own width (a fixed min-width that makes a phone zoom out fails too).
 *  2. Today, first screen: session title, figures, primary action and race status are
 *     visible without scrolling, at every size from 375×667 up.
 *  3. Today, whole page: fits one screen on laptops of 1280×720 and up.
 *  4. Training, first screen: on laptops of 1280×720 and up the strip, the selected
 *     day's title, its status and its primary action are visible; on phones from
 *     375×667 the strip is.
 *  5. Wide screens: Today's and Training's content is capped (~1360 px) and centred.
 *  6. Progress: rule 1 only, until Phase 4 redesigns it.
 *
 * Every run attaches a first-screen screenshot per page and size, so the layouts can be
 * reviewed by eye from the report without brittle pixel diffs.
 */

const CONTENT_MAX = 1360;

/** Pages held to rule 1. Today, Training and Progress also get their own rules below. */
const PAGES = [
  "/home",
  "/training",
  "/progress",
  "/progress/load",
  "/performance",
  "/intelligence",
  "/runs",
  "/coach",
];

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  // Loaded: skeletons gone and web fonts in, so measurements are of the real layout.
  await expect(page.locator(".skeleton-shimmer")).toHaveCount(0, { timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Fully inside the first screen (the page as it opens, before any scrolling). */
async function expectInFirstScreen(locator: Locator, v: Viewport, what: string) {
  await expect(locator, `${what} is on the page`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${what} has a box`).not.toBeNull();
  expect(
    Math.round(box!.y + box!.height),
    `${what} ends within the first screen (${v.height}px)`,
  ).toBeLessThanOrEqual(v.height);
}

async function attachScreen(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { body: await page.screenshot(), contentType: "image/png" });
}

for (const v of VIEWPORTS) {
  test.describe(v.name, () => {
    test.use({
      viewport: { width: v.width, height: v.height },
      isMobile: v.mobile,
      hasTouch: v.mobile,
      storageState: STATE.plan,
    });

    test("rule 1: no page scrolls sideways or lays out wider than the device", async ({
      page,
    }, info) => {
      for (const path of PAGES) {
        await open(page, path);
        const m = await page.evaluate((deviceWidth) => {
          // The innermost elements reaching past the device edge, so a failure names
          // what to fix (an element inside its own scroll container is fine).
          const wide = [...document.querySelectorAll("main *")].filter((e) => {
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.right > deviceWidth + 1;
          });
          const culprits = wide
            .filter((e) => ![...e.children].some((c) => wide.includes(c)))
            .slice(0, 3)
            .map((e) => {
              const text = (e.textContent ?? "").trim().slice(0, 40);
              return `<${e.tagName.toLowerCase()}> "${text}" to ${Math.round(e.getBoundingClientRect().right)}px`;
            });
          return {
            layoutWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            culprits: culprits.join("; ") || "none found in main",
          };
        }, v.width);
        expect
          .soft(m.layoutWidth, `${path}: lays out at the device width (${m.culprits})`)
          .toBe(v.width);
        expect
          .soft(m.scrollWidth, `${path}: no sideways scroll (${m.culprits})`)
          .toBeLessThanOrEqual(v.width);
        await attachScreen(page, info, `${path} first screen`);
      }
    });

    test("Today: the answer is on the first screen, and fits one laptop screen", async ({
      page,
    }, info) => {
      await open(page, "/home");
      await attachScreen(page, info, "today first screen");
      if (hasFirstScreenRules(v)) {
        const main = page.locator("main");
        await expectInFirstScreen(main.getByRole("heading", { level: 1 }), v, "session title");
        await expectInFirstScreen(main.locator("dl").first(), v, "session figures");
        await expectInFirstScreen(
          main.getByRole("link", { name: /^Ask about (this run|today)$/ }),
          v,
          "primary action",
        );
        // The outlook's status row on laptops; the status chip by the date where the
        // outlook drops below the session (phones and tablets).
        const raceStatus = main
          .getByRole("complementary", { name: "Race outlook" })
          .locator("dl")
          .or(main.getByRole("link", { name: /^Race status:/ }))
          .filter({ visible: true })
          .first();
        await expectInFirstScreen(raceStatus, v, "race status");
      }
      if (v.laptop) {
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        expect(height, `Today fits one ${v.height}px screen`).toBeLessThanOrEqual(v.height);
      }
    });

    test("Today without a saved plan still fits one laptop screen", async ({ browser }, info) => {
      test.skip(!v.laptop, "rule 3 applies to laptops of 1280×720 and up");
      const context = await browser.newContext({
        viewport: { width: v.width, height: v.height },
        storageState: STATE.noPlan,
        colorScheme: "light",
      });
      const page = await context.newPage();
      await open(page, "/home");
      await attachScreen(page, info, "today (no plan) first screen");
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      expect(height, `Today (no plan) fits one ${v.height}px screen`).toBeLessThanOrEqual(v.height);
      await context.close();
    });

    test("Training: the week and the selected day are on the first screen", async ({
      page,
    }, info) => {
      await open(page, "/training");
      await attachScreen(page, info, "training first screen");
      if (!hasFirstScreenRules(v)) return;
      await expectInFirstScreen(
        page.getByRole("list", { name: "Days this week" }),
        v,
        "week strip",
      );
      if (!v.laptop) return;
      await expectInFirstScreen(page.locator("#training-day-title"), v, "selected day title");
      const status = page.getByRole("complementary", { name: "Session status" });
      await expectInFirstScreen(status.locator("span").first(), v, "selected day status");
      await expectInFirstScreen(status.getByRole("link").first(), v, "selected day action");
    });

    test("rule 1 holds with Training's session editor open (Phase 3b)", async ({ page }, info) => {
      await open(page, "/training");
      // Any day still to come has an editable session; walk back from Sunday to find
      // one, so the check works whatever day the suite runs on.
      const days = page.getByRole("list", { name: "Days this week" }).getByRole("button");
      const edit = page.getByRole("button", { name: "Edit session" });
      for (let i = (await days.count()) - 1; i >= 0 && !(await edit.isVisible()); i--) {
        await days.nth(i).click();
      }
      test.skip(!(await edit.isVisible()), "no editable session left this week");
      await edit.click();
      await expect(page.getByRole("form", { name: /^Edit / })).toBeVisible();
      const m = await page.evaluate(() => ({
        layoutWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect.soft(m.layoutWidth, "editor open: lays out at the device width").toBe(v.width);
      expect.soft(m.scrollWidth, "editor open: no sideways scroll").toBeLessThanOrEqual(v.width);
      await page.getByRole("form", { name: /^Edit / }).scrollIntoViewIfNeeded();
      await attachScreen(page, info, "training editor open");
    });

    test("rule 5: Today and Training are capped and centred on wide screens", async ({ page }) => {
      test.skip(v.width <= CONTENT_MAX + 64, "only wider than the cap");
      for (const path of ["/home", "/training"]) {
        await open(page, path);
        const box = await page.locator("main [data-content-cap]").boundingBox();
        expect(box, `${path}: has a capped content column`).not.toBeNull();
        expect
          .soft(box!.width, `${path}: content no wider than ${CONTENT_MAX}px`)
          .toBeLessThanOrEqual(CONTENT_MAX);
        const left = box!.x;
        const right = v.width - (box!.x + box!.width);
        expect.soft(Math.abs(left - right), `${path}: content centred`).toBeLessThanOrEqual(24);
      }
    });
  });
}

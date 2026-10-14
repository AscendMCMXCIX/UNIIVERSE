import { expect, test, type Page } from "@playwright/test";
import { startDraft } from "./draft-flow";
import { AxeBuilder } from "@axe-core/playwright";

/*
  Phase 3 quality gates, run once (desktop project) with explicit viewports:
    - no page is wider than the screen from 320 px phones to 1920 px desktops, including short
      landscape heights, and every page keeps its heading;
    - automated accessibility (axe, WCAG 2.1 A/AA): no critical or serious violations.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const PLAYER_ROUTES = ["/team", "/players", "/draft", "/matches", "/overview", "/overview/champions", "/overview/blocks", "/overview/matches", "/trends", "/settings"];
const ADMIN_ROUTES = ["/admin/people", "/admin/people/access", "/admin/competition", "/admin/data", "/admin/branding", "/admin/system"];
const SIZES: Array<[number, number]> = [
  [320, 640],
  [375, 667],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [844, 390], // phone in landscape
  [1366, 600], // short laptop window
];

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

test.describe("layout across screen sizes", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once with explicit viewports"));

  test("player pages fit every width", async ({ page }) => {
    test.setTimeout(240_000);
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      for (const route of PLAYER_ROUTES) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        expect(await overflow(page), `${route} at ${width}x${height}`).toBeLessThanOrEqual(1);
        await expect(page.locator("main h1, main h2").first(), `${route} heading at ${width}x${height}`).toBeVisible();
      }
    }
  });

  test("admin pages fit phone and desktop widths", async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
    for (const [width, height] of [[320, 640], [390, 844], [1024, 768], [1366, 768], [1920, 1080]] as const) {
      await page.setViewportSize({ width, height });
      for (const route of ADMIN_ROUTES) {
        await page.goto(route);
        await page.waitForLoadState("networkidle");
        expect(await overflow(page), `${route} at ${width}x${height}`).toBeLessThanOrEqual(1);
      }
    }
  });

  test("the draft room fits every width and keeps the desktop workspace in one screen", async ({ page }) => {
    test.setTimeout(120_000);
    const room = await startDraft(page);
    for (const [width, height] of SIZES) {
      await page.setViewportSize({ width, height });
      await page.goto(room);
      await page.waitForLoadState("networkidle");
      expect(await overflow(page), `draft room at ${width}x${height}`).toBeLessThanOrEqual(1);
      await expect(page.getByTestId("current-action")).toBeVisible();
      if (width >= 1280 && height >= 720) {
        const ws = (await page.getByTestId("draft-workspace").boundingBox())!;
        expect(ws.y + ws.height, `workspace fits at ${width}x${height}`).toBeLessThanOrEqual(height + 1);
      }
    }
  });
});

test.describe("accessibility", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  async function audit(page: Page, label: string) {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(blocking.map((v) => `${v.id}: ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")})`), label).toEqual([]);
  }

  test("player pages have no critical or serious violations", async ({ page }) => {
    test.setTimeout(120_000);
    for (const route of PLAYER_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await audit(page, route);
    }
    const room = await startDraft(page);
    await page.goto(room);
    await page.waitForLoadState("networkidle");
    await audit(page, "draft room");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(room);
    await page.waitForLoadState("networkidle");
    await audit(page, "draft room (phone)");
  });

  test("admin pages have no critical or serious violations", async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
    for (const route of ADMIN_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await audit(page, route);
    }
  });
});

test.describe("shell, motion and notifications", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  test("the sidebar stays in view while a long page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 600 });
    await page.goto("/team");
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toBeVisible();
    const before = (await sidebar.boundingBox())!;
    // Wheel over the page content: at the default pointer position (0, 0) the wheel lands on the
    // sidebar, which scrolls itself instead of the page whenever its own content overflows.
    await expect(page.getByTestId("lineup-overview")).toBeVisible();
    await page.mouse.move(900, 300);
    // Under load the first wheel can land before the page has its full height: retry until it scrolls.
    await expect
      .poll(async () => {
        await page.mouse.wheel(0, 2000);
        return page.evaluate(() => window.scrollY);
      })
      .toBeGreaterThan(200);
    const after = (await sidebar.boundingBox())!;
    expect(after.y).toBe(before.y);
    expect(after.height).toBeLessThanOrEqual(600 + 1);
  });

  test("a collapsed sidebar opens while pointed at and folds back when the pointer leaves", async ({ page }) => {
    await page.goto("/team");
    const aside = page.locator("aside");
    await aside.getByTestId("sidebar-toggle").click();
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    // Still under the pointer right after collapsing: no preview until the pointer leaves once.
    await page.waitForTimeout(400);
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    await page.mouse.move(900, 400);
    await page.mouse.move(30, 300);
    await expect(aside).toHaveAttribute("data-peek", "true");
    await expect(aside).toHaveAttribute("data-collapsed", "false");
    // The preview overlays the page: the content does not move.
    const slot = (await page.getByTestId("sidebar-slot").boundingBox())!;
    expect(Math.round(slot.width)).toBe(72);
    await page.mouse.move(900, 400);
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    // Hovering never changed the saved choice.
    await page.reload();
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "true");
    await page.locator("aside").getByTestId("sidebar-toggle").click();
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "false");
  });

  test("reduced motion switches animations and transitions off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/team");
    const durations = await page.evaluate(() => {
      const card = document.querySelector("[data-testid^=lineup-row-]");
      const style = card ? getComputedStyle(card) : null;
      return style ? [style.animationDuration, style.transitionDuration] : [];
    });
    expect(durations.length).toBe(2);
    for (const d of durations) expect(parseFloat(d)).toBeLessThanOrEqual(0.01);
  });

  test("saving shows a notification; an empty tagline shows nothing", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
    await page.goto("/admin/branding");
    await page.locator("#brand-tagline").fill("Draft together");
    await page.getByRole("button", { name: "Save name and colours" }).click();
    await expect(page.getByText("Branding saved.")).toBeVisible();
    await page.goto("/team");
    await expect(page.getByTestId("sidebar").getByText("Draft together")).toHaveCount(0); // Admin mode shows "Admin mode" instead
    await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
    await page.goto("/team");
    await expect(page.getByTestId("sidebar").getByText("Draft together")).toBeVisible();
    // Back to no tagline: nothing is shown in its place.
    await context.addCookies([{ name: "uniiverse_view", value: "admin", url: baseURL! }]);
    await page.goto("/admin/branding");
    await page.locator("#brand-tagline").fill("");
    await page.getByRole("button", { name: "Save name and colours" }).click();
    await expect(page.getByText("Branding saved.")).toBeVisible();
    await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
    await page.goto("/team");
    await expect(page.getByTestId("sidebar").getByText("Draft together")).toHaveCount(0);
  });
});

import { expect, test, type Page } from "@playwright/test";
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

const PLAYER_ROUTES = ["/team", "/players", "/draft", "/matches", "/overview", "/trends", "/settings"];
const ADMIN_ROUTES = ["/admin/players", "/admin/users", "/admin/competition", "/admin/data", "/admin/branding", "/admin/system"];
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

async function startDraft(page: Page): Promise<string> {
  await page.goto("/draft");
  await page.locator("main button[type=submit]").click();
  await page.waitForURL(/\/draft\/[0-9a-f-]+/);
  return new URL(page.url()).pathname.replace(/\/prepare$/, "");
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

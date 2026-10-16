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

const PLAYER_ROUTES = ["/team", "/players", "/leaderboards", "/draft", "/matches", "/overview", "/overview/champions", "/overview/blocks", "/overview/matches", "/trends/solo", "/trends/pro", "/settings"];
const ADMIN_ROUTES = ["/admin/people", "/admin/people/access", "/admin/competition", "/admin/data", "/admin/branding", "/admin/system"];
const SIZES: Array<[number, number]> = [
  [320, 640],
  [375, 667],
  [390, 844],
  [430, 932],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [3440, 1440], // ultrawide
  [3840, 2160],
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
    // Games played together: a page that is always several screens long (Team fits about one).
    await page.goto("/matches");
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toBeVisible();
    const before = (await sidebar.boundingBox())!;
    // Wheel over the page content: at the default pointer position (0, 0) the wheel lands on the
    // sidebar, which scrolls itself instead of the page whenever its own content overflows.
    await expect(page.getByTestId("played-together")).toBeVisible();
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
    // The rail holds the group icons only; the current page's group (Team) keeps its accent marker.
    const teamLinks = aside.getByRole("group", { name: "Team" });
    await expect.poll(async () => (await teamLinks.boundingBox())?.height ?? 0).toBeLessThan(2);
    const marker = aside.getByTestId("nav-group-team-toggle").getByTestId("nav-group-marker");
    expect(await marker.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    const icon = aside.getByTestId("nav-group-trends-toggle").locator("svg").first();
    const iconBefore = (await icon.boundingBox())!;
    // Collapsed, the hidden labels are clipped away: the page next to the icons stays clickable.
    expect(await page.evaluate(() => document.elementFromPoint(160, 300)?.closest("aside") === null)).toBe(true);
    await page.mouse.move(30, 300);
    await expect(aside).toHaveAttribute("data-peek", "true");
    await expect(aside).toHaveAttribute("data-collapsed", "false");
    // Pointing at the rail reveals every group as it was left.
    await expect.poll(async () => (await teamLinks.boundingBox())?.height ?? 0).toBeGreaterThan(100);
    await expect(aside.getByRole("link", { name: "Players" })).toBeInViewport();
    // The preview overlays the page: the content does not move, and neither does the first icon.
    const slot = (await page.getByTestId("sidebar-slot").boundingBox())!;
    expect(Math.round(slot.width)).toBe(72);
    const iconAfter = (await icon.boundingBox())!;
    expect(Math.abs(iconAfter.x - iconBefore.x) + Math.abs(iconAfter.y - iconBefore.y)).toBeLessThan(1);
    await page.mouse.move(900, 400);
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    // Hovering never changed the saved choice.
    await page.reload();
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "true");
    await page.locator("aside").getByTestId("sidebar-toggle").click({ position: { x: 24, y: 16 } });
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

/** A teammate's profile Overview (the demo's local owner has no player profile of its own). */
async function openTeammateProfile(page: Page) {
  await page.goto("/players");
  await page.getByTestId("player-card").first().click();
  await page.waitForURL(/\/players\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("season-summary")).toBeVisible();
}

test.describe("tooltips", () => {
  test("open on hover and close when the pointer leaves; keyboard focus and Escape; never clipped", async ({ page, isMobile }) => {
    test.skip(!!isMobile, "pointer hover is a desktop behaviour");
    await openTeammateProfile(page);
    const tip = page.locator("[data-testid=info-tip]:visible").first();
    await tip.scrollIntoViewIfNeeded();
    await tip.hover();
    const bubble = page.getByTestId("info-tip-bubble");
    await expect(bubble).toBeVisible();
    // Drawn in the layer above the page (not inside the card), and entirely on screen.
    expect(await bubble.evaluate((el) => el.parentElement === document.body)).toBe(true);
    const box = (await bubble.boundingBox())!;
    const vw = page.viewportSize()!.width;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vw);
    // A click while hovering keeps it open.
    await tip.click();
    await expect(bubble).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(bubble).toHaveCount(0);
    // Keyboard: focus arriving (the click above left it focused, so move it away first).
    await tip.blur();
    await tip.focus();
    await expect(bubble).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveCount(0);
  });

  test("a tap opens it, and a tap elsewhere closes it", async ({ page, isMobile }) => {
    test.skip(!isMobile, "touch behaviour");
    await openTeammateProfile(page);
    const tip = page.locator("[data-testid=info-tip]:visible").first();
    await tip.scrollIntoViewIfNeeded();
    await tip.tap();
    const bubble = page.getByTestId("info-tip-bubble");
    await expect(bubble).toBeVisible();
    const box = (await bubble.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.locator("h1, h2").first().tap();
    await expect(bubble).toHaveCount(0);
    // Tapping the ⓘ again toggles it.
    await tip.tap();
    await expect(bubble).toBeVisible();
    await tip.tap();
    await expect(bubble).toHaveCount(0);
  });
});

test.describe("solo queue blocks", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  test("a block starts at 0 Games in one click, with no target, and the layout follows the workflow", async ({ page }) => {
    await page.goto("/overview/blocks");
    // Blocks belong to a player profile; the in-memory demo's local owner has none.
    test.skip((await page.getByText("has no player profile").count()) > 0, "needs an account with a player profile (covered by tests/db/blocks-refinement.test.ts)");
    await expect(page.getByTestId("ranked-focus")).toBeVisible();
    if (await page.getByTestId("start-block").count()) {
      await expect(page.getByTestId("add-game")).toContainText(/Starts BLOCK \d{3}/);
      await page.getByTestId("start-block-submit").click();
    }
    await expect(page.getByTestId("current-block")).toBeVisible();
    await expect(page.getByTestId("block-progress")).toHaveText(/^(\d+ Games?|\d+ of \d+ games.*)$/);
    // No default target: no empty slot hints at a limit.
    await expect(page.getByTestId("block-slots").locator("[data-next]")).toHaveCount(0);
    await expect(page.getByTestId("add-game")).toContainText(/Goes into BLOCK \d{3}/);
    // Workflow order on the page: the current block first, then its games and the previous blocks;
    // Quick Add and the ranked focus beside them.
    const tops = await Promise.all(["current-block", "block-games", "latest-blocks"].map(async (id) => (await page.getByTestId(id).boundingBox())!.y));
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    expect((await page.getByTestId("add-game").boundingBox())!.y).toBeLessThanOrEqual(tops[1]!);
  });
});

test.describe("sidebar groups", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  test("the group of the current page can be closed, keeps a marker, and stays closed across pages and reloads", async ({ page }) => {
    await page.goto("/trends/solo");
    const aside = page.locator("aside");
    const group = aside.getByTestId("nav-group-trends");
    await expect(group).toHaveAttribute("data-open", "true");
    // Order: My Profile (one link), Team, Meta & Trends.
    const order = await aside.locator("a[href='/overview'], [data-testid^=nav-group-][data-open]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? e.getAttribute("href")));
    expect(order).toEqual(["/overview", "nav-group-team", "nav-group-trends"]);
    await aside.getByTestId("nav-group-trends-toggle").click();
    await expect(group).toHaveAttribute("data-open", "false");
    await expect(group).toHaveAttribute("data-current", "true");
    await expect(page).toHaveURL(/\/trends\/solo/);
    await page.reload();
    await expect(page.locator("aside").getByTestId("nav-group-trends")).toHaveAttribute("data-open", "false");
    await page.goto("/trends/pro");
    await expect(page.locator("aside").getByTestId("nav-group-trends")).toHaveAttribute("data-open", "false");
    // Reopened only on purpose.
    await page.locator("aside").getByTestId("nav-group-trends-toggle").click();
    await expect(page.locator("aside").getByTestId("nav-group-trends")).toHaveAttribute("data-open", "true");
  });

  test("My Profile is one sidebar link; its sections are the bar on the page, and every section address still works", async ({ page }) => {
    await page.goto("/overview/matches");
    const aside = page.locator("aside");
    const link = aside.getByRole("link", { name: "My Profile" });
    // Marked on every section of your profile; the sections themselves are not repeated in the sidebar.
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(aside.getByRole("link", { name: "Match History" })).toHaveCount(0);
    const tabs = page.getByTestId("profile-tabs");
    await expect(tabs.getByRole("link", { name: "Match History" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Solo Queue Blocks" }).click();
    await expect(page).toHaveURL(/\/overview\/blocks/);
    await expect(link).toHaveAttribute("aria-current", "page");
    await link.click();
    await expect(page).toHaveURL(/\/overview$/);
  });
});

test.describe("large screens", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "runs once"));

  test("the layout grows with the window instead of staying small, and stays unchanged at laptop size", async ({ page }) => {
    const root = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/team");
    expect(await root()).toBe(16);
    // Resized live, without reloading.
    await page.setViewportSize({ width: 2560, height: 1440 });
    expect(await root()).toBeGreaterThan(19);
    const sidebar = (await page.getByTestId("sidebar-slot").boundingBox())!;
    expect(sidebar.width).toBeGreaterThan(256 * 1.2);
    await page.setViewportSize({ width: 3840, height: 2160 });
    expect(await root()).toBeLessThanOrEqual(22);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
});

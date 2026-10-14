import { expect, test, type Page } from "@playwright/test";

/*
  Smoke tests for the responsive layout. Each project (phone 375, tablet 768, desktop 1440) runs
  every test; the app runs in local open mode with the demo roster, so there is no sign-in step.
*/

const ROUTES = ["/team", "/players", "/me", "/draft", "/matches", "/trends", "/settings", "/overview", "/overview/blocks", "/overview/blocks/history"];

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page wider than the viewport").toBeLessThanOrEqual(1);
}

// The automatic local owner has no player profile, so it would open in Admin Mode; these tests
// cover the player screens, so they start in Player View (the admin-mode test switches itself).
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) < 768;
}

test.describe("pages", () => {
  for (const route of ROUTES) {
    test(`${route} fits the viewport`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page);
      await expect(page.locator("main h1, main h2").first()).toBeVisible();
    });
  }
});

test("navigation is usable", async ({ page }) => {
  await page.goto("/team");
  if (isPhone(page)) {
    // Bottom tab bar on phones.
    const tabs = page.locator("nav[aria-label='Primary'] a");
    await expect(tabs).toHaveCount(5);
    await tabs.filter({ hasText: "Draft" }).click();
    await expect(page).toHaveURL(/\/draft$/);
    // Drawer holds the rest.
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(drawer).toBeHidden();
  } else if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  } else {
    await expect(page.locator("aside")).toBeVisible();
    await page.locator("aside").getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  }
});

test("touch targets and inputs are phone-sized", async ({ page }) => {
  test.skip(!isPhone(page), "phone only");
  await page.goto("/draft");
  const submit = page.locator("main button[type=submit]").first();
  const box = await submit.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  const fontSize = await page.locator("#mode").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize, "16px inputs stop iOS zooming").toBeGreaterThanOrEqual(16);
});

test("players list and profile: browse, edit champions in place, season statistics", async ({ page }) => {
  await page.goto("/players");
  await expect(page.getByTestId("players-directory")).toBeVisible();
  await page.locator("main a[data-testid='player-card']").first().click();
  await page.waitForURL(/\/players\/[0-9a-f-]+$/);
  await expectNoHorizontalOverflow(page);
  // Profile tab: roles and pools edited in place, Riot accounts below.
  await expect(page.getByRole("heading", { name: "Roles & champion pools" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Riot accounts" })).toBeVisible();
  // The local owner may edit any profile: add a champion straight from the shared grid; it autosaves.
  const toggle = page.getByTestId("primary-pool-toggle");
  await toggle.click();
  const grid = page.getByTestId("primary-pool-grid");
  await expect(grid).toBeVisible();
  // Make room if the pool is full, then pick the first champion not already in it.
  const items = page.locator("[data-testid=primary-pool-list] [data-testid=pool-item]");
  if ((await items.count()) >= 6) await items.last().getByTestId("pool-remove").click();
  await grid.locator("button[data-champion][aria-pressed=false]:not([disabled])").first().click();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  await expectNoHorizontalOverflow(page);
  // Season statistics tab: the season overview with its season and game-mode dropdowns.
  await page.getByRole("link", { name: "Season statistics" }).click();
  await page.waitForURL(/\/players\/[0-9a-f-]+\/stats/);
  await expect(page.getByTestId("player-overview")).toBeVisible();
  await expect(page.locator("#overview-mode")).toHaveValue("all");
  await expect(page.locator("#overview-season option")).not.toHaveCount(0);
  await page.selectOption("#overview-mode", "solo");
  await page.waitForURL(/mode=solo/);
  await expect(page.locator("#overview-mode")).toHaveValue("solo");
});

test("admin mode: the owner switches between Player View and Admin Mode", async ({ page }) => {
  test.skip(isPhone(page) || (page.viewportSize()?.width ?? 0) < 1024, "sidebar switch; the phone drawer carries the same control");
  await page.goto("/team");
  const aside = page.locator("aside");
  // Player View by default: the player navigation, no admin links.
  await expect(aside.getByRole("link", { name: "My Overview" })).toBeVisible();
  await expect(aside.locator("a[href^='/admin']")).toHaveCount(0);
  await aside.getByRole("button", { name: "Switch to Admin" }).click();
  await page.waitForURL(/\/admin\/players$/);
  await expect(aside.getByText("ADMIN MODE")).toBeVisible();
  await expect(aside.getByRole("link", { name: "Users & Permissions" })).toBeVisible();
  await expect(page.getByText("ADD PLAYER ACCOUNT")).toBeVisible();
  await aside.getByRole("button", { name: "Back to Player View" }).click();
  await page.waitForURL(/\/team$/);
  await expect(aside.locator("a[href^='/admin']")).toHaveCount(0);
});

test("draft room: champion-select layout, current action, recommendation and board are usable", async ({ page }) => {
  await page.goto("/draft");
  // Ranked Flex is the default mode; optional information stays collapsed.
  await expect(page.locator("#mode")).toHaveValue("ranked-flex");
  await page.locator("main button[type=submit]").click();
  await page.waitForURL(/\/draft\/[0-9a-f-]+/);
  if (/\/prepare$/.test(page.url())) {
    await page.getByRole("link", { name: /Open draft room/ }).click();
    await page.waitForURL(/\/draft\/[0-9a-f-]+$/);
  }
  await page.waitForLoadState("networkidle");
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId("current-action").getByText(/BAN|PICK/).first()).toBeVisible();
  const lock = page.locator("section:has-text('RECOMMENDED') button:has-text('Ban'), section:has-text('RECOMMENDED') button:has-text('Lock')").first();
  await expect(lock).toBeVisible();
  const box = async (testId: string) => (await page.getByTestId(testId).boundingBox()) ?? { x: -1, y: -1, width: 0, height: 0 };
  const width = page.viewportSize()?.width ?? 1440;
  if (width >= 1280) {
    // Champion select: BLUE left, selector centre, RED right, the recommendation below the board row.
    const [blue, grid, red, intel, action] = await Promise.all([box("team-blue"), box("champion-grid"), box("team-red"), box("draft-intel"), box("current-action")]);
    expect(blue.x + blue.width, "blue column left of the selector").toBeLessThanOrEqual(grid.x + 1);
    expect(red.x, "red column right of the selector").toBeGreaterThanOrEqual(grid.x + grid.width - 1);
    expect(action.y, "current action above the selector").toBeLessThan(grid.y);
    expect(intel.y, "recommendation below the board row").toBeGreaterThanOrEqual(Math.max(grid.y + grid.height, blue.y + blue.height) - 1);
    await expect(page.locator("[data-testid=team-blue] [data-turn], [data-testid=team-red] [data-turn]")).toHaveCount(1);
    // Deeper analytics stay collapsed until asked for.
    await expect(page.getByRole("button", { name: /Projected team/i })).toBeVisible();
    await expect(page.getByText("Best complete team reachable from here")).toBeHidden();
  } else if (isPhone(page)) {
    await expect(page.getByLabel("Draft board")).toBeVisible();
    const [action, intel, grid, deeper] = await Promise.all([box("current-action"), box("draft-intel"), box("champion-grid"), box("draft-deeper")]);
    const board = (await page.getByLabel("Draft board").boundingBox()) ?? { y: -1 };
    expect(action.y, "current action first").toBeLessThan(intel.y);
    expect(intel.y, "recommendation before the selector").toBeLessThan(grid.y);
    expect(grid.y, "selector before the compact board").toBeLessThan(board.y);
    expect(board.y, "compact board before the deeper panels").toBeLessThan(deeper.y);
    // Deeper analytics are collapsed on phones.
    await expect(page.getByRole("button", { name: /Projected team/i })).toBeVisible();
    await expect(page.getByText("Best complete team reachable from here")).toBeHidden();
  } else {
    // Tablet: board and selector on the left, the recommendation column on the right.
    const [grid, intel] = await Promise.all([box("champion-grid"), box("draft-intel")]);
    expect(intel.x).toBeGreaterThanOrEqual(grid.x + grid.width - 1);
    await expect(page.getByTestId("team-blue")).toBeHidden();
  }
  await lock.click();
  await expect(page.getByText("Updating recommendation")).toBeHidden({ timeout: 30_000 });
  await expectNoHorizontalOverflow(page);
});

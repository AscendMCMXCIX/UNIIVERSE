import { expect, test, type Page } from "@playwright/test";

/*
  Smoke tests for the responsive layout. Each project (phone 375, tablet 768, desktop 1440) runs
  every test; the app runs in local open mode with the demo roster, so there is no sign-in step.
*/

const ROUTES = ["/team", "/players", "/me", "/draft", "/matches", "/trends", "/settings", "/overview", "/overview/champions", "/overview/accounts", "/blocks", "/blocks/history"];

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
    const aside = page.locator("aside");
    await expect(aside).toBeVisible();
    // Team groups its pages; the group folds and unfolds.
    const group = aside.getByTestId("nav-group-team");
    await expect(group.getByRole("link", { name: "Draft" })).toBeVisible();
    await group.getByRole("link", { name: "Matches" }).click();
    await expect(page).toHaveURL(/\/matches$/);
    // Settings lives in the account menu on your avatar.
    await aside.getByTestId("account-menu-button").click();
    await page.getByTestId("account-menu").getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    // The collapse control is in the sidebar header and remembered across pages.
    await aside.getByTestId("sidebar-toggle").click();
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    await page.goto("/players");
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "true");
    await page.locator("aside").getByTestId("sidebar-toggle").click();
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "false");
  }
});

test("touch targets and inputs are phone-sized", async ({ page }) => {
  test.skip(!isPhone(page), "phone only");
  await page.goto("/draft");
  const submit = page.locator("main button[type=submit]").first();
  const box = await submit.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  const fontSize = await page.getByLabel("Enemy player 1").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize, "16px inputs stop iOS zooming").toBeGreaterThanOrEqual(16);
});

test("players list and profile: browse, tabs, edit champions in place, season statistics", async ({ page }) => {
  await page.goto("/players");
  await expect(page.getByTestId("players-directory")).toBeVisible();
  await page.locator("main a[data-testid='player-card']").first().click();
  await page.waitForURL(/\/players\/[0-9a-f-]+$/);
  await expectNoHorizontalOverflow(page);
  const base = new URL(page.url()).pathname;
  // Overview tab: season performance with its filters.
  await expect(page.getByTestId("season-summary")).toBeVisible();
  await expect(page.getByTestId("stat-kda")).toBeVisible();
  await expect(page.locator("#overview-mode")).toHaveValue("all");
  await expect(page.locator("#overview-season option")).not.toHaveCount(0);
  await page.selectOption("#overview-mode", "solo");
  await page.waitForURL(/mode=solo/);
  await expect(page.locator("#overview-mode")).toHaveValue("solo");
  // Champions & Roles tab: pools by role; the local owner may edit any profile, with autosave.
  await page.getByRole("navigation", { name: "Profile" }).getByRole("link", { name: "Champions & Roles" }).click();
  await page.waitForURL(new RegExp(`${base}/champions`));
  await expect(page.getByRole("heading", { name: "Champion pools" })).toBeVisible();
  const editor = page.getByTestId("pool-editor");
  if ((await editor.getAttribute("open")) === null) await editor.locator("summary").click();
  await page.getByTestId("primary-pool-toggle").click();
  const grid = page.getByTestId("primary-pool-grid");
  await expect(grid).toBeVisible();
  // No pool limits: pick the first champion not already in it.
  await grid.locator("button[data-champion][aria-pressed=false]:not([disabled])").first().click();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  await expectNoHorizontalOverflow(page);
  // Riot Accounts tab.
  await page.getByRole("navigation", { name: "Profile" }).getByRole("link", { name: "Riot Accounts" }).click();
  await page.waitForURL(new RegExp(`${base}/accounts`));
  await expect(page.getByTestId("riot-accounts")).toBeVisible();
});

test("admin mode: the owner switches between Player View and Admin Mode", async ({ page }) => {
  test.skip(isPhone(page) || (page.viewportSize()?.width ?? 0) < 1024, "sidebar switch; the phone drawer carries the same control");
  await page.goto("/team");
  const aside = page.locator("aside");
  // Player View by default: the player navigation, no admin links.
  await expect(aside.getByRole("link", { name: "My Profile" })).toBeVisible();
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

test("draft setup: mode, lineup and optional enemy Riot IDs; no draft history", async ({ page }) => {
  await page.goto("/draft");
  const setup = page.getByTestId("draft-setup");
  await expect(setup.locator("input[name=mode][value=ranked-flex]")).toBeChecked();
  await expect(setup.locator("input[name=mode][value=ranked-5s]")).toHaveCount(1);
  await expect(page.getByTestId("setup-lineup").locator("li")).toHaveCount(5);
  // Five optional enemy fields, all visible at once, no roles to assign.
  await expect(setup.getByTestId("enemy-name-field")).toHaveCount(5);
  await expect(setup.getByText(/add player/i)).toHaveCount(0);
  await expect(page.getByText(/draft history/i)).toHaveCount(0);
  // Organised modes add only what they need: series length and opponent.
  await setup.getByText("Tournament", { exact: true }).click();
  await expect(setup.locator("#series")).toBeVisible();
  await expect(setup.locator("#opponent")).toBeVisible();
  // Draft rules (Standard / Fearless) appear for best-of series only.
  await expect(setup.getByTestId("draft-rules")).toHaveCount(0);
  await setup.locator("#series").selectOption("3");
  await expect(setup.getByTestId("draft-rules")).toBeVisible();
  await setup.getByTestId("draft-rules").selectOption("fearless");
  await expect(setup.getByText(/unavailable to both teams/)).toBeVisible();
  await setup.getByText("Ranked Flex", { exact: true }).click();
  await expect(setup.locator("#series")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("draft room: champion-select layout, current action, recommendation and board are usable", async ({ page }) => {
  await page.goto("/draft");
  await expect(page.locator("input[name=mode][value=ranked-flex]")).toBeChecked();
  await page.locator("main button[type=submit]").click();
  await page.waitForURL(/\/draft\/[0-9a-f-]+/);
  if (/\/prepare$/.test(page.url())) {
    await page.getByRole("link", { name: /Open draft room/ }).click();
    await page.waitForURL(/\/draft\/[0-9a-f-]+$/);
  }
  await page.waitForLoadState("networkidle");
  await expectNoHorizontalOverflow(page);
  await expect(page.getByTestId("current-action").getByText(/BAN|PICK/).first()).toBeVisible();
  // Enemy Riot IDs belong to setup only: no editing interface in the room.
  await expect(page.getByTestId("enemy-names")).toHaveCount(0);
  const lock = page.getByTestId("recommendation").getByRole("button").first();
  await expect(lock).toBeVisible();
  const box = async (testId: string) => (await page.getByTestId(testId).boundingBox()) ?? { x: -1, y: -1, width: 0, height: 0 };
  const { width, height } = page.viewportSize() ?? { width: 1440, height: 900 };
  if (width >= 1280) {
    // Champion select: BLUE left, selector centre with the action and recommendation above it, RED right.
    const [blue, grid, red, intel, action, workspace] = await Promise.all([box("team-blue"), box("champion-grid"), box("team-red"), box("draft-intel"), box("current-action"), box("draft-workspace")]);
    expect(blue.x + blue.width, "blue column left of the selector").toBeLessThanOrEqual(grid.x + 1);
    expect(red.x, "red column right of the selector").toBeGreaterThanOrEqual(grid.x + grid.width - 1);
    expect(action.y, "current action above the recommendation").toBeLessThan(intel.y);
    expect(intel.y + intel.height, "recommendation above the selector").toBeLessThanOrEqual(grid.y + 1);
    expect(workspace.y + workspace.height, "the workspace fits one viewport").toBeLessThanOrEqual(height + 1);
    expect(grid.height, "the grid keeps a usable height").toBeGreaterThan(250);
    await expect(page.locator("[data-testid=team-blue] [data-turn], [data-testid=team-red] [data-turn]")).toHaveCount(1);
    // Deeper analysis stays collapsed below the workspace.
    await expect(page.getByRole("button", { name: /Projected team/i })).toBeVisible();
    await expect(page.getByText("The best complete team reachable from here.")).toBeHidden();
  } else {
    await expect(page.getByLabel("Draft board")).toBeVisible();
    await expect(page.getByTestId("team-blue")).toBeHidden();
    const [action, intel, grid, deeper] = await Promise.all([box("current-action"), box("draft-intel"), box("champion-grid"), box("draft-deeper")]);
    const board = (await page.getByLabel("Draft board").boundingBox()) ?? { y: -1 };
    expect(action.y, "current action first").toBeLessThan(intel.y);
    expect(intel.y, "recommendation before the selector").toBeLessThan(grid.y);
    expect(grid.y, "selector before the compact board").toBeLessThan(board.y);
    expect(board.y, "compact board before the analysis").toBeLessThan(deeper.y);
    await expect(page.getByRole("button", { name: /Projected team/i })).toBeVisible();
    await expect(page.getByText("The best complete team reachable from here.")).toBeHidden();
  }
  await lock.click();
  await expect(page.getByText("Updating recommendation")).toBeHidden({ timeout: 30_000 });
  await expectNoHorizontalOverflow(page);
});

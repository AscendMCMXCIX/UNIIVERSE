import { expect, test, type Page } from "@playwright/test";

/*
  Smoke tests for the responsive layout. Each project (phone 375, tablet 768, desktop 1440) runs
  every test; the app runs in local open mode with the demo roster, so there is no sign-in step.
*/

const ROUTES = ["/team", "/players", "/me", "/draft", "/matches", "/trends", "/settings", "/overview", "/overview/champions", "/overview/accounts", "/overview/blocks", "/overview/blocks/history", "/overview/matches"];

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

/** Opens a profile section: tabs on wider screens, the compact section picker on a phone. */
async function openProfileSection(page: Page, label: string) {
  await page.getByTestId("profile-section-button").click();
  await page.getByTestId("profile-section-menu").getByRole("menuitem", { name: label }).click();
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
    // TEAM: Overview, Players, Draft, Matches, in that order; Meta & Trends and My Profile stand alone.
    const group = aside.getByTestId("nav-group-team");
    await expect(group.getByRole("link")).toHaveText(["Overview", "Players", "Draft", "Matches"]);
    await expect(aside.getByRole("link", { name: "Meta & Trends" })).toBeVisible();
    await group.getByRole("link", { name: "Matches" }).click();
    await expect(page).toHaveURL(/\/matches$/);
    // The account menu on your avatar holds Settings and Sign out only.
    await aside.getByTestId("account-menu-button").click();
    const menu = page.getByTestId("account-menu");
    await expect(menu.getByRole("menuitem", { name: "My Profile" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Riot Accounts" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    // The collapse control sits at the foot of the sidebar and is remembered across pages.
    await aside.getByTestId("sidebar-toggle").click();
    await expect(aside).toHaveAttribute("data-collapsed", "true");
    await page.goto("/players");
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "true");
    // Collapsed, only the icon column is visible (and clickable): press the icon.
    await page.locator("aside").getByTestId("sidebar-toggle").click({ position: { x: 24, y: 16 } });
    await expect(page.locator("aside")).toHaveAttribute("data-collapsed", "false");
  }
});

test("touch targets and inputs are phone-sized", async ({ page }) => {
  test.skip(!isPhone(page), "phone only");
  await page.goto("/draft");
  const submit = page.getByTestId("start-draft");
  await expect(submit).toBeVisible();
  const box = await submit.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await submit.click();
  await page.waitForURL(/\/scout$/);
  const fontSize = await page.getByLabel("Enemy player 1 Riot ID").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize, "16px inputs stop iOS zooming").toBeGreaterThanOrEqual(16);
});

test("team cards: the whole pool for the role, equal heights, lineup editing behind one button", async ({ page }) => {
  await page.goto("/team");
  const cards = page.locator("[data-testid^=lineup-row-]");
  await expect(cards).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const card = cards.nth(i);
    // The whole pool for the role is on the card: no "+N more".
    const poolSize = Number((await card.getByText(/ pool · \d+$/).textContent())!.match(/(\d+)$/)![1]);
    await expect(card.getByTestId("pool-champion")).toHaveCount(poolSize);
    await expect(card.getByTestId("pool-more")).toHaveCount(0);
    // No scrolling champion area inside a card.
    expect(await card.evaluate((el) => [...el.querySelectorAll("*")].some((n) => n.scrollHeight > n.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(n).overflowY)))).toBe(false);
  }
  if (!isPhone(page)) {
    const heights = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
    // Every card puts its figures and its champions at the same height.
    const offsets = await cards.evaluateAll((els) => els.map((e) => ["card-season", "pool-preview"].map((id) => Math.round(e.querySelector(`[data-testid=${id}]`)!.getBoundingClientRect().top - e.getBoundingClientRect().top)).join(",")));
    expect(new Set(offsets).size).toBe(1);
  }
  // Lineup controls appear only in edit mode, and never shift a card.
  const before = await cards.first().evaluate((e) => Math.round(e.getBoundingClientRect().height));
  await expect(page.locator("[aria-label$=' player'][aria-haspopup=menu]")).toHaveCount(0);
  await page.getByTestId("edit-lineup").click();
  await expect(page.getByRole("button", { name: "Change Top player" })).toBeVisible();
  expect(await cards.first().evaluate((e) => Math.round(e.getBoundingClientRect().height))).toBe(before);
  await page.getByTestId("edit-lineup").click();
  await expect(page.getByRole("button", { name: "Change Top player" })).toHaveCount(0);
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
  // The season choice appears only when there is more than one season to choose from.
  expect(await page.locator("#overview-season").count()).toBeLessThanOrEqual(1);
  await page.selectOption("#overview-mode", "solo");
  await page.waitForURL(/mode=solo/);
  await expect(page.locator("#overview-mode")).toHaveValue("solo");
  // Champions & Roles tab: pools by role; the local owner may edit any profile, with autosave.
  await openProfileSection(page, "Champions & Roles");
  await page.waitForURL(new RegExp(`${base}/champions`));
  await expect(page.getByRole("heading", { name: "Champion pools" })).toBeVisible();
  // The pools themselves are the editor (no panel to open); Add opens a search right below.
  await expect(page.getByTestId("pool-editor").getByTestId("primary-pool")).toBeVisible();
  await page.getByTestId("primary-pool-toggle").click();
  const grid = page.getByTestId("primary-pool-grid");
  await expect(grid).toBeVisible();
  // No pool limits: pick the first champion not already in it.
  await grid.locator("button[data-champion][aria-pressed=false]:not([disabled])").first().click();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  await expectNoHorizontalOverflow(page);
  // Match History tab: the stored games, filters and an honest empty state (the demo has none).
  await openProfileSection(page, "Match History");
  await page.waitForURL(new RegExp(`${base}/matches`));
  await expect(page.getByTestId("match-history")).toBeVisible();
  await expect(page.getByTestId("match-filters")).toBeVisible();
  const filters = page.getByTestId("match-filters");
  await expect(filters.getByLabel("Game mode")).toHaveValue("all");
  // Role, champions and account sit behind Refine, as on the Overview; one linked account at most
  // here, so no account choice.
  await filters.getByTestId("refine-filters").click();
  await expect(filters.getByTestId("refine-panel")).toBeVisible();
  await expect(filters.getByLabel("Role played")).toHaveValue("");
  if ((await page.getByTestId("match-count").textContent())?.includes("accounts")) await expect(filters.getByLabel("Linked account")).toBeVisible();
  else await expect(filters.getByLabel("Linked account")).toHaveCount(0);
  if ((await page.getByTestId("match-row").count()) === 0) await expect(page.getByTestId("match-empty")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  // Riot Accounts tab.
  await openProfileSection(page, "Riot Accounts");
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
  await page.waitForURL(/\/admin\/people$/);
  await expect(aside.getByText("ADMIN MODE")).toBeVisible();
  await expect(aside.getByRole("link", { name: "People & Access" })).toBeVisible();
  await expect(aside.getByRole("link", { name: "Riot Data" })).toBeVisible();
  await expect(page.getByText("ADD PLAYER ACCOUNT")).toBeVisible();
  // One workflow: find a person, open Access (base level, groups, what they can do). Your own
  // access is never editable; the demo's only account is the local owner itself.
  await expect(page.getByTestId("people-search")).toBeVisible();
  const editable = page.locator("[data-testid=open-access]:not([disabled])");
  if ((await editable.count()) > 0) {
    await editable.first().click();
    const dialog = page.getByTestId("access-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Team Lineup Manager")).toBeVisible();
    await expect(page.getByTestId("effective-capabilities")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  } else {
    await expect(page.getByTestId("open-access").first()).toBeDisabled();
  }
  await aside.getByRole("button", { name: "Back to Player View" }).click();
  await page.waitForURL(/\/team$/);
  await expect(aside.locator("a[href^='/admin']")).toHaveCount(0);
});

test("draft setup: mode and lineup only (enemies and side come later); no draft history", async ({ page }) => {
  await page.goto("/draft");
  const setup = page.getByTestId("draft-setup");
  await expect(page.getByTestId("draft-stepper").locator("[aria-current=step]")).toContainText("Draft setup");
  await expect(setup.locator("input[name=mode][value=ranked-flex]")).toBeChecked();
  await expect(setup.locator("input[name=mode][value=ranked-5s]")).toHaveCount(1);
  await expect(setup.getByTestId("mode-description")).toBeVisible();
  await expect(page.getByTestId("setup-lineup").locator("li")).toHaveCount(5);
  // Enemy Riot IDs and the side are asked after Start draft, not here.
  await expect(setup.getByLabel(/Enemy player/)).toHaveCount(0);
  await expect(setup.getByText(/blue side|red side/i)).toHaveCount(0);
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
  await page.getByTestId("start-draft").click();
  // Step 2: five optional Riot ID fields at once, no roles; continuing with none is fine.
  await page.waitForURL(/\/draft\/[0-9a-f-]+\/scout$/);
  await expect(page.getByTestId("enemy-fields").locator("input")).toHaveCount(5);
  await page.getByTestId("enemy-input-0").fill("not a riot id");
  await page.getByTestId("enemy-input-0").press("Enter");
  await expect(page.getByTestId("enemy-status-0")).toContainText("full Riot ID");
  await page.getByTestId("enemy-input-0").fill("");
  await expectNoHorizontalOverflow(page);
  await page.getByTestId("continue-to-draft").click();
  // Step 3: the side, asked on entry to pick/ban; nothing can be locked before it.
  await page.waitForURL(/\/draft\/[0-9a-f-]+$/);
  await expect(page.getByTestId("side-gate")).toBeVisible();
  await expect(page.getByTestId("begin-pick-ban")).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId("side-red").click();
  await page.getByTestId("begin-pick-ban").click();
  await expect(page.getByTestId("current-action")).toBeVisible({ timeout: 30_000 });
  // The side can still be corrected until the first action.
  await page.getByTestId("switch-side").click();
  await expect(page.getByTestId("switch-side")).toContainText(/red/i);
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

test("trends: overall and role tabs, a sort switch, at most ten rows, one screen on desktop", async ({ page }) => {
  await page.goto("/trends");
  const board = page.getByTestId("trends-board");
  await expect(board).toBeVisible();
  for (const [id, label] of <Array<[string, string]>>[["ALL", "Overall"], ["TOP", "Top"], ["JUNGLE", "Jungle"], ["MID", "Mid"], ["ADC", "Bot"], ["SUPPORT", "Support"]]) {
    await expect(page.getByTestId(`trends-tab-${id}`)).toContainText(label);
  }
  await expect(page.getByTestId("trends-tab-ALL")).toHaveAttribute("aria-selected", "true");
  const rows = board.getByTestId("trend-row");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(10);
  if (count < 10) await expect(page.getByTestId("trends-shortfall")).toBeVisible();
  // Each champion once per list, on every tab and sort.
  for (const tab of ["ALL", "TOP", "ADC"]) {
    await page.getByTestId(`trends-tab-${tab}`).click();
    for (const sort of ["presence", "ban", "win"]) {
      await page.getByTestId(`trends-sort-${sort}`).click();
      await expect(page.getByTestId(`trends-sort-${sort}`)).toHaveAttribute("aria-checked", "true");
      const champs = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-champion")));
      expect(new Set(champs).size, `${tab}/${sort}`).toBe(champs.length);
      expect(champs.length).toBeLessThanOrEqual(10);
    }
  }
  // Keyboard: arrows move between tabs.
  await page.getByTestId("trends-tab-ADC").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("trends-tab-SUPPORT")).toHaveAttribute("aria-selected", "true");
  await expectNoHorizontalOverflow(page);
  const { width, height } = page.viewportSize() ?? { width: 1440, height: 900 };
  if (width >= 1280) {
    await page.getByTestId("trends-tab-ALL").click();
    const box = (await board.boundingBox())!;
    expect(box.y + box.height, "the top ten fits one desktop screen").toBeLessThanOrEqual(height);
  }
});

test("champion pools reorder by dragging and by keyboard, and the order is saved", async ({ page }) => {
  // The automatic local owner has no profile of its own; it may edit any player's.
  await page.goto("/players");
  await page.locator("main a[data-testid='player-card']").nth(1).click();
  await page.waitForURL(/\/players\/[0-9a-f-]+$/);
  await page.goto(`${new URL(page.url()).pathname}/champions`);
  const list = page.getByTestId("primary-pool-list");
  const items = list.getByTestId("pool-item");
  // Make sure there are at least three champions to reorder.
  if ((await items.count()) < 3) {
    await page.getByTestId("primary-pool-toggle").click();
    const grid = page.getByTestId("primary-pool-grid");
    while ((await items.count()) < 3) await grid.locator("button[data-champion][aria-pressed=false]:not([disabled])").first().click();
    await page.getByTestId("primary-pool-done").click();
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  }
  const orderNow = () => items.evaluateAll((els) => els.map((e) => e.getAttribute("data-champion")!));
  // Cards slide into place after every reorder; measure positions only once they have settled.
  const settled = () => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));
  // No arrow buttons: dragging is the way to reorder, the keyboard has its own.
  await expect(list.getByRole("button", { name: /Move .* (earlier|later)/ })).toHaveCount(0);
  const saved = async () => {
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  };

  // Keyboard: pick up the first, move it one place right, drop.
  const before = await orderNow();
  const grip = items.first().getByTestId("pool-grip");
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("pool-announce")).toContainText("Picked up");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(page.getByTestId("pool-announce")).toContainText("position 2");
  const afterKeys = [before[1], before[0], ...before.slice(2)];
  await expect.poll(orderNow).toEqual(afterKeys);
  await saved();
  // Escape cancels without saving anything.
  await items.first().getByTestId("pool-grip").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect.poll(orderNow).toEqual(afterKeys);

  // Pointer: drag the first card onto the third slot. A mouse drags from anywhere on the card;
  // touch screens (the tablet project emulates one) drag from the grip, so the page still scrolls.
  if (!isPhone(page)) {
    await settled();
    const touch = (page.viewportSize()?.width ?? 1440) < 1024;
    const a = (await (touch ? items.nth(0).getByTestId("pool-grip") : items.nth(0)).boundingBox())!;
    const c = (await items.nth(2).boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 6, a.y + a.height / 2 + 2, { steps: 2 });
    await expect(page.getByTestId("pool-placeholder")).toBeVisible();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByTestId("pool-placeholder")).toHaveCount(0);
    const afterDrag = [afterKeys[1], afterKeys[2], afterKeys[0], ...afterKeys.slice(3)];
    await expect.poll(orderNow).toEqual(afterDrag);
    await saved();
    await page.reload();
    await expect.poll(orderNow).toEqual(afterDrag);
  } else {
    await page.reload();
    await expect.poll(orderNow).toEqual(afterKeys);
  }
});

test("secondary role is optional: added with its own button and removable", async ({ page }) => {
  test.skip(isPhone(page), "same editor on every width; runs on tablet and desktop");
  await page.goto("/players");
  await page.locator("main a[data-testid='player-card']").nth(2).click();
  await page.waitForURL(/\/players\/[0-9a-f-]+$/);
  await page.goto(`${new URL(page.url()).pathname}/champions`);
  const editor = page.getByTestId("pool-editor");
  // No "None" chip preselected: an explicit add button instead.
  await expect(editor.getByRole("radio", { name: "None" })).toHaveCount(0);
  if ((await page.getByTestId("secondary-pool").count()) > 0) {
    await page.getByTestId("secondary-pool").getByRole("button", { name: /Remove the .* role/ }).click();
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  }
  await expect(page.getByTestId("secondary-pool")).toHaveCount(0);
  await page.getByTestId("add-secondary-role").click();
  const picker = page.getByTestId("add-secondary-role-picker");
  await picker.getByRole("radio").and(page.locator(":not([disabled])")).first().click();
  await expect(page.getByTestId("secondary-pool")).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId("secondary-pool")).toBeVisible();
  await page.getByTestId("secondary-pool").getByRole("button", { name: /Remove the .* role/ }).click();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  await expect(page.getByTestId("secondary-pool")).toHaveCount(0);
  await expect(page.getByTestId("add-secondary-role")).toBeVisible();
});

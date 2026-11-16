import { expect, test, type Page } from "./test";
import { closeFilterSheet, openFilterBar } from "./filters";
import { playerEntry } from "./players";

/*
  Smoke tests for the responsive layout. Each project (phone 375, tablet 768, desktop 1440) runs
  every test; the app runs in local open mode with the demo roster, so there is no sign-in step.
*/

const ROUTES = ["/team", "/players", "/me", "/matches", "/settings", "/overview", "/overview/champions", "/overview/accounts", "/overview/matches"];

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

/** A profile section's short name on a phone, where the four ride in the top bar (docs/MOBILE.md). */
const PHONE_SECTION: Record<string, string> = { "All Champions": "Champions", "Match History": "History", "Riot Accounts": "Accounts" };

/** Opens a profile section: the tab bar under the profile card; on phones, the sections in the top bar. */
async function openProfileSection(page: Page, label: string) {
  if (isPhone(page)) await page.getByTestId("profile-chrome-tabs").getByRole("link", { name: PHONE_SECTION[label] ?? label }).click();
  else await page.getByTestId("profile-tabs").getByRole("link", { name: label }).click();
}

/** A player in the Players directory: their row on a phone, their card from sm up. */
const playerLink = (page: Page, name: string) => playerEntry(page, name);

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
    // Bottom tab bar on phones: the five places members go to most, the current one lit
    // (docs/MOBILE.md; e2e/mobile-nav.spec.ts checks the rest of the phone frame).
    const tabs = page.locator("nav[aria-label='Primary'] a");
    await expect(tabs).toHaveText(["Team", "Players", "Leaderboards", "Matches", "Profile"]);
    await expect(tabs.filter({ hasText: "Team" })).toHaveAttribute("aria-current", "page");
    await tabs.filter({ hasText: "Matches" }).click();
    await expect(page).toHaveURL(/\/matches$/);
    await expect(tabs.filter({ hasText: "Matches" })).toHaveAttribute("aria-current", "page");
    // The account screen behind the avatar holds the rest; no menu drawer on a phone.
    await expect(page.getByTestId("menu-button")).toBeHidden();
    await page.getByTestId("account-sheet-button").click();
    const sheet = page.getByTestId("account-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(sheet).toBeHidden();
  } else if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  } else {
    const aside = page.locator("aside");
    await expect(aside).toBeVisible();
    // Team: one entry (its sections are the tabs at the top of its pages); My Profile: one link
    // (its sections are the bar under the profile card); Resources: its own entry below Team.
    const team = aside.getByTestId("nav-team");
    await expect(team).toHaveAttribute("href", "/team");
    await expect(team).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("team-tabs").getByRole("link")).toHaveText(["Overview", "Players", "Leaderboards", "Matches"]);
    await expect(aside.getByTestId("nav-resources")).toHaveAttribute("href", "/resources");
    await expect(aside.getByTestId("nav-clash")).toHaveCount(0);
    await expect(aside.getByRole("link", { name: "My Profile" })).toHaveAttribute("href", "/overview");
    await page.getByTestId("team-tab-matches").click();
    await expect(page).toHaveURL(/\/matches$/);
    await expect(team).toHaveAttribute("aria-current", "page");
    // The account menu on your avatar holds Settings and Sign out only.
    await aside.getByTestId("account-menu-button").click();
    const menu = page.getByTestId("account-menu");
    await expect(menu.getByRole("menuitem", { name: "My Profile" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Riot Accounts" })).toHaveCount(0);
    await menu.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    // The collapse control sits under the logo and is remembered across pages.
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
  await page.goto("/team");
  const button = page.getByTestId("edit-lineup");
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.goto("/settings");
  const fontSize = await page.locator("#current").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize, "16px inputs stop iOS zooming").toBeGreaterThanOrEqual(16);
});

test("team cards: compact by default, the whole pool in a detail panel that never moves the lineup, equal heights, lineup editing behind one button", async ({ page }) => {
  await page.goto("/team");
  const cards = page.locator("[data-testid^=lineup-row-]");
  await expect(cards).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const card = cards.nth(i);
    // Compact: a few champions as portraits and the pool size, never the full list on the card.
    await expect(card.getByTestId("pool-preview")).toBeVisible();
    await expect(card.getByTestId("pool-champion")).toHaveCount(0);
    // No scrolling area inside a card.
    expect(await card.evaluate((el) => [...el.querySelectorAll("*")].some((n) => n.scrollHeight > n.clientHeight + 1 && ["auto", "scroll"].includes(getComputedStyle(n).overflowY)))).toBe(false);
  }
  // The detail panel: the whole pool for the role, over the page; the lineup does not move.
  const mid = page.getByTestId("lineup-row-MID");
  const poolSize = Number(await mid.getAttribute("data-pool-size"));
  await mid.getByTestId("open-player-detail").scrollIntoViewIfNeeded();
  const before = await page.getByTestId("lineup-overview").boundingBox();
  await mid.getByTestId("open-player-detail").click();
  const panel = page.getByTestId("player-detail");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("pool-champion")).toHaveCount(poolSize);
  await expect(panel.getByTestId("detail-profile-link")).toHaveAttribute("href", /\/players\//);
  // One line of ranked progress (demo snapshots), linking to the profile's full chart: "since <day>"
  // when the window's start falls between two demo readings several games apart.
  await expect(panel.getByTestId("detail-rank-change")).toContainText(/Ranked Solo\/Duo [+-]?\d+ ladder points (in 30 days|since \d{1,2} [A-Z][a-z]{2})/);
  await expect(panel.getByTestId("detail-rank-change")).toHaveAttribute("href", /#ranked-progress$/);
  expect(await page.getByTestId("lineup-overview").boundingBox()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  if (!isPhone(page)) {
    const heights = await cards.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
    // Every card puts its figures and its champions at the same height.
    const offsets = await cards.evaluateAll((els) => els.map((e) => ["card-season", "pool-preview"].map((id) => Math.round(e.querySelector(`[data-testid=${id}]`)!.getBoundingClientRect().top - e.getBoundingClientRect().top)).join(",")));
    expect(new Set(offsets).size).toBe(1);
  }
  // Lineup controls appear only in edit mode, in a bar at the card's foot: nothing on the card
  // moves or is covered, and the card is as it was once editing ends.
  const top = page.getByTestId("lineup-row-TOP");
  const layout = () => top.evaluate((e) => ({ height: Math.round(e.getBoundingClientRect().height), pool: Math.round(e.querySelector("[data-testid=pool-preview]")!.getBoundingClientRect().top - e.getBoundingClientRect().top) }));
  const resting = await layout();
  await expect(page.locator("[aria-label$=' player'][aria-haspopup=menu]")).toHaveCount(0);
  await page.getByTestId("edit-lineup").click();
  await expect(page.getByRole("button", { name: "Change Top player" })).toBeVisible();
  expect((await layout()).pool).toBe(resting.pool);
  const [bar, pool, card] = await Promise.all([top.getByTestId("lineup-actions-TOP").boundingBox(), top.getByTestId("pool-preview").boundingBox(), top.boundingBox()]);
  expect(bar!.y).toBeGreaterThanOrEqual(pool!.y + pool!.height - 1);
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(card!.y + card!.height + 1);
  await page.getByTestId("edit-lineup").click();
  await expect(page.getByRole("button", { name: "Change Top player" })).toHaveCount(0);
  expect((await layout()).height).toBe(resting.height);
});

test("players list and profile: browse, tabs, edit champions in place, season statistics", async ({ page }) => {
  await page.goto("/players");
  await expect(page.getByTestId(isPhone(page) ? "players-list" : "players-directory")).toBeVisible();
  await playerLink(page, "Demo Top").click();
  await page.waitForURL(/\/players\/[0-9a-f-]+$/);
  await expectNoHorizontalOverflow(page);
  const base = new URL(page.url()).pathname;
  // Overview tab: season performance with its filters.
  await expect(page.getByTestId("season-summary")).toBeVisible();
  await expect(page.getByTestId("stat-kda")).toBeVisible();
  await expect(page.locator("#overview-mode")).toHaveValue("all");
  // The season choice appears only when there is more than one season to choose from.
  expect(await page.locator("#overview-season").count()).toBeLessThanOrEqual(1);
  await openFilterBar(page.getByTestId("overview-filters"));
  await page.selectOption("#overview-mode", "solo");
  await page.waitForURL(/mode=solo/);
  await expect(page.locator("#overview-mode")).toHaveValue("solo");
  await closeFilterSheet(page);
  // The pools are on Overview: one card per champion; the local owner may edit any profile.
  await expect(page.getByRole("heading", { name: /Roles & champion pools/ })).toBeVisible();
  await expect(page.getByTestId("pool-editor").getByTestId("primary-pool")).toBeVisible();
  // Edit, then Add champion opens a search box; a champion is one click away.
  await page.getByTestId("pools-edit").click();
  await page.getByTestId("primary-pool-toggle").click();
  await page.getByTestId("primary-pool-search").fill("a");
  await page.getByTestId("primary-pool-results").getByRole("option").first().click();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  await expectNoHorizontalOverflow(page);
  // Match History tab: the stored games, filters and an honest empty state (the demo has none).
  await openProfileSection(page, "Match History");
  await page.waitForURL(new RegExp(`${base}/matches`));
  await expect(page.getByTestId("match-history")).toBeVisible();
  await expect(page.getByTestId("match-filters")).toBeVisible();
  const filters = page.getByTestId("match-filters");
  // The game mode chosen on Overview comes along to Match History.
  await expect(filters.getByLabel("Game mode")).toHaveValue("solo");
  // Role, champions and account sit behind Refine on wide screens and in the opened filter bar on
  // phones, as on the Overview; one linked account at most here, so no account choice.
  if (await openFilterBar(filters)) {
    await expect(filters.getByTestId("refine-filters")).toBeHidden();
  } else await filters.getByTestId("refine-filters").click();
  await expect(filters.getByTestId("refine-panel")).toBeVisible();
  await expect(filters.getByRole("radio", { name: "All roles" })).toHaveAttribute("aria-checked", "true");
  if (Number(await page.getByTestId("match-history").getAttribute("data-accounts-linked")) > 1) await expect(filters.getByLabel("Linked account")).toBeVisible();
  else await expect(filters.getByLabel("Linked account")).toHaveCount(0);
  if ((await page.getByTestId("match-row").count()) === 0) await expect(page.getByTestId("match-empty")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await closeFilterSheet(page);
  // Riot Accounts tab.
  await openProfileSection(page, "Riot Accounts");
  await page.waitForURL(new RegExp(`${base}/accounts`));
  await expect(page.getByTestId("riot-accounts")).toBeVisible();
});

test("champion pools reorder by dragging and by keyboard, and the order is saved", async ({ page }) => {
  // The automatic local owner has no profile of its own; it may edit any player's.
  await page.goto("/players");
  await playerLink(page, "Demo Jungle").click();
  await page.waitForURL(/\/players\/[0-9a-f-]+$/);
  const list = page.getByTestId("primary-pool-list");
  const items = list.getByTestId("pool-item");
  await expect(items.first()).toBeVisible();
  await page.getByTestId("pools-edit").click();
  // Make sure there are at least three champions to reorder.
  if ((await items.count()) < 3) {
    await page.getByTestId("primary-pool-toggle").click();
    while ((await items.count()) < 3) await page.getByTestId("primary-pool-results").getByRole("option").first().click();
    await page.keyboard.press("Escape");
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
    // Bring the cards to mid-screen first: near the window's edge a drag scrolls the page (by design).
    await list.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await settled();
    const touch = (page.viewportSize()?.width ?? 1440) < 1024;
    const a = (await (touch ? items.nth(0).getByTestId("pool-grip") : items.nth(0)).boundingBox())!;
    const c = (await items.nth(2).boundingBox())!;
    // Grab the card by its portrait (buttons on a card, like the ⓘ, never start a drag).
    const gx = touch ? a.x + a.width / 2 : a.x + Math.min(48, a.width / 2);
    await page.mouse.move(gx, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(gx + 6, a.y + a.height / 2 + 2, { steps: 2 });
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

test("off roles are optional: added with their own button and removable", async ({ page }) => {
  test.skip(isPhone(page), "same editor on every width; runs on tablet and desktop");
  await page.goto("/players");
  // Tablet and desktop run at the same time against one demo database: each edits its own player.
  await page.locator(`main a[data-testid='player-card'][data-player-name='${test.info().project.name === "tablet" ? "Demo ADC" : "Demo Mid"}']`).click();
  await page.waitForURL(/\/players\/[0-9a-f-]+$/);
  const editor = page.getByTestId("pool-editor");
  // The address changes before the profile has drawn: wait for the editor, or the checks below read the old page.
  await expect(editor).toBeVisible();
  await page.getByTestId("pools-edit").click();
  // No "None" chip preselected: an explicit add button instead.
  await expect(editor.getByRole("radio", { name: "None" })).toHaveCount(0);
  if ((await page.getByTestId("secondary-pool").count()) > 0) {
    await page.getByTestId("secondary-pool").getByRole("button", { name: /Remove the .* role/ }).click();
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  }
  await expect(page.getByTestId("secondary-pool")).toHaveCount(0);
  await page.getByTestId("add-off-role").click();
  const picker = page.getByTestId("add-off-role-picker");
  await picker.getByRole("radio").and(page.locator(":not([disabled])")).first().click();
  await expect(page.getByTestId("secondary-pool")).toBeVisible();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  await page.reload();
  await expect(page.getByTestId("secondary-pool")).toBeVisible();
  await page.getByTestId("pools-edit").click();
  await page.getByTestId("secondary-pool").getByRole("button", { name: /Remove the .* role/ }).click();
  await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 15_000 });
  await expect(page.getByTestId("secondary-pool")).toHaveCount(0);
  await expect(page.getByTestId("add-off-role")).toBeVisible();
});

test("a profile's sections are tabs on every screen, like Team's, with the current one in view", async ({ page }) => {
  test.skip(isPhone(page), "phones show the sections in the top bar: e2e/mobile-nav.spec.ts");
  await page.goto("/players");
  const href = (await page.locator("main a[data-testid='player-card'][data-player-name='Demo Top']").getAttribute("href"))!;
  // The last section first: on a phone the bar has scrolled it into view.
  await page.goto(`${href}/accounts`);
  const tabs = page.getByTestId("profile-tabs");
  await expect(tabs).toBeVisible();
  await expect(tabs).toHaveAttribute("aria-label", "Profile sections");
  const current = tabs.getByRole("link", { name: "Riot Accounts" });
  await expect(current).toHaveAttribute("aria-current", "page");
  await expect(current).toBeInViewport();
  // The same bar as Team's sections: the same tab height and the same mark under the current tab.
  const look = (l: ReturnType<typeof page.getByRole>) => l.evaluate((el) => ({ h: Math.round(el.getBoundingClientRect().height), mark: getComputedStyle(el).borderBottomWidth }));
  const profileTab = await look(current);
  await page.goto("/players");
  const teamTab = await look(page.getByTestId("team-tabs").getByRole("link", { name: "Players" }));
  expect(profileTab.mark).toBe(teamTab.mark);
  expect(Math.abs(profileTab.h - teamTab.h)).toBeLessThanOrEqual(4);
  // A tab opens its section, at its own address. The page streams in and hydrates after "load", and
  // a tap before then can be lost: tap until the page has moved.
  await page.goto(`${href}/accounts`);
  await expect(async () => {
    await tabs.getByRole("link", { name: "Overview" }).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`), { timeout: 5_000 });
  }).toPass({ timeout: 20_000 });
  await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
});

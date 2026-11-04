import { expect, test, type Page } from "./test";
import { createMember } from "./member-account";

/*
  THE Refresh of every profile tab (components/ui/data-status.tsx, refresh-store.ts): one quiet
  button at the end of the section's toolbar, after the filters, in the same place on Overview, All
  Champions, Match History and Encounters, with the page's data status in a few words and one ⓘ
  beside the scope line, no banner. A press reads Riot for real: the e2e server plays Riot with a
  stand-in for the accounts made in these tests (server/riot/browser-test.ts, three Ranked Solo
  games each), so the games arrive, the page is read again, the status moves on and a notification
  says what happened. Demo players are sample data, never read from Riot: their pages show the
  status alone.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;

/** A new member (an admin creates them; the stand-in verifies their Riot ID), and their profile's address; seen as their own profile. */
async function freshProfile(page: Page, base: string): Promise<string> {
  const { username } = await createMember(page, base);
  await page.context().addCookies([{ name: "uniiverse_view", value: "player", url: new URL(page.url()).origin }]);
  await page.goto("/players", { waitUntil: "networkidle" });
  return (await page.locator(`main a[data-testid='player-card'][data-player-name='${username}']`).first().getAttribute("href"))!;
}

/** Holds every action back by `ms` (to see the progress), counting them. */
async function holdActions(page: Page, ms: number, counter = { posts: 0 }) {
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST") {
      counter.posts++;
      await new Promise((r) => setTimeout(r, ms));
    }
    await route.continue();
  });
  return counter;
}

/** Closes every notification, so the next one is the next answer. */
async function dismissToasts(page: Page) {
  const close = page.getByRole("button", { name: "Dismiss notification" });
  while (await close.count()) await close.first().click({ timeout: 1_000 }).catch(() => {});
}

async function press(page: Page) {
  const button = page.getByTestId("data-refresh-button");
  if (isPhone(page)) await button.tap();
  else await button.click();
}

test("Refresh ends the toolbar in the same place on every tab of a profile, never on a row of its own, with the status beside the scope line and no banner", async ({ page }) => {
  const href = await freshProfile(page, "Place");
  const seen = new Set<string>();
  for (const [tab, heading, filterBar] of [
    ["", "#season-stats", "overview-filters"],
    ["/champions", "#all-champions", "all-champions-filters"],
    ["/matches", "#match-history", "match-filters"],
    ["/matches?view=encounters", "#match-history", "encounter-filters"],
  ] as const) {
    await page.goto(`${href}${tab}`, { waitUntil: "networkidle" });
    const button = page.getByTestId("data-refresh-button");
    // One control, no banner: an icon and the word; the status in words with its ⓘ.
    await expect(page.getByTestId("data-status"), tab).toHaveCount(0);
    await expect(page.getByTestId("data-refresh"), tab).toHaveCount(1);
    await expect(button, tab).toHaveText("Refresh");
    await expect(button.locator("svg"), tab).toHaveCount(1);
    await expect(page.getByTestId("data-refresh-info"), tab).toBeVisible();
    await expect(page.getByTestId("data-refresh-words"), tab).toHaveText("Syncing");
    // In the section's toolbar, after the filters but never part of them.
    expect(await button.evaluate((el) => !!el.closest("[data-testid=section-toolbar]")), tab).toBe(true);
    expect(await button.evaluate((el) => !el.closest("form, [data-testid$=filters]")), tab).toBe(true);
    const [title, at, note] = await Promise.all([page.locator(heading).boundingBox(), button.boundingBox(), page.getByTestId("data-refresh").boundingBox()]);
    const filters = (await page.getByTestId(filterBar).boundingBox())!;
    expect(at!.x, `${tab}: Refresh after the filters`).toBeGreaterThanOrEqual(filters.x + filters.width - 1);
    // On the filters' row: its top level with theirs (the folded Filters button on a phone), never a row below them.
    expect(Math.abs(at!.y - filters.y), `${tab}: Refresh on the filters' row`).toBeLessThanOrEqual(2);
    // The status sits under the heading, on the scope line.
    expect(note!.y, tab).toBeGreaterThanOrEqual(title!.y + title!.height - 1);
    // Touch screens: a finger-sized button.
    if (isPhone(page)) expect(at!.height, tab).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), tab).toBeLessThanOrEqual(1);
    const right = await page.evaluate(() => window.innerWidth);
    seen.add(`${Math.round(right - at!.x - at!.width)}:${Math.round(at!.width)}×${Math.round(at!.height)}`);
  }
  // The same button at the same distance from the right edge on every tab.
  expect([...seen]).toHaveLength(1);
  // Riot accounts: the same Refresh in the panel header's toolbar, at the right of its title, without a status (each account says its own state there).
  await page.goto(`${href}/accounts`, { waitUntil: "networkidle" });
  const button = page.getByTestId("data-refresh-button");
  await expect(button).toHaveText("Refresh");
  await expect(page.getByTestId("data-refresh-info")).toHaveCount(0);
  const [panelTitle, at] = await Promise.all([page.getByRole("heading", { name: "Riot accounts", exact: true }).boundingBox(), button.boundingBox()]);
  expect(at!.x, "Refresh at the title's right").toBeGreaterThan(panelTitle!.x + panelTitle!.width);
  expect(at!.y, "on the title's row").toBeLessThan(panelTitle!.y + panelTitle!.height);
});

test("Refresh reads Riot, shows its progress, re-reads the page, and a second press is answered without asking again", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "phone and desktop cover the touch and the pointer");
  const href = await freshProfile(page, "Fresh");
  await page.goto(href, { waitUntil: "networkidle" });
  const control = page.getByTestId("data-refresh");
  const button = page.getByTestId("data-refresh-button");
  // A new account the regular sync has not read yet: Syncing, marked on the ⓘ.
  await expect(control).toHaveAttribute("data-state", "syncing");
  await expect(page.getByTestId("data-refresh-flag")).toBeVisible();
  await expect(page.getByTestId("season-record")).toHaveText("—");

  const counter = await holdActions(page, 1_000);
  await press(page);
  await expect(button).toHaveText("Refreshing…");
  await expect(button).toHaveAttribute("aria-disabled", "true");
  // Beside the scope line, which step runs: asking Riot now (then reading the page again).
  await expect(page.getByTestId("data-refresh-words")).toHaveText("Checking Riot…");
  // The result arrives as a notification once the page has been read again, with the new figures.
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText("3 new games", { timeout: 30_000 });
  await expect(toast).toHaveAttribute("data-tone", "success");
  await expect(button).toHaveText("Refresh");
  await expect(button).not.toHaveAttribute("aria-disabled", /.+/);
  await expect(page.getByTestId("season-record")).toHaveText("3");
  await expect(control).toHaveAttribute("data-state", "current");
  await expect(page.getByTestId("data-refresh-flag")).toHaveCount(0);
  // The ⓘ says it all: the word, when Riot was read, and what this Refresh did.
  const infoTip = page.getByTestId("data-refresh-info");
  if (isPhone(page)) await infoTip.tap();
  else await infoTip.hover();
  const bubble = page.getByTestId("data-refresh-info-bubble");
  await expect(bubble).toContainText("Up to date");
  await expect(bubble.getByTestId("data-refresh-times")).toContainText("Last checked: just now");
  await expect(bubble.getByTestId("data-refresh-last")).toContainText("Refreshed just now: 3 new games");
  await page.keyboard.press("Escape");

  // Straight away again: answered here, without asking the server or Riot.
  const asked = counter.posts;
  await dismissToasts(page);
  await press(page);
  await expect(page.getByTestId("toast").filter({ hasText: "try again in" })).toContainText(/Refreshed just now · try again in (\d+ min|\d+ s)/);
  expect(counter.posts).toBe(asked);
  // Match History, by the profile's tab: the same games, and its Refresh knows the profile was just refreshed.
  // (On a phone the profile's sections ride in the top bar.)
  await page.getByTestId(isPhone(page) ? "profile-chrome-tab-matches" : "profile-tab-matches").click();
  await expect(page).toHaveURL(/\/matches/);
  await expect(page.getByTestId("match-row")).toHaveCount(3);
  await dismissToasts(page);
  await press(page);
  await expect(page.getByTestId("toast")).toContainText(/Refreshed (just now|1m ago) · try again in/);
  expect(counter.posts).toBe(asked);
  // A fresh page forgets what this one knew: the server answers from the account's own cooldown, without asking Riot.
  await page.reload({ waitUntil: "networkidle" });
  await press(page);
  await expect(page.getByTestId("toast")).toContainText(/try again in (\d+ min|\d+ s)/);
  expect(counter.posts).toBe(asked + 1);
  await expect(page.getByTestId("match-row")).toHaveCount(3);
});

test("a Refresh carries on while the profile's tab changes, and the next tab shows its result", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one size covers the store shared by every tab");
  const href = await freshProfile(page, "Switch");
  await page.goto(href, { waitUntil: "networkidle" });
  await holdActions(page, 2_000);
  await press(page);
  await expect(page.getByTestId("data-refresh-button")).toHaveText("Refreshing…");
  await page.getByTestId("profile-tab-champions").click();
  await expect(page).toHaveURL(/\/champions/);
  await expect(page.getByTestId("all-champions")).toBeVisible();
  // Still refreshing there, then the result, and the new games in the table.
  await expect(page.getByTestId("data-refresh-button")).toHaveText("Refreshing…");
  await expect(page.getByTestId("toast")).toContainText("3 new games", { timeout: 30_000 });
  await expect(page.getByTestId("data-refresh-button")).toHaveText("Refresh");
  await expect(page.getByTestId("all-champions").locator("li[data-champion]")).toHaveCount(3);
});

test("a Refresh that fails says so, and the status stays as it was", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the failure looks the same at every size");
  const href = await freshProfile(page, "Fails");
  await page.goto(href, { waitUntil: "networkidle" });
  await page.route("**/*", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await press(page);
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(/Couldn't refresh/);
  await expect(toast).toHaveAttribute("data-tone", "error");
  await expect(toast).not.toContainText(/new games?|up to date/i);
  await expect(page.getByTestId("data-refresh-button")).toHaveText("Refresh");
  await expect(page.getByTestId("data-refresh")).toHaveAttribute("data-state", "syncing");
});

test("demo players and the team's boards show the status alone: nothing there Riot can be asked about", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "phone and desktop cover the layouts");
  await page.goto("/players");
  const href = (await page.locator("main a[data-testid='player-card'][data-player-name='Demo Support']").first().getAttribute("href"))!;
  for (const tab of ["", "/champions", "/matches"]) {
    await page.goto(`${href}${tab}`, { waitUntil: "networkidle" });
    await expect(page.getByTestId("data-refresh"), tab).toHaveCount(1);
    await expect(page.getByTestId("data-refresh-button"), tab).toHaveCount(0);
    await expect(page.getByTestId("data-refresh-info"), tab).toBeVisible();
    await expect(page.getByTestId("data-status"), tab).toHaveCount(0);
  }
  // Team Leaderboards: the team's status in the same ⓘ, no Refresh, and no second line saying when.
  await page.goto("/leaderboards", { waitUntil: "networkidle" });
  await expect(page.getByTestId("leaderboards-status")).toBeVisible();
  await expect(page.getByTestId("leaderboards-status-button")).toHaveCount(0);
  await expect(page.getByTestId("last-updated")).toHaveCount(0);
  const infoTip = page.getByTestId("leaderboards-status-info");
  if (isPhone(page)) await infoTip.tap();
  else await infoTip.hover();
  await expect(page.getByTestId("leaderboards-status-info-bubble")).toContainText("The boards follow the account syncs");
});

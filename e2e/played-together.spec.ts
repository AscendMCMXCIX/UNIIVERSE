import { expect, test, type Page } from "./test";
import { openFilterBar } from "./filters";

/*
  Team → Matches → Played together on the demo roster. The shared games are synthetic demo games
  (demo mode only, match ids DEMO_9…), never real Riot data.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Phones fold the filters behind one button (shared helper: waits for the bar, retries the toggle). */
async function showFilters(page: Page) {
  await openFilterBar(page.getByTestId("together-filters"), "together-filters-toggle");
}

test("Played together lists games with two or more members on one side, with honest labels and filters", async ({ page }) => {
  // Played together is the whole page: Encounters are in each profile's Match History.
  await page.goto("/matches");
  await expect(page.getByTestId("matches-tabs")).toHaveCount(0);
  // One line of what is counted; what it proves is behind (i), never claimed as a premade party.
  const summary = page.getByTestId("matches-summary");
  await expect(summary).toContainText(/Season 2026 · \d+ games? played together/);
  await expect(summary.getByRole("button", { name: "How games played together are found" })).toHaveAccessibleDescription(/not confirmed premade parties/);
  // No "played together most" ranking: the games come right after the toolbar.
  await expect(page.getByTestId("together-pairs")).toHaveCount(0);
  await expect(page.getByText("Played together most")).toHaveCount(0);
  const games = page.getByTestId("together-game");
  await expect(games.first()).toBeVisible();
  // The first game starts within the first screen on wide screens and about one screen on phones.
  const top = await games.first().evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  expect(top).toBeLessThan((page.viewportSize()?.width ?? 0) < 640 ? 640 : 500);
  // Phones: the filters are folded behind one summary button.
  if ((page.viewportSize()?.width ?? 0) < 640) {
    await expect(page.getByTestId("together-queue")).toBeHidden();
    await expect(page.getByTestId("together-filters-toggle")).toContainText(/Season 2026 · All supported games · 2\+ members/);
  }
  // Season 2026 is the only season here (no 2025, no "All seasons"), so there is nothing to choose.
  await expect(page.getByTestId("together-season")).toHaveCount(0);
  await expect(page.getByText("All seasons")).toHaveCount(0);
  // Every game shows at least two members, each with a champion and a role.
  const sizes = await games.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-members"))));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
  await expect(games.first().getByTestId("together-member").first()).toContainText(/\d+\/\d+\/\d+/);
  // The rule is said once for the page, not repeated on every game.
  await expect(page.getByText("party not verified")).toHaveCount(0);
  // Every game shows both teams: five a side, the members' side tinted, and a member who played
  // on the other team marked there (no need to open the match).
  const teams = games.first().getByTestId("match-teams");
  await expect(teams.locator("[data-side=blue] [data-testid=team-slot]")).toHaveCount(5);
  await expect(teams.locator("[data-side=red] [data-testid=team-slot]")).toHaveCount(5);
  await expect(teams.locator("[data-own]")).toHaveCount(1);
  await expect(page.getByTestId("together-game").locator("[data-side]:not([data-own]) [data-member]").first()).toBeAttached();

  // Three or more members only.
  await showFilters(page);
  await page.getByTestId("together-min").selectOption("3");
  await expect(page).toHaveURL(/min=3/);
  const three = await page.getByTestId("together-game").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-members"))));
  expect(three.length).toBeGreaterThan(0);
  expect(Math.min(...three)).toBeGreaterThanOrEqual(3);
  // Ranked Solo/Duo with three: not all of them can have queued together, and the page says so.
  await showFilters(page);
  await page.getByTestId("together-queue").selectOption("solo");
  await expect(page).toHaveURL(/queue=solo/);
  await expect(page.getByText(/Ranked Solo\/Duo allows parties of two at most/).first()).toBeVisible();
  // All five, Clash: none in the demo, so an honest empty state, and Clear filters puts every filter back.
  await showFilters(page);
  await page.getByTestId("together-queue").selectOption("clash");
  await expect(page).toHaveURL(/queue=clash/);
  await expect(page.getByTestId("together-empty")).toBeVisible();
  await expect(page.getByTestId("matches-summary")).toContainText("0 games");
  await showFilters(page);
  await page.getByTestId("together-filters").getByTestId("reset-filters").click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByTestId("together-game").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("teammate combinations: choose members in the searchable picker, see only their shared games and how they do together", async ({ page }) => {
  await page.goto("/matches");
  // Two members of the first game, chosen from the picker (search, then pick).
  const firstGame = page.getByTestId("together-game").first();
  const ids = await firstGame.getByTestId("together-member").evaluateAll((els) => els.map((e) => e.getAttribute("data-player-id")!));
  const names = await firstGame.getByTestId("together-member").evaluateAll((els) => els.map((e) => e.querySelector("a")?.textContent?.trim() ?? ""));
  const pick = async (i: number) => {
    await showFilters(page);
    const picker = page.getByTestId("together-with");
    if (!(await picker.getByTestId("together-with-panel").isVisible())) await picker.getByTestId("together-with-button").click();
    await picker.getByTestId("together-with-search").fill(names[i]!.slice(0, 4));
    await picker.locator(`[data-testid=together-with-option][data-player-id="${ids[i]}"]`).click();
  };
  await pick(0);
  await expect(page).toHaveURL(new RegExp(`with=${ids[0]}`));
  await pick(1);
  await expect(page).toHaveURL(/with=[^&]+%2C|with=[^&]+,/);
  const chosen = ids.slice(0, 2);
  // The picker says who is chosen, and Escape closes it.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("together-with-button")).toContainText(names[0]!);
  // Every listed game has both chosen members on the same team.
  const games = page.getByTestId("together-game");
  const n = await games.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const members = await games.nth(i).getByTestId("together-member").evaluateAll((els) => els.map((e) => e.getAttribute("data-player-id")));
    for (const id of chosen) expect(members).toContain(id);
  }
  // The summary agrees with the list: games and record.
  const summary = page.getByTestId("together-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(`${n}`);
  const wins = await page.locator("[data-testid=together-game] >> text=Victory").count();
  await expect(summary).toContainText(`${wins}W ${n - wins}L`);
  await expect(summary.getByTestId("together-most-played")).toBeVisible();
  // "Anyone" clears the choice.
  await showFilters(page);
  await page.getByTestId("together-with-button").click();
  await page.getByTestId("together-with-clear").click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByTestId("together-summary")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});


test("a Team Matches card opens the match window, with the breakdown Match History opens under its cards; names and the bookmark keep their own action", async ({ page }) => {
  await page.goto("/matches");
  const card = page.getByTestId("together-game").first();
  await expect(card).toBeVisible();
  const matchId = (await card.getAttribute("data-match-id"))!;
  // The bookmark toggles without opening the match.
  const bookmark = card.getByTestId("bookmark-game");
  if ((await bookmark.count()) && (await bookmark.getAttribute("data-bookmarked")) !== "true") {
    await bookmark.click();
    await expect(bookmark).toHaveAttribute("data-bookmarked", "true");
    await expect(page.getByTestId("match-detail")).toHaveCount(0);
    await bookmark.click();
    await expect(bookmark).not.toHaveAttribute("data-bookmarked", "true");
  }
  // A click on the card (not on a name) opens the shared match window, with both teams.
  await card.click({ position: { x: 24, y: 12 } });
  const detail = page.getByTestId("match-detail");
  await expect(detail).toBeVisible();
  await expect(detail.getByTestId("team-blue")).toBeVisible();
  await expect(detail.getByTestId("team-red")).toBeVisible();
  // Members are marked in the scoreboard as in Match History.
  expect(await detail.locator("[data-player]").count()).toBeGreaterThanOrEqual(1);
  // Escape closes it and the focus is back on the card.
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);
  await expect(card.getByTestId("together-open")).toBeFocused();
  // The keyboard opens it too.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("match-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("match-detail")).toHaveCount(0);
  // A member's name opens their profile, not the match.
  const name = card.getByTestId("together-member").first().getByRole("link").first();
  await name.click();
  await expect(page).toHaveURL(/\/players\/[0-9a-f-]+$/);
  expect(matchId.length).toBeGreaterThan(0);
});

test("old addresses for Season 2025 or all seasons open Season 2026", async ({ page }) => {
  for (const q of ["season=15", "season=2025", "season=all"]) {
    await page.goto(`/matches?${q}`);
    await expect(page.getByTestId("matches-summary")).toContainText("Season 2026");
  }
});

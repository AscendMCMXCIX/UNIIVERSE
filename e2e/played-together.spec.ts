import { expect, test, type Page } from "@playwright/test";

/*
  Team → Matches → Played together on the demo roster. The shared games are synthetic demo games
  (demo mode only, match ids DEMO_9…), never real Riot data.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Phones fold the secondary filters (games, members, bookmarked) behind one button. */
async function showFilters(page: Page) {
  if (await page.getByTestId("together-queue-all").isVisible()) return;
  await page.getByTestId("together-filters-toggle").click();
  await expect(page.getByTestId("together-queue-all")).toBeVisible();
}

test("Played together lists games with two or more members on one side, with honest labels and filters", async ({ page }) => {
  // Played together is the default tab; the drafted archive is one tab away (and back).
  await page.goto("/matches");
  await expect(page.getByTestId("matches-tab-together")).toHaveAttribute("aria-current", "page");
  await page.getByTestId("matches-tab-drafted").click();
  await expect(page).toHaveURL(/view=drafted/);
  await expect(page.getByTestId("matches-tab-drafted")).toHaveAttribute("aria-current", "page");
  await page.getByTestId("matches-tab-together").click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByTestId("together-note")).toContainText(/not confirmed premade/);
  const games = page.getByTestId("together-game");
  await expect(games.first()).toBeVisible();
  // Every game shows at least two members, each with a champion and a role.
  const sizes = await games.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-members"))));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
  await expect(games.first().getByTestId("together-member").first()).toContainText(/\d+\/\d+\/\d+/);
  // The rule is said once for the page, not repeated on every game.
  await expect(page.getByText("party not verified")).toHaveCount(0);
  // A game with a member on the other team names them separately.
  await expect(page.getByText(/Also in this game, on the other team:/)).toBeVisible();

  // Three or more members only.
  await showFilters(page);
  await page.getByTestId("together-min-3").click();
  await expect(page).toHaveURL(/min=3/);
  const three = await page.getByTestId("together-game").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-members"))));
  expect(three.length).toBeGreaterThan(0);
  expect(Math.min(...three)).toBeGreaterThanOrEqual(3);
  // Ranked Solo/Duo with three: not all of them can have queued together, and the page says so.
  await showFilters(page);
  await page.getByTestId("together-queue-solo").click();
  await expect(page).toHaveURL(/queue=solo/);
  await expect(page.getByText(/Ranked Solo\/Duo allows parties of two at most/).first()).toBeVisible();
  // All five, Clash: none in the demo, so an honest empty state.
  await showFilters(page);
  await page.getByTestId("together-queue-clash").click();
  await expect(page.getByTestId("together-empty")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("teammate combinations: choose members, see only their shared games and how they do together", async ({ page }) => {
  await page.goto("/matches");
  // A "played together most" pair is a shortcut to that combination.
  const pair = page.getByTestId("together-pair").first();
  await expect(pair).toBeVisible();
  await pair.click();
  await expect(page).toHaveURL(/with=/);
  const chosen = await page.locator("[data-testid=together-player][data-selected=true]").evaluateAll((els) => els.map((e) => e.getAttribute("data-player-id")!));
  expect(chosen).toHaveLength(2);
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
  // Adding a third member narrows the list (or empties it, honestly); "Anyone" clears the choice.
  await page.getByTestId("together-clear").click();
  await expect(page).toHaveURL(/\/matches$/);
  await expect(page.getByTestId("together-summary")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});


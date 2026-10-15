import { expect, test } from "@playwright/test";

/*
  Team → Matches → Played together on the demo roster. The shared games are synthetic demo games
  (demo mode only, match ids DEMO_9…), never real Riot data.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("Played together lists games with two or more members on one side, with honest labels and filters", async ({ page }) => {
  await page.goto("/matches");
  await expect(page.getByTestId("matches-tab-drafted")).toHaveAttribute("aria-current", "page");
  await page.getByTestId("matches-tab-together").click();
  await expect(page).toHaveURL(/view=together/);
  await expect(page.getByTestId("together-note")).toContainText(/not confirmed premade/);
  const games = page.getByTestId("together-game");
  await expect(games.first()).toBeVisible();
  // Every game shows at least two members, each with a champion and a role.
  const sizes = await games.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-members"))));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2);
  await expect(games.first().getByTestId("together-member").first()).toContainText(/\d+\/\d+\/\d+/);
  await expect(games.first()).toContainText("party not verified");
  // A game with a member on the other team names them separately.
  await expect(page.getByText(/Also in this game, on the other team:/)).toBeVisible();

  // Three or more members only.
  await page.getByTestId("together-min-3").click();
  await expect(page).toHaveURL(/min=3/);
  const three = await page.getByTestId("together-game").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-members"))));
  expect(three.length).toBeGreaterThan(0);
  expect(Math.min(...three)).toBeGreaterThanOrEqual(3);
  // Ranked Solo/Duo with three: not all of them can have queued together, and the page says so.
  await page.getByTestId("together-queue-solo").click();
  await expect(page).toHaveURL(/queue=solo/);
  await expect(page.getByText(/Ranked Solo\/Duo allows parties of two at most/).first()).toBeVisible();
  // All five, Clash: none in the demo, so an honest empty state.
  await page.getByTestId("together-queue-clash").click();
  await expect(page.getByTestId("together-empty")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

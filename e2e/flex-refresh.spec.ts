import { expect, test } from "./test";

/*
  Ranked Flex (Riot queue 440) where players look for it, and Match History's data status.
  Demo games are synthetic demo data (about a third of them Ranked Flex), never read from Riot, so
  a demo player's Match History shows its data status without a Refresh.
*/

test.beforeEach(async ({ context, baseURL }, info) => {
  test.skip(info.project.name !== "desktop", "runs once, on the desktop project");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("Match History: the game-mode filter counts Ranked Flex games and lists only them", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  // On arrival the list fits its page size to the screen (an address replace); choose the mode only
  // once that has settled, or the re-render can land between the choice and its change event.
  await page.waitForLoadState("networkidle");
  const mode = page.getByTestId("match-filters").getByLabel("Game mode");
  const flex = mode.locator("option[value='flex']");
  // Each mode names its games this season, so an empty choice is visible before choosing it.
  await expect(flex).toHaveText(/^Ranked Flex \(\d+\)$/);
  const flexCount = Number((await flex.innerText()).match(/\((\d+)\)/)![1]);
  expect(flexCount).toBeGreaterThan(0);
  await mode.selectOption("flex");
  await expect(page).toHaveURL(/mode=flex/);
  // The header names no totals; the mode is read in the filter itself.
  await expect(mode).toHaveValue("flex");
  const rows = page.getByTestId("match-row");
  await expect(rows.first()).toBeVisible();
  for (const label of await rows.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))) expect(label).toContain("Ranked Flex");
  // All supported games includes them.
  const all = Number((await mode.locator("option[value='all']").innerText()).match(/\((\d+)\)/)![1]);
  const solo = Number((await mode.locator("option[value='solo']").innerText()).match(/\((\d+)\)/)![1]);
  expect(all).toBeGreaterThanOrEqual(flexCount + solo);
});

test("Match History: freshness sits behind one ⓘ under the title, and a demo player's page offers no Refresh", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches?mode=solo&page=1`);
  // A minimal header: the title, Refresh's place with the page's status, and the filters; then the
  // games. No season totals or averages (they are on the Overview); each game keeps its own figures.
  const history = page.getByTestId("match-history");
  await expect(history.getByRole("heading", { level: 2 })).toHaveText("Match History");
  await expect(page.getByTestId("match-count")).toHaveCount(0);
  await expect(page.getByTestId("match-summary")).toHaveCount(0);
  const header = history.locator("> div").first();
  await expect(header).not.toContainText(/win rate|damage\/min|CS\/min|KDA/);
  await expect(page.getByTestId("match-card").first()).toContainText("CS/min");
  // No banner: the status is one ⓘ, in the same words as every page.
  await expect(page.getByTestId("data-status")).toHaveCount(0);
  await expect(page.getByTestId("data-refresh")).toHaveCount(1);
  await page.getByTestId("data-refresh-info").hover();
  const bubble = page.getByTestId("data-refresh-info-bubble");
  await expect(bubble).toContainText(/Up to date|Syncing|Partial data|Delayed|Needs attention/);
  // Only the times there are, never a placeholder: demo accounts are never read from Riot, so
  // there is no "Last checked", only the newest game.
  const times = bubble.getByTestId("data-refresh-times");
  await expect(times).toContainText(/Newest game: (.+ ago|just now)/);
  await expect(times).not.toContainText(/Last checked|not yet|never/);
  // And no Refresh: demo games are sample data, so there is nothing Riot could be asked about
  // (profile-refresh.spec covers a real refresh, with the browser tests' stand-in for Riot).
  await expect(page.getByTestId("data-refresh-button")).toHaveCount(0);
  // The filters stay as they were.
  await expect(page).toHaveURL(/mode=solo/);
});

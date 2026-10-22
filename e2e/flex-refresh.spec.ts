import { expect, test } from "./test";

/*
  Ranked Flex (Riot queue 440) where players look for it, and the Match History refresh.
  Demo games are synthetic demo data (about a third of them Ranked Flex); the e2e server has no
  Riot API key, so a refresh honestly reports that it is not available instead of "updated".
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

test("Match History: freshness is stated, and a refresh reports what actually happened", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches?mode=solo&page=1`);
  // The page's one status line (the same as Overview's), then a minimal header: the title and the
  // filters, then the games. No season totals or averages (they are on the Overview); each game
  // keeps its own figures.
  const history = page.getByTestId("match-history");
  await expect(history.getByRole("heading", { level: 2 })).toHaveText("Match History");
  await expect(page.getByTestId("match-count")).toHaveCount(0);
  await expect(page.getByTestId("match-summary")).toHaveCount(0);
  const header = history.locator("> div").first();
  await expect(header).not.toContainText(/win rate|damage\/min|CS\/min|KDA/);
  await expect(page.getByTestId("match-card").first()).toContainText("CS/min");
  await expect(page.getByTestId("data-status")).toHaveCount(1);
  await expect(page.getByTestId("data-status-label")).toHaveText(/^(Up to date|Syncing|Partial data|Delayed|Needs attention)$/);
  await page.getByTestId("data-status-details-toggle").click();
  // Only the times there are: when the accounts were last read and the newest game, never a placeholder.
  await expect(page.getByTestId("data-status-details")).toContainText(/Checked (.+ ago|just now)( · newest game (.+ ago|just now))?|Newest game (.+ ago|just now)/);
  await expect(page.getByTestId("data-status-details")).not.toContainText("Not checked yet");
  // Refresh asks the server and says what happened: here (no Riot key) that it is not available.
  await page.getByTestId("data-status-refresh").click();
  const result = page.getByTestId("data-status-result");
  await expect(result).toHaveText(/not available right now/);
  await expect(result).not.toHaveText(/new games?|updated/i);
  // The filters stay as they were.
  await expect(page).toHaveURL(/mode=solo/);
});

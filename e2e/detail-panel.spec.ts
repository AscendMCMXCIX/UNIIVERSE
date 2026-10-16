import { expect, test } from "@playwright/test";

/*
  The shared detail panel (Team's player panel is the model): match details open from a Match
  History row in the same panel, close with Escape and give focus back to the row; the page behind
  does not scroll while it is open. Demo games are synthetic demo data.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

test("match details open in the shared panel, close with Escape and return focus to the game", async ({ page }) => {
  await page.goto("/team");
  const id = (await page.getByTestId("lineup-row-TOP").getAttribute("data-player-id"))!;
  await page.goto(`/players/${id}/matches`);
  const row = page.getByTestId("match-row").first();
  await expect(row).toBeVisible();
  // Secondary details live in the panel, not on the row.
  await expect(page.getByTestId("match-lineups")).toHaveCount(0);
  await row.click();
  const panel = page.getByTestId("match-detail");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-size", "xl");
  await expect(page.getByTestId("match-result")).toHaveText(/Victory|Defeat/);
  await expect(page).toHaveURL(/match=/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(row).toBeFocused();
  await expect(page).not.toHaveURL(/match=/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe("hidden");
  // A deep link opens the same game.
  const matchId = (await row.getAttribute("data-match"))!;
  await page.goto(`/players/${id}/matches?match=${matchId}`);
  await expect(page.getByTestId("match-detail")).toBeVisible();
  await page.getByTestId("match-detail-close").click();
  await expect(page.getByTestId("match-detail")).toBeHidden();
});

test("Team: the chosen card lifts and the others step back; pools are viewed here and edited on the profile", async ({ page }) => {
  await page.goto("/team");
  await expect(page.getByTestId("team-name")).toBeVisible();
  const mid = page.getByTestId("lineup-row-MID");
  const id = (await mid.getAttribute("data-player-id"))!;
  const open = mid.getByTestId("open-player-detail");
  await open.click();
  const panel = page.getByTestId("player-detail");
  await expect(panel).toBeVisible();
  await expect(mid).toHaveAttribute("data-selected", "true");
  await expect(page.locator("[data-testid^=lineup-row-][data-selected]")).toHaveCount(1);
  // The pool is listed, never edited here: the owner gets a link to the profile instead.
  await expect(panel.getByTestId("pool-list")).toBeVisible();
  await expect(page.getByTestId("edit-roster-champions")).toHaveCount(0);
  await expect(panel.getByTestId("edit-pool-on-profile")).toHaveAttribute("href", `/players/${id}#champion-pools`);
  // Next player: the selection follows the panel.
  await panel.getByTestId("detail-next").click();
  await expect(mid).not.toHaveAttribute("data-selected", "true");
  await expect(page.locator("[data-testid^=lineup-row-][data-selected]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-testid^=lineup-row-][data-selected]")).toHaveCount(0);
});

test("the Team player panel returns focus to its card when closed", async ({ page }) => {
  await page.goto("/team");
  const open = page.getByTestId("lineup-row-MID").getByTestId("open-player-detail");
  await open.click();
  await expect(page.getByTestId("player-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("player-detail")).toBeHidden();
  await expect(open).toBeFocused();
});

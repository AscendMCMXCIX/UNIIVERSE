import { expect, test, type Page } from "@playwright/test";
import { openFilterBar } from "./filters";

/*
  Profile → Matchups on the demo roster (synthetic demo games with lane opponents and timeline
  frames, in-memory only): choose a champion and an opponent, read the record and the lane with
  their sample sizes, and open a game behind the numbers. Phones choose the champion with a
  dropdown; opponents are one row of chips above the matchup on every screen.
*/

async function firstProfile(page: Page) {
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']").first().getAttribute("href");
  return new URL(href!, "http://x").pathname;
}

test("a matchup shows its record, the lane with sample sizes, and the games behind it", async ({ page }) => {
  const profile = await firstProfile(page);
  await page.goto(`${profile}/matchups`);
  const view = page.getByTestId("matchups");
  await expect(view).toBeVisible();
  await expect(page.getByTestId("matchups-scope")).toContainText(/Lane opponents in \d+ of \d+ games/);
  const detail = page.getByTestId("matchup-detail");
  await expect(detail).toBeVisible();
  // Choose the second opponent faced, from the row of chips above the matchup.
  const items = page.getByTestId("matchups-opponents-item");
  if ((await items.count()) > 1) {
    const vs = await items.nth(1).getAttribute("data-champion");
    await items.nth(1).click();
    await expect(page).toHaveURL(new RegExp(`vs=${vs}`));
    await expect(items.nth(1)).toHaveAttribute("aria-current", "true");
  }
  // The record and its sample; the lane figures each say how many games they cover.
  const games = Number(await page.getByTestId("matchup-games").locator("dd").first().textContent());
  expect(games).toBeGreaterThan(0);
  await expect(page.getByTestId("matchup-timelines")).toContainText(new RegExp(`(of|these) ${games} game`));
  if (await page.getByTestId("matchup-checkpoints").isVisible()) {
    for (const m of [5, 10]) expect(Number(await page.getByTestId(`checkpoint-games-${m}`).textContent())).toBeLessThanOrEqual(games);
    await expect(page.getByTestId("matchup-notes")).toContainText(/not why/);
  }
  // Every game is listed and opens the same details panel as Match History.
  await expect(page.getByTestId("matchup-game")).toHaveCount(games);
  await page.getByTestId("matchup-game").first().click();
  await expect(page.getByTestId("match-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("match-detail")).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the game-mode filter narrows the matchups and Reset brings every game back", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const profile = await firstProfile(page);
  await page.goto(`${profile}/matchups`);
  const bar = page.getByTestId("matchups-filters");
  await expect(bar).toBeVisible();
  await openFilterBar(bar);
  await bar.getByTestId("matchups-mode").selectOption("solo");
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page.getByTestId("matchups-scope")).toContainText("Ranked Solo/Duo");
  await openFilterBar(bar);
  await bar.getByTestId("reset-filters").click();
  await expect(page).not.toHaveURL(/mode=/);
});

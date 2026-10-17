import { expect, test, type Locator, type Page } from "@playwright/test";

/*
  All Champions → a champion's window on the demo roster (synthetic demo games with lane opponents
  and timeline frames, in-memory only): the row opens the window on Overview; Matchups shows one
  lane opponent at a time, chosen from a searchable list, with the record and the lane and their
  sample sizes; a game opens the match window in place of this one, with a way back. Old Matchups
  addresses land in the same window. The window lives in the URL (links and Back work).
*/

async function firstProfile(page: Page) {
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']").first().getAttribute("href");
  return new URL(href!, "http://x").pathname;
}

/** Opens a champion's window, clicking again until the page is interactive (a click before hydration does nothing). */
async function openChampion(page: Page, button: Locator) {
  const win = page.getByTestId("champion-detail");
  await expect(async () => {
    if (!(await win.isVisible())) await button.click({ timeout: 2_000 });
    await expect(win).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

const openDialogs = (page: Page) => page.evaluate(() => [...document.querySelectorAll("dialog")].filter((d) => d.open).length);

test("a champion opens its window: overview, then a matchup with its record, lane and games", async ({ page }) => {
  const profile = await firstProfile(page);
  await page.goto(`${profile}/champions`);
  const row = page.getByTestId("top-champion").first();
  const champion = await row.getAttribute("data-champion");
  await openChampion(page, row.getByTestId("open-champion"));
  const win = page.getByTestId("champion-detail");
  await expect(page).toHaveURL(new RegExp(`champion=${champion}`));
  await expect(page.getByTestId("champion-tab-overview")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("champion-stat-games")).toBeVisible();
  await expect(page.getByTestId("champion-detail-scope")).toContainText(/Season/);
  await expect(page.getByTestId("champion-lane").or(page.getByTestId("champion-lane-empty"))).toBeVisible();

  // Matchups: the opponent picker, the record and its sample, the lane with games per column.
  await page.getByTestId("champion-tab-matchups").click();
  await expect(page).toHaveURL(/tab=matchups/);
  const picker = page.getByTestId("opponent-picker-button");
  await expect(picker).toBeVisible();
  await picker.click();
  const options = page.getByTestId("opponent-picker-option");
  if ((await options.count()) > 1) {
    const vs = await options.nth(1).getAttribute("data-champion");
    await options.nth(1).click();
    await expect(page).toHaveURL(new RegExp(`vs=${vs}`));
    await expect(page.getByTestId("opponent-picker-current")).toContainText(" vs ");
  } else await page.getByTestId("opponent-picker-search").press("Escape");
  // Escape in the list closes the list, never the window.
  await picker.click();
  await page.getByTestId("opponent-picker-search").press("Escape");
  await expect(page.getByTestId("opponent-picker-popover")).toHaveCount(0);
  await expect(win).toBeVisible();

  const games = Number(await page.getByTestId("matchup-games").locator("dd").first().textContent());
  expect(games).toBeGreaterThan(0);
  await expect(page.getByTestId("matchup-timelines")).toContainText(new RegExp(`(of|these) ${games} game`));
  if (await page.getByTestId("matchup-checkpoints").isVisible()) {
    for (const m of [5, 10]) expect(Number(await page.getByTestId(`checkpoint-games-${m}`).textContent())).toBeLessThanOrEqual(games);
    await expect(page.getByTestId("lane-notes")).toContainText(/not why/);
  }
  await expect(page.getByTestId("lane-game")).toHaveCount(games);

  // A game replaces the window (one dimmed layer), Back returns to the same matchup.
  await page.getByTestId("lane-game").first().click();
  await expect(page.getByTestId("match-detail")).toBeVisible();
  expect(await openDialogs(page)).toBe(1);
  await page.getByTestId("match-detail-back").click();
  await expect(page.getByTestId("matchup-summary")).toBeVisible();
  await expect(page.getByTestId("champion-tab-matchups")).toHaveAttribute("aria-selected", "true");

  // Escape closes the window and the address no longer names it.
  await page.keyboard.press("Escape");
  await expect(win).toBeHidden();
  await expect(page).not.toHaveURL(/champion=/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the lane chart reads a minute with its games, for gold, experience or CS", async ({ page }, info) => {
  test.skip(info.project.name === "tablet", "runs on phone and desktop");
  const profile = await firstProfile(page);
  await page.goto(`${profile}/champions`);
  await openChampion(page, page.getByTestId("open-champion").first());
  await page.getByTestId("champion-tab-matchups").click();
  await expect(page.getByTestId("matchup-summary")).toBeVisible();
  const svg = page.getByTestId("matchup-chart-svg");
  test.skip((await svg.count()) === 0, "this matchup has too few timelines for a curve");
  await svg.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("matchup-chart-readout")).toContainText(/\d+:00 · /);
  await page.getByTestId("matchup-chart-metric-xp").click();
  await expect(page.getByTestId("matchup-chart")).toHaveAttribute("data-metric", "xp");
});

test("old Matchups addresses open the champion window on Matchups, keeping the filters", async ({ page }) => {
  const profile = await firstProfile(page);
  await page.goto(`${profile}/matchups?mode=solo`);
  await expect(page).toHaveURL(/\/champions\?.*tab=matchups/);
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page.getByTestId("champion-detail")).toBeVisible();
  await expect(page.getByTestId("champion-tab-matchups")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("champion-detail-scope")).toContainText("Ranked Solo/Duo");
  // The profile's sections no longer list Matchups.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-detail")).toBeHidden();
  await expect(page.getByRole("link", { name: "Matchups", exact: true })).toHaveCount(0);
});

import { expect, test, type Page } from "@playwright/test";

/*
  Team → Matches → Encounters on the demo roster. The recurring players are synthetic demo players
  placed in the synthetic demo games (demo mode only, server/demo/encounters-fixture), never real
  Riot data.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Phones fold the secondary filters behind one button. */
async function showFilters(page: Page) {
  if (await page.getByTestId("encounter-min-3").isVisible()) return;
  await page.getByTestId("encounter-filters-toggle").click();
  await expect(page.getByTestId("encounter-min-3")).toBeVisible();
}

test("Encounters lists allies and opponents met repeatedly, with honest wording and filters", async ({ page }) => {
  await page.goto("/matches");
  await page.getByTestId("matches-tab-encounters").click();
  await expect(page).toHaveURL(/view=encounters/);
  await expect(page.getByTestId("matches-tab-encounters")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("encounters-note")).toContainText(/not parties, friendships/);
  // Never premade, duo-partner or "counter" language.
  await expect(page.getByTestId("encounters")).not.toContainText(/premade|duo partner|\bcounters?\b/i);

  // Allies by default: everyone listed was on a member's team at least twice.
  await expect(page.getByTestId("encounter-view-allies")).toHaveAttribute("aria-current", "page");
  const rows = page.getByTestId("encounter-row");
  await expect(rows.first()).toBeVisible();
  for (const text of await page.getByTestId("encounter-record").allTextContents()) expect(text).toMatch(/^Played alongside (twice|\d+ times) · \d+W \d+L/);
  // Fewer than five games is labelled as a small sample.
  expect(await page.getByTestId("encounter-small-sample").count()).toBeGreaterThan(0);

  // Opponents.
  await page.getByTestId("encounter-view-opponents").click();
  await expect(page).toHaveURL(/rel=opponents/);
  await expect(rows.first()).toBeVisible();
  for (const text of await page.getByTestId("encounter-record").allTextContents()) expect(text).toMatch(/^Faced (twice|\d+ times) · \d+W \d+L/);

  // At least three games: every remaining opponent was faced three or more times.
  await showFilters(page);
  await page.getByTestId("encounter-min-3").click();
  await expect(page).toHaveURL(/min=3/);
  const three = await page.getByTestId("encounter-record").allTextContents();
  for (const text of three) expect(text).toMatch(/^Faced \d+ times/);
  for (const text of three) expect(Number(/Faced (\d+) times/.exec(text)![1])).toBeGreaterThanOrEqual(3);

  // Players met by several members.
  await page.getByTestId("encounter-view-shared").click();
  await expect(page).toHaveURL(/rel=shared/);
  await expect(rows.first()).toBeVisible();
  for (const text of await page.getByTestId("encounter-record").allTextContents()) expect(Number(/by (\d+) members/.exec(text)![1])).toBeGreaterThanOrEqual(2);

  // A search that matches nobody: an honest empty state.
  await page.getByTestId("encounter-search-input").fill("Nobody Like This#NONE");
  await page.getByTestId("encounter-search-input").press("Enter");
  await expect(page).toHaveURL(/q=Nobody/);
  await expect(page.getByTestId("encounters-empty")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("a member's encounters, and one player's record, member breakdown and games, opening the match", async ({ page }) => {
  await page.goto("/matches?view=encounters");
  // One member: only their games count, so every row shows that member alone.
  const member = page.getByTestId("encounter-member-filter").first();
  const memberName = (await member.innerText()).trim();
  await member.click();
  await expect(page).toHaveURL(/member=/);
  await expect(member).toHaveAttribute("aria-current", "page");
  // The shared view is for several members, so it is not offered for one.
  const rows = page.getByTestId("encounter-row");
  if (await rows.count()) {
    for (const row of await rows.all()) await expect(row.getByTestId("encounter-member")).toHaveCount(1);
  }
  await page.getByTestId("encounter-member-all").click();
  await expect(page).not.toHaveURL(/member=/);

  // One player's window: totals, by member, recorded games; the counts agree with each other.
  await rows.first().click();
  const detail = page.getByTestId("encounter-detail");
  await expect(detail).toBeVisible();
  await expect(page.getByTestId("encounter-detail-summary")).toContainText(/\d+ recorded games? with team members/);
  const games = page.getByTestId("encounter-game");
  await expect(games.first()).toBeVisible();
  const summary = await page.getByTestId("encounter-detail-summary").innerText();
  const total = Number(/(\d+) recorded game/.exec(summary)![1]);
  // One line per member and game: never fewer lines than games.
  expect(await games.count()).toBeGreaterThanOrEqual(total);
  await expect(page.getByTestId("encounter-detail-members").locator("li").first()).toBeVisible();
  await expect(page.getByTestId("encounter-detail-note")).toContainText(/not parties/);
  // OP.GG opens in a new tab, never in place.
  const opgg = page.getByTestId("encounter-opgg");
  if (await opgg.count()) {
    await expect(opgg).toHaveAttribute("target", "_blank");
    await expect(opgg).toHaveAttribute("href", /^https:\/\/op\.gg\/lol\/summoners\//);
  }

  // A game opens the shared match window; Back returns to the player.
  await games.first().click();
  await expect(page.getByTestId("match-detail")).toBeVisible();
  await page.getByTestId("match-detail-back").click();
  await expect(page.getByTestId("encounter-detail")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("encounter-detail")).toBeHidden();
  expect(memberName.length).toBeGreaterThan(0);
});

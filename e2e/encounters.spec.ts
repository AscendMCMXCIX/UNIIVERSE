import { expect, test, type Page } from "./test";
import { openFilterBar } from "./filters";

/*
  A profile's Match History → Encounters on the demo roster. The recurring players are synthetic
  demo players placed in the synthetic demo games (demo mode only, server/demo/encounters-fixture),
  never real Riot data.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Encounters once its controls work (they wait for the page to be interactive). */
async function openEncounters(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
}

const gamesIn = (text: string) => (/\b(?:Faced|Alongside|Met) once\b/.test(text) ? 1 : Number(/\b(?:Faced|Alongside|Met) (\d+) times\b/.exec(text)![1]));
const countOf = async (option: ReturnType<Page["locator"]>) => Number(/\((\d+)\)/.exec((await option.textContent()) ?? "")![1]);

test("Encounters lists the opponents and allies a player keeps meeting, with honest wording", async ({ page }) => {
  // One switch away from the games; the season and game mode come along.
  await page.goto("/overview/matches");
  await page.getByTestId("match-view-encounters").click();
  await expect(page).toHaveURL(/view=encounters/);
  await expect(page.locator("[data-testid='encounters'][data-ready]")).toBeVisible();
  await expect(page.getByTestId("match-view-encounters")).toHaveAttribute("aria-current", "page");
  // What encounters prove is behind (i); never premade, duo-partner or "counter" language.
  await expect(page.getByRole("button", { name: "How encounters are counted" })).toHaveAccessibleDescription(/not parties, friendships/);
  await expect(page.getByTestId("encounters")).not.toContainText(/premade|duo partner|\bcounters?\b/i);

  // Opponents by default, met twice or more, the player's own record against them.
  await expect(page.getByTestId("encounter-relation-opponents")).toHaveAttribute("aria-current", "page");
  const rows = page.getByTestId("encounter-row");
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    const text = await row.getByTestId("encounter-record").innerText();
    expect(text).toMatch(/^Faced \d+ times · \d+W \d+L/);
    expect(gamesIn(text)).toBeGreaterThanOrEqual(2);
    // Fewer than five games is labelled a small sample, and only then.
    await expect(row.getByTestId("encounter-small-sample")).toHaveCount(gamesIn(text) < 5 ? 1 : 0);
  }

  // Allies, then everyone met.
  await page.getByTestId("encounter-relation-allies").click();
  await expect(page).toHaveURL(/rel=allies/);
  for (const text of await page.getByTestId("encounter-record").allTextContents()) expect(text).toMatch(/^Alongside \d+ times · \d+W \d+L/);
  await page.getByTestId("encounter-relation-everyone").click();
  await expect(page).toHaveURL(/rel=everyone/);
  await expect(rows.first()).toBeVisible();
  for (const text of await page.getByTestId("encounter-record").allTextContents()) expect(text).toMatch(/^Met \d+ times · \d+W \d+L/);

  // At least three games: every player left was met three times or more.
  await page.getByTestId("encounter-min").selectOption("3");
  await expect(page).toHaveURL(/min=3/);
  for (const text of await page.getByTestId("encounter-record").allTextContents()) expect(gamesIn(text)).toBeGreaterThanOrEqual(3);

  // A search that matches nobody: an honest empty state, the choices kept.
  await page.getByTestId("encounter-search").fill("Nobody Like This#NONE");
  await expect(page).toHaveURL(/q=Nobody/);
  await expect(page.getByTestId("encounters-none")).toBeVisible();
  await expect(page).toHaveURL(/rel=everyone/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test("one player's window: the record, every recorded game, and the match with Back", async ({ page }) => {
  await openEncounters(page, "/overview/matches?view=encounters&rel=everyone");
  const row = page.getByTestId("encounter-row").first();
  const total = gamesIn(await row.getByTestId("encounter-record").innerText());
  await row.click();
  const detail = page.getByTestId("encounter-detail");
  await expect(detail).toBeVisible();
  await expect(page.getByTestId("encounter-detail-summary")).toContainText(new RegExp(`^${total} recorded games? with `));
  // Each game once, newest first.
  const games = page.getByTestId("encounter-game");
  await expect(games).toHaveCount(Math.min(total, 100));
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
  await expect(detail).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
});

test("the season, game mode and account choice is the games list's, and every count follows it", async ({ page }) => {
  await openEncounters(page, "/overview/matches?view=encounters");
  // Phones fold the filters behind one button.
  await openFilterBar(page.getByTestId("encounter-filters"));
  const mode = page.locator("#overview-mode");
  // Games in the view: the same number the game mode shows beside its name.
  const coverage = page.getByTestId("encounter-count");
  const all = await countOf(mode.locator("option:checked"));
  await expect(coverage).toContainText(new RegExp(`From ${all} recorded games?|of ${all} games`));
  await mode.selectOption("solo");
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page).toHaveURL(/view=encounters/);
  const solo = await countOf(page.locator("#overview-mode option:checked"));
  expect(solo).toBeLessThan(all);
  if (solo) await expect(coverage).toContainText(new RegExp(`From ${solo} recorded games?|of ${solo} games`));
  else await expect(page.getByTestId("encounters-empty")).toBeVisible();

  // Back to the games: the same game mode, and the same count beside it.
  await page.getByTestId("match-view-games").click();
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page).not.toHaveURL(/view=encounters/);
  await expect(page.getByTestId("match-history")).toBeVisible();
  expect(await countOf(page.locator("#overview-mode option:checked"))).toBe(solo);
});

test("a teammate's profile has their own Encounters", async ({ page }) => {
  await page.goto("/team");
  const mid = (await page.getByTestId("lineup-row-MID").getAttribute("data-player-id"))!;
  await openEncounters(page, `/players/${mid}/matches?view=encounters&rel=everyone`);
  await expect(page.getByTestId("encounter-count")).toContainText(/From \d+/);
  await page.getByTestId("encounter-row").first().click();
  await expect(page.getByTestId("encounter-detail-summary")).toContainText(/recorded games? with /);
});

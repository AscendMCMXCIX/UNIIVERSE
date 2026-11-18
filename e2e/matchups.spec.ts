import { expect, test, type Locator, type Page } from "./test";
import { expectClearCorner } from "./modal-corner";

/*
  All Champions → a champion's window on the demo roster (synthetic demo games with lane opponents
  and timeline frames, in-memory only): the row opens the window on Overview; Matchups shows one
  lane opponent at a time, chosen from a searchable list, with the record and the lane and their
  sample sizes; a game opens the match window in place of this one, with a way back. Old Matchups
  addresses land in the same window. The window lives in the URL (links and Back work).
*/

async function firstProfile(page: Page) {
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href");
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
  // Back sits left of the close button, past a divider (the corner stays clear).
  await expect(page.getByTestId("match-detail").getByTestId("match-result")).toBeVisible();
  await expectClearCorner(page, { nav: true });
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

test("on a phone the champion window is compact: a 48px portrait, Refine ending the tabs' row, the stats three by two with short labels, touch-sized tabs and multikills ⓘ", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "the window on a phone");
  await page.setViewportSize({ width: 393, height: 852 });
  const profile = await firstProfile(page);
  await page.goto(`${profile}/champions`);
  await openChampion(page, page.getByTestId("top-champion").first().getByTestId("open-champion"));
  const win = page.getByTestId("champion-detail");
  await expect(win.getByTestId("champion-detail-loading")).toHaveCount(0, { timeout: 15_000 });
  await expect(win.getByTestId("champion-detail-body")).toHaveCSS("opacity", "1", { timeout: 15_000 });
  const name = (await win.getByTestId("champion-detail-name").textContent())!;
  const portrait = (await win.getByTestId("champion-detail-header").getByRole("img", { name, exact: true }).boundingBox())!;
  expect([Math.round(portrait.width), Math.round(portrait.height)], "an md portrait").toEqual([48, 48]);
  // One Refine is drawn, at the end of the tabs' row; the tabs are 44px on a touch screen.
  const refine = win.getByTestId("champion-detail-refine").filter({ visible: true });
  await expect(refine).toHaveCount(1);
  const [overview, matchups, r] = [(await win.getByTestId("champion-tab-overview").boundingBox())!, (await win.getByTestId("champion-tab-matchups").boundingBox())!, (await refine.boundingBox())!];
  expect(r.y < overview.y + overview.height && r.y + r.height > overview.y, "Refine on the tabs' row").toBe(true);
  expect(r.x, "after the tabs").toBeGreaterThan(matchups.x + matchups.width);
  expect(Math.round(overview.height), "a 44px tab").toBe(44);
  await expect(win.getByTestId("champion-matchup-intel")).toBeVisible();
  // The stats three by two, each label short on screen and whole for screen readers.
  const tiles = await win.getByTestId("champion-stats").locator(":scope > div").evaluateAll((els) =>
    els.map((t) => {
      const dt = t.querySelector("dt")!;
      const shown = [...dt.childNodes].map((n) => (n instanceof HTMLElement ? (n.checkVisibility() && n.getBoundingClientRect().width > 1 ? n.textContent : "") : n.textContent)).join("");
      return { top: Math.round(t.getBoundingClientRect().top), shown, read: dt.querySelector(".sr-only, [class*='max-sm:sr-only']")?.textContent ?? dt.textContent, cut: t.scrollWidth > t.clientWidth + 1 };
    }),
  );
  expect(tiles.map((t) => t.shown)).toEqual(["Games", "Win rate", "KDA", "CS/min", "Damage/min", "Mastery"]);
  expect(tiles.map((t) => t.read)).toEqual(["Games", "Win rate", "KDA", "CS per minute", "Damage per minute", "Mastery points"]);
  expect(new Set(tiles.slice(0, 3).map((t) => t.top)).size, "three on the first row").toBe(1);
  expect(new Set(tiles.slice(3).map((t) => t.top)).size, "three on the second").toBe(1);
  expect(tiles[3]!.top).toBeGreaterThan(tiles[0]!.top);
  expect(tiles.filter((t) => t.cut), "every figure whole").toEqual([]);
  // The multikills ⓘ: a 24px mark with a 44px touch area.
  const tip = win.getByTestId("champion-multikills-summary").getByTestId("info-tip");
  expect(await tip.evaluate((b) => [getComputedStyle(b, "::after").width, getComputedStyle(b, "::after").height])).toEqual(["44px", "44px"]);
  // The lane comparison starts on the first screen (it started at 631px).
  const lane = win.getByTestId("champion-lane").or(win.getByTestId("champion-lane-empty"));
  expect((await lane.boundingBox())!.y - (await win.boundingBox())!.y, "the lane's top in the window").toBeLessThanOrEqual(540);
  expect(await win.evaluate((d) => d.scrollWidth - d.clientWidth), "nothing wider than the window").toBeLessThanOrEqual(0);
});

test("on a computer the champion window keeps its layout: six figures across with their whole labels, Refine beside the scope, 40px tabs", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "the window on a computer");
  const profile = await firstProfile(page);
  await page.goto(`${profile}/champions`);
  await openChampion(page, page.getByTestId("top-champion").first().getByTestId("open-champion"));
  const win = page.getByTestId("champion-detail");
  await expect(win.getByTestId("champion-detail-loading")).toHaveCount(0, { timeout: 15_000 });
  const tiles = await win.getByTestId("champion-stats").locator(":scope > div").evaluateAll((els) => els.map((t) => ({ top: Math.round(t.getBoundingClientRect().top), label: t.querySelector("dt")!.innerText })));
  expect(new Set(tiles.map((t) => t.top)).size, "one row of six").toBe(1);
  expect(tiles.map((t) => t.label)).toEqual(["Games", "Win rate", "KDA", "CS per minute", "Damage per minute", "Mastery points"]);
  const refine = win.getByTestId("champion-detail-refine").filter({ visible: true });
  const [scope, r, tab] = [(await win.getByTestId("champion-detail-scope").boundingBox())!, (await refine.boundingBox())!, (await win.getByTestId("champion-tab-overview").boundingBox())!];
  expect(Math.abs(r.y + r.height / 2 - (scope.y + scope.height / 2)), "Refine on the scope's row").toBeLessThanOrEqual(4);
  expect(Math.round(tab.height)).toBe(40);
});

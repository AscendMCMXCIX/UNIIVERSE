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

/** The window's stats once its panel has rendered: the six tiles (AfterOpen holds the panel back while the window moves in). */
async function statTiles(win: Locator) {
  await expect(win.getByTestId("champion-stats").locator(":scope > div")).toHaveCount(6, { timeout: 15_000 });
  return win.getByTestId("champion-stats").locator(":scope > div").evaluateAll((els) =>
    els.map((t) => {
      const dt = t.querySelector("dt")!;
      const dd = t.querySelector("dd")!;
      const shown = [...dt.childNodes].map((n) => (n instanceof HTMLElement ? (n.checkVisibility() && n.getBoundingClientRect().width > 1 ? n.textContent : "") : n.textContent)).join("");
      // The label element drawn on screen (the sr-only one is 1px wide): a short label must be hidden from screen readers.
      const drawn = [...dt.children].find((n) => n.checkVisibility() && n.getBoundingClientRect().width > 1);
      return {
        top: Math.round(t.getBoundingClientRect().top),
        shown,
        read: dt.querySelector("[class*='sr-only']")?.textContent ?? dt.textContent,
        shortHidden: drawn?.getAttribute("aria-hidden") === "true",
        value: dd.textContent,
        // The label too, with no tolerance: it is cut with an ellipsis inside its own box (truncate),
        // which the tile's width never shows, and a cut of 1.2px snaps to a 1px difference.
        cut: t.scrollWidth > t.clientWidth + 1 || dd.scrollWidth > dd.clientWidth + 1 || dt.scrollWidth > dt.clientWidth,
      };
    }),
  );
}

test("on a phone the champion window is compact: a 48px portrait, Refine ending the tabs' row and its panel after it, the stats three by two with short labels and whole figures, touch-sized tabs and multikills ⓘ", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "the window on a phone");
  await page.setViewportSize({ width: 393, height: 852 });
  const profile = await firstProfile(page);
  await page.goto(`${profile}/champions`);
  const row = page.getByTestId("top-champion").first();
  const points = Number(await row.getAttribute("data-mastery"));
  await openChampion(page, row.getByTestId("open-champion"));
  const win = page.getByTestId("champion-detail");
  let tiles = await statTiles(win);
  await expect(win.getByTestId("champion-detail-body")).toHaveCSS("opacity", "1", { timeout: 15_000 });
  const name = (await win.getByTestId("champion-detail-name").textContent())!;
  const portrait = (await win.getByTestId("champion-detail-header").getByRole("img", { name, exact: true }).boundingBox())!;
  expect([Math.round(portrait.width), Math.round(portrait.height)], "an md portrait").toEqual([48, 48]);
  // One Refine is drawn, at the end of the tabs' row; the tabs are 44px on a touch screen.
  const refine = win.getByTestId("champion-detail-refine").filter({ visible: true });
  await expect(refine).toHaveCount(1);
  const box = await win.boundingBox();
  const [overview, matchups, r] = [(await win.getByTestId("champion-tab-overview").boundingBox())!, (await win.getByTestId("champion-tab-matchups").boundingBox())!, (await refine.boundingBox())!];
  expect(r.y < overview.y + overview.height && r.y + r.height > overview.y, "Refine on the tabs' row").toBe(true);
  expect(r.x, "after the tabs").toBeGreaterThan(matchups.x + matchups.width);
  expect(r.x + r.width, "Refine 1rem inside the window's edge").toBeLessThanOrEqual(box!.x + box!.width - 16 + 0.5);
  expect(Math.round(overview.height), "a 44px tab").toBe(44);
  await expect(win.getByTestId("champion-matchup-intel")).toBeVisible();
  // The stats three by two, each label short on screen (the short word hidden from screen readers)
  // and whole for screen readers; every figure written whole, Mastery points too.
  expect(tiles.map((t) => t.shown)).toEqual(["Games", "Win rate", "KDA", "CS/min", "Damage/min", "Mastery"]);
  expect(tiles.map((t) => t.read)).toEqual(["Games", "Win rate", "KDA", "CS per minute", "Damage per minute", "Mastery points"]);
  // Tiles 3 to 5 have a short label (Games, Win rate and KDA are plain words).
  expect(tiles.slice(3).map((t) => t.shortHidden), "the short labels hidden from screen readers").toEqual([true, true, true]);
  expect(tiles[5]!.value, "the whole mastery points").toBe(points.toLocaleString("en"));
  expect(new Set(tiles.slice(0, 3).map((t) => t.top)).size, "three on the first row").toBe(1);
  expect(new Set(tiles.slice(3).map((t) => t.top)).size, "three on the second").toBe(1);
  expect(tiles[3]!.top).toBeGreaterThan(tiles[0]!.top);
  expect(tiles.filter((t) => t.cut), "every figure whole").toEqual([]);
  // The multikills ⓘ: a 24px mark with a 44px touch area.
  const tip = win.getByTestId("champion-multikills-summary").getByTestId("info-tip");
  expect(await tip.evaluate((b) => [getComputedStyle(b, "::after").width, getComputedStyle(b, "::after").height])).toEqual(["44px", "44px"]);
  // The lane comparison's top. The plan estimated about 460px on this 393 × 852 phone; it starts at
  // 524 (631 before): since the plan, the scope row also holds Matchup Intel (#292) and the scope
  // wraps instead of cutting off the account (#300), and the tabs are 44px on a touch screen. The
  // bound is that 524 with 16px for the engine's text: a header or tiles growing back fails it.
  const lane = win.getByTestId("champion-lane").or(win.getByTestId("champion-lane-empty"));
  expect((await lane.boundingBox())!.y - box!.y, "the lane's top in the window").toBeLessThanOrEqual(540);
  // Nothing wider than the window: the header (overflow-hidden) and the body (it scrolls) keep any
  // overflow to themselves, so each is measured, not the dialog.
  for (const id of ["champion-detail-header", "champion-detail-body"]) expect(await win.getByTestId(id).evaluate((e) => e.scrollWidth - e.clientWidth), `${id}: nothing wider`).toBeLessThanOrEqual(0);

  // Refine opens its panel after the tabs' row, right after the button in reading and focus order;
  // the button stays where it was tapped.
  await refine.tap();
  await expect(refine).toHaveAttribute("aria-expanded", "true");
  const panel = win.getByTestId("champion-refine");
  await expect(panel).toBeVisible();
  await expect(win.locator("#champion-refine")).toHaveCount(1);
  const [after, p] = [(await refine.boundingBox())!, (await panel.boundingBox())!];
  expect(Math.abs(after.y - r.y), "the button did not move").toBeLessThanOrEqual(1);
  expect(p.y, "the panel under the button's row").toBeGreaterThanOrEqual(after.y + after.height - 1);
  expect(await refine.evaluate((b) => !!(b.compareDocumentPosition(document.getElementById("champion-refine")!) & Node.DOCUMENT_POSITION_FOLLOWING)), "the panel after its button").toBe(true);
  await refine.focus();
  await page.keyboard.press("Tab");
  await expect(win.locator("#champion-refine-season"), "Tab from Refine goes to the season").toBeFocused();
  await refine.tap();
  await expect(panel).toHaveCount(0);

  // A 320px phone: every figure and label still whole, Mastery points written whole; its column takes
  // the room a seven-digit figure needs rather than rounding it, and the middle column keeps
  // "Damage/min" whole beside it.
  await page.setViewportSize({ width: 320, height: 568 });
  tiles = await statTiles(win);
  expect(tiles[5]!.value, "320px: the whole mastery points").toBe(points.toLocaleString("en"));
  expect(tiles.map((t) => t.shown), "320px: the short labels").toEqual(["Games", "Win rate", "KDA", "CS/min", "Damage/min", "Mastery"]);
  expect(tiles.filter((t) => t.cut).map((t) => t.shown), "320px: every figure and label whole").toEqual([]);
  await win.getByTestId("champion-stat-mastery").locator("dd").first().evaluate((dd) => (dd.textContent = "1,234,567"));
  tiles = await statTiles(win);
  expect(tiles.filter((t) => t.cut).map((t) => t.shown), "320px: seven-digit mastery points whole, and every figure and label beside them").toEqual([]);
  expect(new Set(tiles.slice(0, 3).map((t) => t.top)).size, "320px: still three to a row").toBe(1);
  // Larger text, with the widest KDA ("Perfect") beside the seven digits: at 150% a 320px phone's
  // figures go one across (two would cut "Perfect" and "Damage/min"); at 125% on it, and at 150% on a
  // 360px phone, two across hold them whole.
  await win.getByTestId("champion-stat-kda").locator("dd").first().evaluate((dd) => (dd.textContent = "Perfect"));
  const text = await page.addStyleTag({ content: "/* text size */" });
  for (const [width, size, across] of [[320, 150, 1], [320, 125, 2], [360, 150, 2]] as const) {
    await page.setViewportSize({ width, height: 568 });
    await text.evaluate((s, size) => (s.textContent = `html { font-size: ${size}% !important; }`), size);
    tiles = await statTiles(win);
    expect(tiles.filter((t) => t.cut).map((t) => t.shown), `${width}px at ${size}%: "Perfect", seven-digit mastery points and every label whole`).toEqual([]);
    expect(new Set(tiles.map((t) => t.top)).size, `${width}px at ${size}%: ${across} across`).toBe(6 / across);
    expect(await win.getByTestId("champion-detail-body").evaluate((e) => e.scrollWidth - e.clientWidth), `${width}px at ${size}%: nothing wider than the window`).toBeLessThanOrEqual(0);
  }
});

test("on a phone the multikills row's coverage ⓘ has a 44px touch area too", async ({ page }) => {
  test.skip(test.info().project.name !== "phone", "a touch screen");
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Support" }).first().getAttribute("href");
  await page.goto(`${new URL(href!, "http://x").pathname}/champions`);
  // A champion whose multikills are counted in only some of its games: its window says why, behind an ⓘ.
  const partial = page.getByTestId("top-champion").and(page.locator("[data-multikill-coverage=partial]")).first();
  await openChampion(page, partial.getByTestId("open-champion"));
  const note = page.getByTestId("champion-detail").getByTestId("multikill-coverage-note");
  await expect(note).toBeVisible({ timeout: 15_000 });
  expect(await note.evaluate((b) => [getComputedStyle(b, "::after").width, getComputedStyle(b, "::after").height])).toEqual(["44px", "44px"]);
});

test("from sm the champion window keeps its layout: the figures with their whole labels (three across on a tablet, six on a computer), Refine beside the scope with its panel under that row, 40px tabs with a mouse", async ({ page }) => {
  test.skip(test.info().project.name === "phone", "the window from sm");
  const profile = await firstProfile(page);
  await page.goto(`${profile}/champions`);
  await openChampion(page, page.getByTestId("top-champion").first().getByTestId("open-champion"));
  const win = page.getByTestId("champion-detail");
  const desktop = test.info().project.name === "desktop";
  const tiles = await statTiles(win);
  expect(tiles.map((t) => t.shown)).toEqual(["Games", "Win rate", "KDA", "CS per minute", "Damage per minute", "Mastery points"]);
  expect(new Set(tiles.map((t) => t.top)).size, desktop ? "one row of six" : "two rows of three").toBe(desktop ? 1 : 2);
  expect(new Set(tiles.slice(0, 3).map((t) => t.top)).size, "the first three on one row").toBe(1);
  expect(tiles.filter((t) => t.cut), "every figure whole").toEqual([]);
  const refine = win.getByTestId("champion-detail-refine").filter({ visible: true });
  await expect(refine).toHaveCount(1);
  const [scope, r, tab] = [(await win.getByTestId("champion-detail-scope").boundingBox())!, (await refine.boundingBox())!, (await win.getByTestId("champion-tab-overview").boundingBox())!];
  expect(Math.abs(r.y + r.height / 2 - (scope.y + scope.height / 2)), "Refine on the scope's row").toBeLessThanOrEqual(4);
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  expect(Math.round(tab.height), coarse ? "44px on a touch screen" : "40px with a mouse").toBe(coarse ? 44 : 40);
  // Its panel opens under the scope's row, before the tabs, as it always did.
  await refine.click();
  const p = (await win.getByTestId("champion-refine").boundingBox())!;
  expect(p.y, "under the scope's row").toBeGreaterThanOrEqual(r.y + r.height - 1);
  expect(p.y + p.height, "before the tabs").toBeLessThanOrEqual((await win.getByTestId("champion-tab-overview").boundingBox())!.y + 1);
});

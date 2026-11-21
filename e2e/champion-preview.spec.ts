import { expect, test, type Locator, type Page } from "./test";
import { NARROW_MOUSE_WINDOWS, expectInReach } from "./reach";

/*
  All Champions' preview on the demo roster (synthetic demo games with lane opponents and timeline
  frames, in-memory only). On a wide list it unfolds inside the list's card over the columns after
  Win rate: Champion, Games and Win rate never move, the page never scrolls, rows keep their height.
  Phones and tablets get a sheet. The address holds it: the first open pushes one entry, switching
  replaces it, so Back always closes. Its content: identity, games and win rate, then the record
  against each lane opponent (a win rate only from 3 games, the games beside it), an opponent
  unfolding into its games and the one link to Matchup Intel, and the foot line. Old champion-window
  addresses (Matchups, the Overview's pools) land here.
*/

async function demoTop(page: Page) {
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Top" }).first().getAttribute("href");
  return new URL(href!, "http://x").pathname;
}

/** Opens a row's preview, clicking again until the page is interactive (a click before hydration does nothing). */
async function openRow(page: Page, row: Locator) {
  const content = page.getByTestId("champion-preview-content");
  const champion = await row.getAttribute("data-champion");
  await expect(async () => {
    const shown = (await content.count()) ? await content.getAttribute("data-champion") : null;
    if (shown !== champion) await row.getByTestId("open-champion").click({ timeout: 2_000 });
    await expect(content).toHaveAttribute("data-champion", champion!, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** How the selected row meets the docked preview: its surface under the preview's edge, the notch over that edge beside it. */
async function joint(page: Page, row: Locator) {
  return row.evaluate((li) => {
    const aside = document.getElementById("champion-preview")!;
    const notch = document.querySelector<HTMLElement>("[data-testid=champion-preview-notch]")!;
    const [r, a, n] = [li.getBoundingClientRect(), aside.getBoundingClientRect(), notch.getBoundingClientRect()];
    return {
      rowToEdge: r.right >= a.left + 2,
      notchAtEdge: Math.abs(n.left - a.left) <= 1,
      width: Math.round(n.width),
      sameColour: getComputedStyle(li).backgroundColor === getComputedStyle(notch).backgroundColor,
      alongRow: Math.abs(n.top - r.top) <= 1 && Math.abs(n.bottom - r.bottom) <= 1,
      shown: getComputedStyle(notch).visibility !== "hidden",
    };
  });
}

const columns = (page: Page) => page.getByTestId("all-champions-header").evaluate((el) => ["champion", "games", "win"].map((k) => Math.round(el.querySelector(`[data-testid=sort-${k}]`)!.getBoundingClientRect().x)));

test("desktop: the preview unfolds in the list's card; nothing moves; click, ↑/↓ and Back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the in-card preview is for a wide list with a mouse");
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(2)).toBeVisible();
  const before = await columns(page);
  const heights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  const entries = await page.evaluate(() => history.length);
  // Actions answer light: every reply of the preview's server actions is small.
  const replies: number[] = [];
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && r.request().headers()["next-action"]) replies.push((await r.body().catch(() => Buffer.alloc(0))).length);
  });
  await openRow(page, rows.nth(0));
  const preview = page.getByTestId("champion-preview");
  // Beside the list, not a window over it.
  await expect(preview).toHaveJSProperty("tagName", "ASIDE");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(await columns(page)).toEqual(before);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))).toEqual(heights);
  // The columns after Win rate fold away under it (hidden, their widths kept).
  await expect(page.getByTestId("sort-kda")).toBeHidden();
  await expect(rows.nth(0)).toHaveAttribute("data-selected", "true");
  // Joined to its row (CM §4.1): the row's surface runs to the preview's edge, and a 2px notch the
  // row's colour interrupts the edge line beside the row, as tall as the row.
  await page.mouse.move(2, 2);
  await expect.poll(() => joint(page, rows.nth(0))).toEqual({ rowToEdge: true, notchAtEdge: true, width: 2, sameColour: true, alongRow: true, shown: true });
  await expect(page.getByTestId("champion-preview-foot")).toContainText("Lane opponent: the enemy Riot placed in");
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  // Another row switches it; ↑/↓ move it; the address is replaced, never pushed.
  await rows.nth(1).getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(2).getAttribute("data-champion"))!);
  await expect(rows.nth(2).getByTestId("open-champion")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  expect(await page.evaluate(() => history.length)).toBe(entries + 1);
  expect(await columns(page)).toEqual(before);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(Math.max(...replies)).toBeLessThanOrEqual(5_000);
  // The notch moved with the switches to the selected row.
  await page.mouse.move(2, 2);
  await expect.poll(() => joint(page, rows.nth(1))).toEqual({ rowToEdge: true, notchAtEdge: true, width: 2, sameColour: true, alongRow: true, shown: true });
  // (Scrolled out of the pinned preview's edge, the notch goes: preview-notch.test.ts; the demo's lists are too short to scroll a row out.)
  // The same join at 1280 and 1920 (the preview docks in the card at both).
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(preview).toBeVisible();
    await expect.poll(() => joint(page, rows.nth(1)), `${width}px`).toEqual({ rowToEdge: true, notchAtEdge: true, width: 2, sameColour: true, alongRow: true, shown: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // At most 650px tall folded, with no inner scroll.
  const box = await preview.evaluate((el) => ({ h: el.getBoundingClientRect().height, inner: el.scrollHeight > el.clientHeight + 1 }));
  expect(box.h).toBeLessThanOrEqual(650);
  expect(box.inner).toBe(false);
  // Back closes it after the switches.
  await page.goBack();
  await expect(preview).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  await expect(page.getByTestId("sort-kda")).toBeVisible();
  // Escape closes it too, and focus returns to its row.
  await openRow(page, rows.nth(0));
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(rows.nth(0).getByTestId("open-champion")).toBeFocused();
  await expect(page).not.toHaveURL(/champion=/);
});

test("the content: opponents from 3 games with their games, one unfolding into its games and Matchup Intel", async ({ page }) => {
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const row = page.getByTestId("top-champion").first();
  await openRow(page, row);
  const content = page.getByTestId("champion-preview-content");
  await expect(content.getByTestId("champion-preview-figures")).toContainText(/\d+ games? · \d+W \d+L/);
  const opponents = content.getByTestId("champion-preview-opponent");
  await expect(opponents.first()).toBeVisible();
  // The opponents' sort is the app's segmented control: the chosen one ringed and semibold (the design review's G2-11).
  const sorts = content.locator("[data-testid^=opponent-sort-]");
  if (await sorts.count()) expect(await sorts.evaluateAll((els) => els.map((e) => [e.getAttribute("aria-pressed"), getComputedStyle(e).fontWeight, getComputedStyle(e).boxShadow !== "none"]))).toEqual(await sorts.evaluateAll((els) => els.map((e) => (e.getAttribute("aria-pressed") === "true" ? ["true", "600", true] : ["false", "500", false]))));
  // A win rate only from 3 games, each with its games beside it.
  for (const o of await opponents.evaluateAll((els) => els.map((e) => ({ games: Number((e as HTMLElement).dataset.games), text: e.textContent ?? "" })))) {
    expect(o.text).toMatch(/\d+ games?/);
    if (o.games < 3) expect(o.text).not.toMatch(/%/);
  }
  const first = opponents.first();
  const vs = (await first.getAttribute("data-champion"))!;
  await first.getByRole("button").first().click();
  await expect(page).toHaveURL(new RegExp(`vs=${vs}`));
  await expect(content.getByTestId("champion-preview-game").first()).toBeVisible();
  await expect(content.getByTestId("champion-preview-intel")).toHaveAttribute("href", new RegExp(`/resources/matchups\\?champion=${await row.getAttribute("data-champion")}&vs=${vs}`));
});

test("old addresses land on the preview: Matchups, a deep link with an opponent, the Overview's pools", async ({ page, context, baseURL }) => {
  const profile = await demoTop(page);
  await page.goto(`${profile}/matchups?mode=solo`);
  await expect(page).toHaveURL(/\/champions\?.*champion=/);
  await expect(page).toHaveURL(/mode=solo/);
  await expect(page.getByTestId("champion-preview-content")).toBeVisible();
  // A deep link with an opponent renders it unfolded.
  const url = new URL(page.url());
  const champion = url.searchParams.get("champion")!;
  const vs = await page.getByTestId("champion-preview-opponent").first().getAttribute("data-champion");
  await page.goto(`${profile}/champions?champion=${champion}&tab=matchups&vs=${vs}`);
  await expect(page.getByTestId("champion-preview-pairing")).toBeVisible();
  // The Overview's old window key opens All Champions' preview.
  await page.goto(`${profile}?champ=${champion}&crole=TOP`);
  await expect(page).toHaveURL(new RegExp(`/champions\\?.*champion=${champion}`));
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", champion);
  // A pool card is a link to All Champions with that champion's preview open, in the pool's role.
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  await page.goto(profile);
  const card = page.getByTestId("primary-pool").getByTestId("pool-item").first();
  const id = (await card.getAttribute("data-champion"))!;
  await expect(async () => {
    if (!/\/champions\?/.test(page.url())) await card.getByTestId("pool-inspect").click({ timeout: 2_000 });
    await expect(page).toHaveURL(new RegExp(`/champions\\?.*champion=${id}.*crole=TOP`), { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", id);
});

test("phones: a sheet; tablets: the docked panel; ‹ › switch, Back closes it and the list keeps its place", async ({ page }, info) => {
  test.skip(info.project.name === "desktop", "the sheet and the docked panel are for phones and tablets");
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(1)).toBeVisible();
  if (info.project.name === "phone") {
    // 64px rows at most: the name over the role, the win rate over the games.
    for (const h of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeLessThanOrEqual(64);
  }
  const y = await page.evaluate(() => scrollY);
  await openRow(page, rows.nth(0));
  // The shared Peek: a sheet (a window) on a phone, the panel docked at the right on a tablet.
  const preview = page.locator(info.project.name === "phone" ? "dialog[open][data-testid=champion-preview]" : "aside[data-peek-panel][data-testid=champion-preview]");
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId("champion-preview-opponents")).toBeInViewport();
  await preview.getByTestId("champion-preview-next").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  await page.goBack();
  await expect(preview).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  // ✕ closes it too.
  await openRow(page, rows.nth(0));
  await preview.getByTestId("champion-preview-close").click();
  await expect(preview).toHaveCount(0);
});

test("a game opened from the preview has a history entry of its own: Back closes the game and the preview stays, Back again closes the preview", async ({ page }) => {
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const row = page.getByTestId("top-champion").first();
  await openRow(page, row);
  const champion = (await row.getAttribute("data-champion"))!;
  const content = page.getByTestId("champion-preview-content");
  const win = page.locator("dialog[open][data-testid=match-detail]");
  const openAGame = async () => {
    const opponent = content.getByTestId("champion-preview-opponent").first();
    if (!(await content.getByTestId("champion-preview-game").count())) await opponent.getByRole("button").first().click();
    await content.getByTestId("champion-preview-game").first().click();
    await expect(win).toBeVisible();
    await expect(page).toHaveURL(/[?&]match=/);
  };
  await openAGame();
  // Back (the browser's, a phone's system Back): the game closes, the preview is still there, the same champion.
  await page.goBack();
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]match=/);
  await expect(page).toHaveURL(new RegExp(`champion=${champion}`));
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute("data-champion", champion);
  // ✕ closes the game alone too, and takes its entry away: the next Back closes the preview.
  await openAGame();
  await win.getByTestId("match-detail-close").click();
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]match=/);
  await expect(content).toBeVisible();
  await page.goBack();
  await expect(content).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
});

test("a window 640–767px wide with a mouse (the phone's frame): the preview opens as a window, its ✕ and ‹ › in reach", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse in a narrow window: the desktop project, resized");
  const profile = await demoTop(page);
  for (const size of NARROW_MOUSE_WINDOWS) {
    await page.setViewportSize(size);
    await page.goto(`${profile}/champions`);
    await openRow(page, page.getByTestId("top-champion").first());
    const preview = page.locator("dialog[open][data-testid=champion-preview]");
    await expect(preview, `${size.width}×${size.height}`).toBeVisible();
    await expect(page.locator("aside[data-peek-panel]")).toHaveCount(0);
    await expectInReach(page, [preview.getByTestId("champion-preview-close"), preview.getByTestId("champion-preview-next")]);
    await preview.getByTestId("champion-preview-close").click();
    await expect(preview).toHaveCount(0);
  }
});

test("from a scrolled list: a row below the first screen opens its preview, Escape (desktop) or Back (phone, tablet) closes it, and the row, the sort and the search are where they were", async ({ page }, info) => {
  // The demo's longest list is 8 champions; a short window makes it scroll. "Show all" appears from
  // 21 champions (FIRST in all-champions.tsx), which no demo profile has: the next test reaches it with a test cookie.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 480 });
  // The demo's Mid: the longest list (8 champions).
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Mid" }).first().getAttribute("href");
  const profile = new URL(href!, "http://x").pathname;
  await page.goto(`${profile}/champions`);
  await expect(page.getByTestId("top-champion").first()).toBeVisible();
  const most = await page.getByTestId("top-champion").count();
  expect(most, "a list that can scroll").toBeGreaterThanOrEqual(6);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(most - 1)).toBeAttached();
  // A sort other than the default (games): by win rate, by its column or the phone's select.
  const sortWin = page.getByTestId("sort-win");
  if (await sortWin.isVisible()) await sortWin.click();
  else await page.locator("select#all-champions-sort-by").selectOption("win");
  const order = () => rows.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.champion));
  await expect.poll(async () => (await order()).length).toBe(most);
  const sorted = await order();
  const close = async () => {
    if (info.project.name === "desktop") await page.keyboard.press("Escape");
    else await page.goBack();
    await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
    await expect(page).not.toHaveURL(/champion=/);
  };
  // The last row, scrolled to from the top of the page: below the first screen until then.
  await page.evaluate(() => window.scrollTo(0, 0));
  const last = rows.nth(most - 1);
  expect((await last.boundingBox())!.y, "the row starts below the first screen").toBeGreaterThan(480);
  await last.scrollIntoViewIfNeeded();
  const at = async () => ({ y: Math.round((await last.boundingBox())!.y), scroll: await page.evaluate(() => Math.round(window.scrollY)) });
  const before = await at();
  expect(before.scroll, "the list is scrolled").toBeGreaterThan(0);
  await openRow(page, last);
  await close();
  // Back restores the scroll as the history entry settles: the row back where it was within 3px.
  await expect.poll(async () => Math.abs((await at()).y - before.y), { message: "the row where it was" }).toBeLessThanOrEqual(3);
  expect(await order(), "the sort kept").toEqual(sorted);
  // With a search: the same, and the search's words and its rows kept.
  const search = page.locator("input[data-testid=all-champions-search]");
  const word = sorted[sorted.length - 1]!.slice(0, 3);
  await search.fill(word);
  await expect.poll(async () => (await order()).length, "the search narrows the list").toBeLessThan(most);
  const found = await order();
  await openRow(page, rows.first());
  await close();
  await expect(search).toHaveValue(word);
  await expect.poll(order, { message: "the search's rows kept" }).toEqual(found);
});

test("after Show all: a row reached through it opens its preview, closes, and comes back to its place with the whole list still shown", async ({ page, baseURL }, info) => {
  // No demo profile plays the 21 champions "Show all" needs (FIRST in all-champions.tsx): the
  // in-memory demo's test cookie folds the list after 3 rows instead (server/demo/test-hooks.ts).
  await page.context().addCookies([{ name: "uniiverse-test-champions-first", value: "3", url: baseURL! }]);
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 480 });
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Mid" }).first().getAttribute("href");
  await page.goto(`${new URL(href!, "http://x").pathname}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(3);
  const more = page.getByTestId("all-champions-more");
  await expect(more).toHaveText(/Show all \d+ champions/);
  const total = Number((await more.textContent())!.match(/\d+/)![0]);
  expect(total, "more rows than the fold").toBeGreaterThan(3);
  await more.click();
  await expect(rows).toHaveCount(total);
  await expect(more).toHaveCount(0);
  const last = rows.nth(total - 1);
  await last.scrollIntoViewIfNeeded();
  const at = async () => ({ y: Math.round((await last.boundingBox())!.y), scroll: await page.evaluate(() => Math.round(window.scrollY)) });
  const before = await at();
  expect(before.scroll, "the list is scrolled").toBeGreaterThan(0);
  await openRow(page, last);
  if (info.project.name === "desktop") await page.keyboard.press("Escape");
  else await page.goBack();
  await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  await expect(rows, "the whole list still shown").toHaveCount(total);
  await expect.poll(async () => Math.abs((await at()).y - before.y), { message: "the row where it was" }).toBeLessThanOrEqual(3);
});

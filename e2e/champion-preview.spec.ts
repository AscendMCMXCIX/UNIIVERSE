import { expect, test, type Locator, type Page } from "./test";
import { NARROW_MOUSE_WINDOWS, expectInReach } from "./reach";

/*
  All Champions' preview on the demo roster (synthetic demo games with lane opponents and timeline
  frames, in-memory only). On tablets and computers it unfolds under its row (the overlay kit's
  Unfold, since 23 Nov 2026): the next item of the list, across the whole list, in the page's flow;
  Champion, Games and Win rate never move, no column folds, the page never scrolls on opening, rows
  keep their height, nothing scrolls inside it and no window opens. Phones get a sheet. The address
  holds it: the first open pushes one entry, switching replaces it, so Back always closes. Its
  content: identity, games and win rate (and, under its row, four tiles of averages), then the record
  against each lane opponent (a win rate only from 3 games, the games beside it), an opponent
  unfolding into its games and the one link to Champion Lookup, and the foot line. Old champion-window
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

/** Where the open preview sits against its row: the list item right after it, as wide as it, starting where it ends, with nothing scrolling inside and nothing wider than the screen. */
async function underRow(page: Page, row: Locator) {
  return row.evaluate((li) => {
    const region = document.getElementById("champion-preview");
    const item = li.nextElementSibling;
    if (!region || !item) return { found: false };
    const [r, d] = [li.getBoundingClientRect(), item.getBoundingClientRect()];
    const scrollers = [region, ...region.querySelectorAll("*")].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1).length;
    return {
      found: true,
      next: item.contains(region),
      region: region.getAttribute("role") === "region",
      window: !!document.querySelector("dialog[open]"),
      below: Math.abs(d.top - r.bottom) <= 2,
      width: Math.abs(d.left - r.left) <= 1 && Math.abs(d.right - r.right) <= 1,
      scrollers,
      sideways: document.documentElement.scrollWidth - innerWidth > 1,
    };
  });
}
const UNDER = { found: true, next: true, region: true, window: false, below: true, width: true, scrollers: 0, sideways: false };

const columns = (page: Page) => page.getByTestId("all-champions-header").evaluate((el) => ["champion", "games", "win", "kda"].map((k) => Math.round(el.querySelector(`[data-testid=sort-${k}]`)!.getBoundingClientRect().x)));

test("desktop: the preview unfolds under its row; nothing moves or folds; click, ↑/↓ and Back", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop's list with a mouse (the tablet's below)");
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(2)).toBeVisible();
  const before = await columns(page);
  const heights = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  const tops = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  const entries = await page.evaluate(() => history.length);
  // Actions answer light: every reply of the preview's server actions is small.
  const replies: number[] = [];
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && r.request().headers()["next-action"]) replies.push((await r.body().catch(() => Buffer.alloc(0))).length);
  });
  await openRow(page, rows.nth(0));
  const preview = page.getByTestId("champion-preview");
  // Under its row, not a window over the list nor a panel over its columns.
  await expect.poll(() => underRow(page, rows.nth(0))).toEqual(UNDER);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  expect(await columns(page)).toEqual(before);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))).toEqual(heights);
  // The row it opened from stays where it was; no column folds (every figure of the row still shown).
  expect(Math.round((await rows.nth(0).boundingBox())!.y)).toBe(tops[0]);
  await expect(page.getByTestId("sort-kda")).toBeVisible();
  await expect(page.getByTestId("sort-mastery")).toBeVisible();
  await expect(rows.nth(0)).toHaveAttribute("data-selected", "true");
  // Its record beside the opponents at this width (a 50rem list and more), the four tiles of averages.
  const record = (await page.getByTestId("champion-preview-record").boundingBox())!;
  const opponents = (await page.getByTestId("champion-preview-opponents").boundingBox())!;
  expect(opponents.x, "the opponents beside the record").toBeGreaterThan(record.x + record.width);
  await expect(page.getByTestId("champion-preview-stats").locator("dt")).toHaveText(["KDA", "CS/min", "Damage/min", "Vision"]);
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
  expect(Math.max(...replies)).toBeLessThanOrEqual(5_000);
  await expect.poll(() => underRow(page, rows.nth(1))).toEqual(UNDER);
  // Keys inside the preview are its own: ↓ on its sort leaves the champion as it is.
  const sort = page.locator("[data-testid^=opponent-sort-]").first();
  if (await sort.count()) {
    await sort.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  }
  // The same at 1280, 1920 and 2560, the sidebar open and collapsed: under its row, nothing scrolling inside, nothing wider than the screen.
  for (const sidebar of ["expanded", "collapsed"]) {
    await page.context().addCookies([{ name: "uniiverse_sidebar", value: sidebar, url: page.url() }]);
    await page.reload();
    await expect(page.getByTestId("champion-preview-content")).toBeVisible();
    for (const { width, height } of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => underRow(page, rows.nth(1)), `${width}px, the sidebar ${sidebar}`).toEqual(UNDER);
    }
  }
  await page.context().clearCookies({ name: "uniiverse_sidebar" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${profile}/champions`);
  await openRow(page, rows.nth(1));
  // Back closes it after the switches.
  await rows.nth(2).getByTestId("open-champion").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(2).getAttribute("data-champion"))!);
  await page.goBack();
  await expect(preview).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  // Escape closes it too, and focus returns to its row; so does its Close, and the row pressed again.
  await openRow(page, rows.nth(0));
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(rows.nth(0).getByTestId("open-champion")).toBeFocused();
  await expect(page).not.toHaveURL(/champion=/);
  await openRow(page, rows.nth(0));
  await page.getByTestId("champion-preview-close").click();
  await expect(preview).toHaveCount(0);
  await openRow(page, rows.nth(0));
  await rows.nth(0).getByTestId("open-champion").click();
  await expect(preview).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
});

test("desktop: switching to a row below the open preview keeps that row where it was on screen", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse in a short window");
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Mid" }).first().getAttribute("href");
  await page.goto(`${new URL(href!, "http://x").pathname}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(5)).toBeAttached();
  const last = rows.nth((await rows.count()) - 1);
  await openRow(page, rows.nth(0));
  // Grown (unfold-grow, 200ms), then the list's end on screen (the preview of the first row above
  // it), then the last row pressed. The page is scrolled further than the preview is tall, so there is
  // room to keep the row in place (above the page's top nothing can).
  await expect.poll(() => page.getByTestId("champion-preview").evaluate((el) => el.firstElementChild?.getAttribute("data-settled") ?? null)).toBe("true");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const grown = (await page.getByTestId("champion-preview").boundingBox())!.height;
  expect(await page.evaluate(() => scrollY), "scrolled past the preview's height").toBeGreaterThan(grown);
  const y0 = (await last.boundingBox())!.y;
  await openRow(page, last);
  expect(Math.abs((await last.boundingBox())!.y - y0), "the pressed row where it was").toBeLessThanOrEqual(2);
  await expect.poll(() => underRow(page, last)).toEqual({ ...UNDER, below: true });
});
test("the content: opponents from 3 games with their games, one unfolding into its games and Champion Lookup", async ({ page }) => {
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
  await expect(content.getByTestId("champion-preview-intel")).toHaveAttribute("href", `/lookup?champion=${vs}`);
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

test("phones: a sheet; ‹ › switch, Back closes it and the list keeps its place", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "the sheet is for phones");
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(1)).toBeVisible();
  // 64px rows at most: the name over the role, the win rate over the games.
  for (const h of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeLessThanOrEqual(64);
  const y = await page.evaluate(() => scrollY);
  await openRow(page, rows.nth(0));
  // The shared Peek's sheet (a window), never the unfold.
  const preview = page.locator("dialog[open][data-testid=champion-preview]");
  await expect(preview).toBeVisible();
  await expect(page.locator("#champion-preview[role=region]")).toHaveCount(0);
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

test("tablets: the preview unfolds under its row too, its record above the opponents; Back and Close close it and the list keeps its place", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet", "a tablet upright (768 × 1024, touch)");
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(1)).toBeVisible();
  const before = await columns(page);
  const y = await page.evaluate(() => scrollY);
  await openRow(page, rows.nth(0));
  await expect.poll(() => underRow(page, rows.nth(0))).toEqual(UNDER);
  await expect(page.locator("aside[data-peek-panel]")).toHaveCount(0);
  expect(await columns(page)).toEqual(before);
  // Under 50rem the record and the opponents stack, the four tiles in one row.
  const record = (await page.getByTestId("champion-preview-record").boundingBox())!;
  const opponents = (await page.getByTestId("champion-preview-opponents").boundingBox())!;
  expect(opponents.y, "the opponents under the record").toBeGreaterThanOrEqual(record.y + record.height);
  const tiles = await page.getByTestId("champion-preview-stats").locator(":scope > div").evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
  expect(tiles, "the tiles on one line").toBe(1);
  // Its Close is a 44px target on a touch screen.
  const close = (await page.getByTestId("champion-preview-close").boundingBox())!;
  expect(close.height).toBeGreaterThanOrEqual(44);
  await page.goBack();
  await expect(page.getByTestId("champion-preview")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await openRow(page, rows.nth(1));
  await page.getByTestId("champion-preview-close").click();
  await expect(page.getByTestId("champion-preview")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
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
    // Escape once the preview is on screen (in a window 480px tall, the sheet: a key pressed before the window has opened reaches nothing).
    await expect(page.locator("dialog[open][data-testid=champion-preview], #champion-preview")).toBeVisible();
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
  // Escape once the preview is on screen (in a window 480px tall, the sheet: a key pressed before the window has opened reaches nothing).
  await expect(page.locator("dialog[open][data-testid=champion-preview], #champion-preview")).toBeVisible();
  if (info.project.name === "desktop") await page.keyboard.press("Escape");
  else await page.goBack();
  await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  await expect(rows, "the whole list still shown").toHaveCount(total);
  await expect.poll(async () => Math.abs((await at()).y - before.y), { message: "the row where it was" }).toBeLessThanOrEqual(3);
});

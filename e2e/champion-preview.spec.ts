import { expect, test, type Locator, type Page } from "./test";
import { NARROW_MOUSE_WINDOWS, expectInReach } from "./reach";

/*
  All Champions' preview on the demo roster (synthetic demo games with lane opponents and timeline
  frames, in-memory only). On tablets and computers it is a compact panel docked at the window's
  right edge (the overlay kit's Peek, since Release 16; it unfolded under its row from Release 13,
  which pushed the list down): the list never moves (Champion, Games and Win rate stay where they
  are, rows keep their place and height, the page never scrolls), the panel is within the screen and
  its content fits it, and no window opens. Phones get a sheet. The address holds it: the first open
  pushes one entry, switching replaces it, so Back always closes; Close, Escape, the row again and a
  click outside close it too. Its content: portrait, role, games and win rate, four tiles of
  averages, then the record against each lane opponent as a compact table (a win rate only from 3
  games, the games beside it), an opponent unfolding into its games (their KDA over them) and the one
  link to Champion Intel, and the foot line. Old champion-window addresses (Matchups, the Overview's
  pools) land here.
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

/**
 * Where the open preview sits: the docked panel (no window), within the screen, its body not
 * scrolling (its content fits), clear of the row's name, nothing wider than the screen.
 */
async function docked(page: Page, row: Locator) {
  return row.evaluate((li) => {
    const panel = document.querySelector<HTMLElement>("aside[data-peek-panel][data-testid=champion-preview]");
    if (!panel) return { found: false };
    const p = panel.getBoundingClientRect();
    const body = panel.querySelector<HTMLElement>("[data-testid=champion-preview-body]");
    const name = li.querySelector("[data-open-champion]")!.getBoundingClientRect();
    return {
      found: true,
      window: !!document.querySelector("dialog[open]"),
      within: p.top >= -0.5 && p.left >= -0.5 && p.bottom <= innerHeight + 0.5 && p.right <= innerWidth + 0.5,
      fits: !!body && body.scrollHeight <= body.clientHeight + 1,
      nameClear: name.right <= p.left,
      sideways: document.documentElement.scrollWidth - innerWidth > 1,
    };
  });
}
const DOCKED = { found: true, window: false, within: true, fits: true, nameClear: true, sideways: false };

const columns = (page: Page) => page.getByTestId("all-champions-header").evaluate((el) => ["champion", "games", "win", "kda"].map((k) => Math.round(el.querySelector(`[data-testid=sort-${k}]`)!.getBoundingClientRect().x)));
const rowBoxes = (rows: Locator) => rows.evaluateAll((els) => els.map((e) => [Math.round(e.getBoundingClientRect().top + scrollY), Math.round(e.getBoundingClientRect().height)]));

test("desktop: the preview is a compact panel docked beside the list; the list never moves; click, ↑/↓, Back, Escape, Close and a click outside", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the desktop's list with a mouse (the tablet's below)");
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(2)).toBeVisible();
  const before = await columns(page);
  const boxes = await rowBoxes(rows);
  const entries = await page.evaluate(() => history.length);
  // Actions answer light: every reply of the preview's server actions is small.
  const replies: number[] = [];
  page.on("response", async (r) => {
    if (r.request().method() === "POST" && r.request().headers()["next-action"]) replies.push((await r.body().catch(() => Buffer.alloc(0))).length);
  });
  await openRow(page, rows.nth(0));
  const preview = page.getByTestId("champion-preview");
  await expect(page.locator("aside[data-peek-panel][data-testid=champion-preview]")).toBeVisible();
  await page.getByTestId("champion-preview-foot").waitFor();
  await expect.poll(() => docked(page, rows.nth(0))).toEqual(DOCKED);
  // The list stays where it was: its columns, every row's place and height, the page's scroll.
  expect(await columns(page)).toEqual(before);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await rowBoxes(rows)).toEqual(boxes);
  await expect(rows.nth(0)).toHaveAttribute("data-selected", "true");
  // The record and the opponents: four tiles of averages, a compact table under its heading row.
  await expect(page.getByTestId("champion-preview-stats").locator("dt")).toHaveText(["KDA", "CS/min", "Damage/min", "Vision"]);
  // The figures the panel lies over on a wide table (Kills, Double … Penta) are in it, one line.
  await expect(page.getByTestId("champion-preview-kills")).toHaveText(/^Kills [\d,*—]+ · Multikills (\d+ double · \d+ triple · \d+ quadra · \d+ penta\*?|not counted yet)/);
  expect((await page.getByTestId("champion-preview-kills").boundingBox())!.height, "one line").toBeLessThanOrEqual(24);
  await expect(page.getByTestId("champion-preview-opponent-head")).toBeVisible();
  for (const h of await page.getByTestId("champion-preview-opponent").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h, "a dense opponent row").toBeLessThanOrEqual(40);
  await expect(page.getByTestId("champion-preview-foot")).toContainText("Lane opponent: the enemy Riot placed in");
  // An opened opponent unfolds inside the panel, which still fits the screen without scrolling.
  await page.getByTestId("champion-preview-opponent").first().getByRole("button").first().click();
  await expect(page.getByTestId("champion-preview-game").first()).toBeVisible();
  await expect(page.getByTestId("champion-preview-pairing-kda")).toContainText(/KDA \d+\.\d\d|Perfect KDA/);
  await expect.poll(() => docked(page, rows.nth(0))).toEqual(DOCKED);
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
  expect(await rowBoxes(rows)).toEqual(boxes);
  expect(Math.max(...replies)).toBeLessThanOrEqual(5_000);
  // ‹ › in the panel's header step along the rows too.
  await preview.getByTestId("champion-preview-next").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(2).getAttribute("data-champion"))!);
  await preview.getByTestId("champion-preview-prev").click();
  await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  // Keys inside the preview are its own: ↓ on its sort leaves the champion as it is.
  const sort = page.locator("[data-testid^=opponent-sort-]").first();
  if (await sort.count()) {
    await sort.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("champion-preview-content")).toHaveAttribute("data-champion", (await rows.nth(1).getAttribute("data-champion"))!);
  }
  // The same at 1280, 1920 and 2560, the sidebar open and collapsed: docked within the screen, its content fitting, the row's name clear of it.
  for (const sidebar of ["expanded", "collapsed"]) {
    await page.context().addCookies([{ name: "uniiverse_sidebar", value: sidebar, url: page.url() }]);
    await page.reload();
    await expect(page.getByTestId("champion-preview-content")).toBeVisible();
    for (const { width, height } of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => docked(page, rows.nth(1)), `${width}px, the sidebar ${sidebar}`).toEqual(DOCKED);
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
  await expect(rows.nth(0).getByTestId("open-champion")).toBeFocused();
  await openRow(page, rows.nth(0));
  await rows.nth(0).getByTestId("open-champion").click();
  await expect(preview).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  // A click outside (the section's scope line) closes it and takes it out of the address; one inside does not.
  await openRow(page, rows.nth(0));
  await page.getByTestId("champion-preview-coverage").click();
  await expect(page.getByTestId("champion-preview-content")).toBeVisible();
  const entriesOpen = await page.evaluate(() => history.length);
  await page.getByTestId("all-champions-scope").click();
  await expect(preview).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  expect(await page.evaluate(() => history.length), "closing went Back: no entry added").toBe(entriesOpen);
  expect(await rowBoxes(rows)).toEqual(boxes);
});

test("desktop: in a short scrolled window, opening, switching and closing never move the list", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "a mouse in a short window");
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.goto("/players");
  const href = await page.locator("main a[data-testid='player-card']", { hasText: "Demo Mid" }).first().getAttribute("href");
  await page.goto(`${new URL(href!, "http://x").pathname}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(5)).toBeAttached();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  const last = rows.nth((await rows.count()) - 1);
  const y0 = (await last.boundingBox())!.y;
  const scroll0 = await page.evaluate(() => scrollY);
  expect(scroll0, "the list is scrolled").toBeGreaterThan(0);
  await openRow(page, last);
  await expect.poll(() => docked(page, last)).toMatchObject({ found: true, window: false, within: true, nameClear: true, sideways: false });
  expect(Math.abs((await last.boundingBox())!.y - y0), "the pressed row where it was").toBeLessThanOrEqual(1);
  await page.keyboard.press("ArrowUp");
  await expect(page.getByTestId("champion-preview-content")).not.toHaveAttribute("data-champion", (await last.getAttribute("data-champion"))!);
  expect(Math.abs((await last.boundingBox())!.y - y0), "the list did not move on a switch").toBeLessThanOrEqual(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
  expect(Math.abs((await last.boundingBox())!.y - y0), "nor on closing").toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => scrollY)).toBe(scroll0);
});
test("the content: opponents from 3 games with their games, one unfolding into its games and Champion Intel", async ({ page }) => {
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const row = page.getByTestId("top-champion").first();
  await openRow(page, row);
  const content = page.getByTestId("champion-preview-content");
  await expect(content.getByTestId("champion-preview-figures")).toContainText(/\d+ games? · \d+W \d+L/);
  const opponents = content.getByTestId("champion-preview-opponent");
  await expect(opponents.first()).toBeVisible();
  // The opponents' sort is the app's segmented control: the chosen one semibold over the accent underline, no ring (G2-11; Release 17).
  const sorts = content.locator("[data-testid^=opponent-sort-]");
  if (await sorts.count()) expect(await sorts.evaluateAll((els) => els.map((e) => [e.getAttribute("aria-pressed"), getComputedStyle(e).fontWeight, getComputedStyle(e).boxShadow, getComputedStyle(e, "::after").opacity]))).toEqual(await sorts.evaluateAll((els) => els.map((e) => (e.getAttribute("aria-pressed") === "true" ? ["true", "600", "none", "1"] : ["false", "500", "none", "0"]))));
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
  await expect(content.getByTestId("champion-preview-lookup")).toHaveAttribute("href", `/lookup?champion=${vs}`);
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
  // The shared Peek's sheet (a window), never the docked panel.
  const preview = page.locator("dialog[open][data-testid=champion-preview]");
  await expect(preview).toBeVisible();
  await expect(page.locator("aside[data-peek-panel]")).toHaveCount(0);
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

test("tablets: the preview is the docked panel too, within the screen; the list stays where it was; Back and Close close it", async ({ page }, info) => {
  test.skip(info.project.name !== "tablet", "a tablet upright (768 × 1024, touch)");
  const profile = await demoTop(page);
  await page.goto(`${profile}/champions`);
  const rows = page.getByTestId("top-champion");
  await expect(rows.nth(1)).toBeVisible();
  const before = await columns(page);
  const boxes = await rowBoxes(rows);
  const y = await page.evaluate(() => scrollY);
  await openRow(page, rows.nth(0));
  await page.getByTestId("champion-preview-foot").waitFor();
  await expect.poll(() => docked(page, rows.nth(0))).toEqual(DOCKED);
  expect(await columns(page)).toEqual(before);
  expect(await rowBoxes(rows)).toEqual(boxes);
  // Its ✕ is a 44px target on a touch screen, and so is an opponent's row.
  const close = (await page.getByTestId("champion-preview-close").boundingBox())!;
  expect(Math.min(close.width, close.height)).toBeGreaterThanOrEqual(44);
  expect((await page.getByTestId("champion-preview-opponent").first().getByRole("button").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // An opened opponent's "Show all N games" and its link to Champion Intel too (Release 16's review: 32px and 16px).
  await page.getByTestId("champion-preview-opponent").first().getByRole("button").first().click();
  await expect(page.getByTestId("champion-preview-lookup")).toBeVisible();
  for (const id of ["champion-preview-lookup", "champion-preview-all-games"]) {
    const target = page.getByTestId(id);
    if (await target.count()) expect((await target.boundingBox())!.height, `${id}: a 44px target on touch`).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId("champion-preview-opponent").first().getByRole("button").first().click();
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
    await expect(page.getByTestId("champion-preview-content")).toBeVisible();
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
  await expect(page.getByTestId("champion-preview-content")).toBeVisible();
  if (info.project.name === "desktop") await page.keyboard.press("Escape");
  else await page.goBack();
  await expect(page.getByTestId("champion-preview-content")).toHaveCount(0);
  await expect(page).not.toHaveURL(/champion=/);
  await expect(rows, "the whole list still shown").toHaveCount(total);
  await expect.poll(async () => Math.abs((await at()).y - before.y), { message: "the row where it was" }).toBeLessThanOrEqual(3);
});

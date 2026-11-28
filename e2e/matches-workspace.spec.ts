import { expect, test, type Page } from "./test";
import { FLOOR, cfg, demoPlayerId, expectEveryRecord, fits, flowUnchanged, openAt, region, resizeTo, settled, walkPages, type Size } from "./workspace";

/*
  Match History, Encounters and Team Matches in the one-screen workspace (docs/RESPONSIVE.md, "One-screen desktop
  pages", the pages; the owner's requirement of 27 and 28 Nov 2026): each list shows the complete rows the window has
  room for (its row budget, written to the address as the server's page size: `per`, Encounters' `eper`), its pager
  costs no line of its own, its pages expose every record, the keys cross pages, and every game opens in the game
  window over the list (DetailModal at the match window's width and the workspace's height), whose Previous and Next go
  on across the list's pages, Back and Escape closing it. The flow (a short or narrow window, phones, tablets) is as it
  was. The rows of the platform spec (e2e/one-screen.spec.ts) hold the fit at the owner's eight configurations and the
  floor; this spec the behaviour. Desktop project only, on the suite's own server (the demo: 208 games for Demo Top,
  7 players met, 6 Team Matches games). Nothing here names a person: demo profiles by role, counts and positions only.
*/

test.beforeEach(({ browserName }, info) => {
  void browserName;
  test.skip(info.project.name !== "desktop", "a desktop window's one-screen workspace (desktop project only)");
});

const MH = (id: string) => `/players/${id}/matches`;

/** The cards drawn and their places on the whole list (aria-posinset), and the region's figures. */
async function cards(page: Page, row = "[data-testid=match-item]") {
  return page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getBoundingClientRect().height > 0).map((el) => Number(el.getAttribute("aria-posinset"))), row);
}

/** The open game window: its box against the screen, and the view's bottom against its room (nothing past the window's foot, nothing scrolling). */
async function gameWindow(page: Page) {
  return page.evaluate(() => {
    const d = document.querySelector<HTMLElement>("dialog[open][data-testid=match-detail]");
    const bd = d?.querySelector<HTMLElement>("[data-testid=match-breakdown]");
    if (!d || !bd) return null;
    const room = bd.parentElement!.getBoundingClientRect();
    const box = d.getBoundingClientRect();
    const scrolls = [d, ...d.querySelectorAll<HTMLElement>("*")].filter((el) => {
      const s = getComputedStyle(el);
      return (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1);
    }).length;
    return { size: d.dataset.size, width: d.dataset.width, top: box.top, bottom: box.bottom, height: box.height, viewBottom: bd.getBoundingClientRect().bottom, roomBottom: room.bottom, paged: bd.dataset.pagedBy ?? null, scrolls, position: d.querySelector("[data-testid=match-detail-position]")?.textContent ?? null, rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize) };
  });
}

/**
 * The open game window fits, once its layout has settled: a part that has just arrived (the timeline, the groups) is measured
 * by the view's ResizeObserver before the next paint, which pages the view where it no longer fits; a read in between (a
 * task between React's commit and that frame) sees the view as it was for an instant no reader sees.
 */
async function expectWindowFits(page: Page, at: string) {
  await expect(async () => expectWindowFitsNow(page, at)).toPass({ timeout: 5_000 });
}

async function expectWindowFitsNow(page: Page, at: string) {
  const w = await gameWindow(page);
  expect(w, `${at}: the game window is open`).not.toBeNull();
  const inner = await page.evaluate(() => innerHeight);
  expect(w!.size, `${at}: the workspace's window`).toBe("workspace");
  expect(w!.width, `${at}: at the match window's width`).toBe("game");
  expect(w!.top, `${at}: inside the screen`).toBeGreaterThanOrEqual(0);
  expect(w!.bottom, `${at}: inside the screen`).toBeLessThanOrEqual(inner);
  expect(Math.abs(w!.height - (inner - 2 * w!.rootPx)), `${at}: as tall as the screen less 1rem above and below`).toBeLessThanOrEqual(1);
  expect(w!.viewBottom, `${at}: the view ends inside its room (its pages where it does not fit)`).toBeLessThanOrEqual(w!.roomBottom + 0.5);
  expect(w!.scrolls, `${at}: nothing in the window scrolls`).toBe(0);
}

test("Match History pages by its row budget: the address carries it, the pager is on the toolbar's row, and the pages are contiguous to the last game", async ({ page }) => {
  test.setTimeout(150_000);
  const id = await demoPlayerId(page);
  for (const [size, per] of [
    [[1366, 768], 4],
    [[1440, 900], 5],
    [FLOOR, 3],
  ] as Array<[Size, number]>) {
    await page.context().clearCookies();
    await openAt(page, MH(id), size, "expanded");
    const r = (await region(page, "games"))!;
    expect(r.per, `${cfg(size, "expanded")}: the cards that fit`).toBe(per);
    await expect(page).toHaveURL(new RegExp(`per=${per}`));
    // The pager on the toolbar's row (no line of its own), the flow's stacked pager gone.
    const lead = await page.getByTestId("match-pages-lead").boundingBox();
    const toolbar = await page.getByTestId("section-toolbar").boundingBox();
    expect(lead!.y + lead!.height).toBeLessThanOrEqual(toolbar!.y + toolbar!.height + 0.5);
    await expect(page.getByTestId("match-pages")).toHaveCount(1);
    // The list's cookie keeps the budget for the next visit's first paint (UI state: a number).
    const kept = (await page.context().cookies()).find((c) => c.name === "uniiverse_per_games");
    expect(kept?.value).toBe(String(per));
  }
  // Every game reachable: the pages follow on (places 1–3, 4–6, …) and End reaches the last game.
  expect(await cards(page)).toEqual([1, 2, 3]);
  await page.getByTestId("match-next").click();
  await expect(page).toHaveURL(/page=2/);
  await settled(page);
  expect(await cards(page)).toEqual([4, 5, 6]);
  const total = (await region(page, "games"))!.total;
  await page.getByTestId("match-row").first().focus();
  await page.keyboard.press("End");
  await expect(page).toHaveURL(new RegExp(`page=${Math.ceil(total / 3)}`));
  await settled(page);
  expect((await cards(page)).at(-1)).toBe(total);
  await expect(page.locator(":focus")).toHaveAttribute("data-testid", "match-row");
  expect(await page.evaluate(() => document.activeElement?.closest("[data-ws-row]")?.getAttribute("aria-posinset"))).toBe(String(total));
  // PageUp: the previous page's last game; Home: the first.
  await page.keyboard.press("PageUp");
  await expect(page).toHaveURL(new RegExp(`page=${Math.ceil(total / 3) - 1}`));
  await settled(page);
  await page.keyboard.press("Home");
  await expect(page).toHaveURL(/page=1(&|$)/);
  await settled(page);
  expect(await page.evaluate(() => document.activeElement?.closest("[data-ws-row]")?.getAttribute("aria-posinset"))).toBe("1");
  // The server's first paint of the next visit draws the kept count.
  const html = await (await page.request.get(MH(id))).text();
  expect(html.match(/data-testid="match-item"/g)?.length).toBe(3);
});

test("the game window: every game opens over the list, fits the window, steps on across the list's pages, and Escape and Back close it", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await demoPlayerId(page);
  await openAt(page, MH(id), [1366, 768], "expanded");
  const total = (await region(page, "games"))!.total;
  const before = await page.evaluate(() => document.documentElement.scrollHeight);
  const last = page.getByTestId("match-card").nth(3);
  const lastId = await last.getByTestId("match-row").getAttribute("data-match");
  await last.click({ position: { x: 24, y: 16 } });
  await expect(page.locator("dialog[open] [data-testid=match-breakdown]")).toBeVisible();
  // Nothing under the card, the list where it was, and the page no taller.
  await expect(page.getByTestId("match-expanded")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(before);
  await expectWindowFits(page, "1366x768");
  await expect(page.getByTestId("match-detail-position")).toHaveText(`Game 4 of ${total}`);
  await expect(page).toHaveURL(new RegExp(`match=${lastId}`));
  const entries = await page.evaluate(() => history.length);
  // Next at the page's end: the next page's first game, the list turning behind the window, the address replaced.
  await page.getByTestId("match-detail-next").click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByTestId("match-detail-position")).toHaveText(`Game 5 of ${total}`);
  await expect(page.getByTestId("match-detail-next")).toBeFocused();
  expect(await page.evaluate(() => history.length)).toBe(entries);
  await page.getByTestId("match-detail-prev").click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page.getByTestId("match-detail-position")).toHaveText(`Game 4 of ${total}`);
  await expect(page).toHaveURL(new RegExp(`match=${lastId}`));
  // Escape closes it: the address without the game, the focus on its card.
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
  await expect(last.getByTestId("match-row")).toBeFocused();
  // Back closes a game opened from its card (the one history rule), and leaves the list.
  await page.getByTestId("match-card").first().click({ position: { x: 24, y: 16 } });
  await expect(page.locator("dialog[open] [data-testid=match-breakdown]")).toBeVisible();
  await page.goBack();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
  await expect(page.getByTestId("match-history")).toBeVisible();
  // A link to a game opens it in the window too.
  await page.goto(`${MH(id)}?match=${lastId}`);
  await expect(page.locator("dialog[open][data-size=workspace] [data-testid=match-breakdown]")).toBeVisible();
});

test("at the floor (1366 × 657) every game of a page fits the game window, whole or in its pages, and nothing scrolls", async ({ page }) => {
  test.setTimeout(150_000);
  const id = await demoPlayerId(page);
  await openAt(page, `${MH(id)}?per=10`, FLOOR, "collapsed");
  // Ten games of the first page (the address's size, past the budget), each opened from the one before.
  await page.goto(`${MH(id)}?per=10&page=1&match=${await page.getByTestId("match-row").first().getAttribute("data-match")}`);
  await expect(page.locator("dialog[open] [data-testid=match-breakdown]")).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.waitForFunction(() => {
      const b = document.querySelector("dialog[open] [data-testid=match-breakdown]");
      return !!b && b.getAttribute("data-timeline") !== "loading";
    }, null, { timeout: 15_000 });
    await expectWindowFits(page, `game ${i + 1}`);
    const next = page.getByTestId("match-detail-next");
    if (await next.isDisabled()) break;
    await next.click();
    await expect(page.getByTestId("match-detail-position")).toHaveText(new RegExp(`^Game ${i + 2} of`));
  }
});

test("a new page size keeps the game open in the window on the list's page, so its Next goes on from it", async ({ page }) => {
  test.setTimeout(90_000);
  const id = await demoPlayerId(page);
  // The fourth game of the first ten, read in the flow (a window just under the gate: ten cards a page).
  await openAt(page, `${MH(id)}?per=10`, [1366, 640], "collapsed");
  await expect(page.getByTestId("match-row")).toHaveCount(10);
  const fourth = (await page.getByTestId("match-row").nth(3).getAttribute("data-match"))!;
  // At the floor with that game open from a link: the budget (three cards) is written to the address, on the page holding the
  // game (the second), not the page holding the first card (the first, where Next waited for a page that never came).
  await page.setViewportSize({ width: FLOOR[0], height: FLOOR[1] });
  await page.goto(`${MH(id)}?per=10&page=1&match=${fourth}`);
  await expect(page.locator("dialog[open] [data-testid=match-breakdown]")).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("per"), { timeout: 15_000 }).not.toBe("10");
  const per = Number(new URL(page.url()).searchParams.get("per"));
  expect(per, "the floor's budget is under four cards (the fourth game is on another page than the first)").toBeLessThan(4);
  await expect.poll(() => new URL(page.url()).searchParams.get("page")).toBe(String(Math.floor(3 / per) + 1));
  expect(new URL(page.url()).searchParams.get("match")).toBe(fourth);
  await expect(page.getByTestId("match-detail-position")).toHaveText(/^Game 4 of/);
  await expect(page.locator(`[data-testid=match-item][data-row-key="${fourth}"]`)).toBeVisible();
  await page.getByTestId("match-detail-next").click();
  await expect(page.getByTestId("match-detail-position")).toHaveText(/^Game 5 of/);
});

/** A list's games in order as the server draws them, by their match ids (`attr`: Match History's `data-match`, Team Matches' `data-match-id`). */
async function gameIds(page: Page, path: string, attr: string) {
  const html = await (await page.request.get(path)).text();
  return [...new Set([...html.matchAll(new RegExp(`${attr}="([^"]+)"`, "g"))].map((m) => m[1]!))];
}

/** The rows-per-page test cookie (server/demo/test-hooks.ts): the budget no more than `n` cards, whatever the window. */
const capAt = (n: number) => ({ "uniiverse-test-rows-per-page": String(n) });

test("a link to a game past Match History's first page opens with the list on its page, Previous, Next and its place kept, with a kept budget or a first visit's", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await demoPlayerId(page);
  await page.context().clearCookies();
  const ids = await gameIds(page, `${MH(id)}?per=25`, "data-match");
  expect(ids.length, "the demo player's first 25 games").toBe(25);
  // A reader whose kept budget is three (the list's cookie) follows a link to the 7th game: the server draws page 3 (games 7 to
  // 9), not page 1, where the window opened with no Previous, no Next and no place.
  await openAt(page, `${MH(id)}?match=${ids[6]}`, [1440, 900], "expanded", { cookies: { uniiverse_per_games: "3", ...capAt(3) } });
  await expect(page.locator("dialog[open] [data-testid=match-breakdown]")).toBeVisible();
  await expect(page.getByTestId("match-detail-position")).toHaveText(/^Game 7 of \d+/);
  expect((await region(page, "games"))!.page).toBe(3);
  await expect(page.locator(`[data-testid=match-item][data-row-key="${ids[6]}"]`)).toBeVisible();
  await page.getByTestId("match-detail-next").click();
  await expect(page.getByTestId("match-detail-position")).toHaveText(/^Game 8 of/);
  // Closed, the address names the page the list shows, so a reload or a copy shows it.
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
  await expect(page).toHaveURL(/page=3(&|$)/);
  // A first visit (no kept budget): the server's ten first, the game in the window; the budget is written with the page left
  // out, and the server's page holds the 15th game (page 5 of three).
  await page.context().clearCookies();
  await openAt(page, `${MH(id)}?match=${ids[14]}`, [1440, 900], "expanded", { cookies: capAt(3) });
  await expect(page).toHaveURL(/per=3/);
  await expect(page).toHaveURL(new RegExp(`match=${ids[14]}`));
  await expect(page.getByTestId("match-detail-position")).toHaveText(/^Game 15 of/);
  expect((await region(page, "games"))!.page).toBe(5);
  await page.getByTestId("match-detail-prev").click();
  await expect(page.getByTestId("match-detail-position")).toHaveText(/^Game 14 of/);
});

test("Team Matches: a link to a game past the first page opens on its page with a kept budget, and stays open through a first visit's page size, a link copied at another and the flow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.context().clearCookies();
  const ids = await gameIds(page, "/matches?per=6", "data-match-id");
  expect(ids.length, "the demo's six Team Matches games").toBe(6);
  const last = ids[5]!;
  const open = page.locator("dialog[open][data-size=workspace] [data-testid=match-breakdown]");
  // A reader whose kept budget is two follows a link to the 6th game: the server lists page 3 (games 5 and 6), not page 1,
  // where the game never opened.
  await openAt(page, `/matches?match=${last}`, [1440, 900], "expanded", { cookies: { uniiverse_per_together: "2", ...capAt(2) } });
  await expect(open).toBeVisible();
  await expect(page.getByTestId("match-detail-position")).toHaveText("Game 6 of 6");
  expect((await region(page, "together"))!.page).toBe(3);
  await page.getByTestId("match-detail-prev").click();
  await expect(page.getByTestId("match-detail-position")).toHaveText("Game 5 of 6");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
  await expect(page).toHaveURL(/page=3(&|$)/);
  // A first visit: the server lists the first 20 (all six) and the window opens; the budget is then written on the page that
  // holds the game, with the game kept (it used to go to page 1, closing the window and dropping ?match=).
  await page.context().clearCookies();
  await openAt(page, `/matches?match=${last}`, [1440, 900], "expanded", { cookies: capAt(2) });
  await expect(page).toHaveURL(/per=2/);
  await expect(page).toHaveURL(new RegExp(`match=${last}`));
  await expect(open).toBeVisible();
  await expect(page.getByTestId("match-detail-position")).toHaveText("Game 6 of 6");
  expect((await region(page, "together"))!.page).toBe(3);
  // A link copied at three a page (page 2 holds the 6th game) read at two a page: page 3, not page 2 (games 3 and 4).
  await page.context().clearCookies();
  await openAt(page, `/matches?per=3&page=2&match=${last}`, [1440, 900], "expanded", { cookies: capAt(2) });
  await expect(page).toHaveURL(/per=2/);
  await expect(page).toHaveURL(/page=3(&|$)/);
  await expect(open).toBeVisible();
  await expect(page.getByTestId("match-detail-position")).toHaveText("Game 6 of 6");
  // The same link in the flow (a short window): its page size dropped, the game still open under its card and in the address.
  await page.context().clearCookies();
  await openAt(page, `/matches?per=3&page=2&match=${last}`, [1366, 640], "expanded");
  await expect(page).not.toHaveURL(/per=/);
  await expect(page).toHaveURL(new RegExp(`match=${last}`));
  await expect(page.locator(`[data-testid=together-game][data-match-id="${last}"][data-expanded]`)).toBeVisible();
});

test("Encounters pages its table by its rows: every player once, the pager in Show more's place, and a player's games keep the list's page for the way back", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await demoPlayerId(page);
  await openAt(page, `${MH(id)}?view=encounters`, FLOOR, "expanded");
  const r = (await region(page, "encounters"))!;
  expect(r.per).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("encounter-more")).toHaveCount(0);
  await fits(page, "1366x657 Encounters", { workspace: true, pager: "encounter-pager" });
  const read = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid=encounter-row]")].filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.dataset.rowKey!));
  const walk = await walkPages(page, "encounters", "encounter-next", read);
  expectEveryRecord(walk, r.total, "1366x657 Encounters");
  // The last page's first player: their games, then "All encounters" back to that page, the focus on their row.
  const key = walk.pages.at(-1)![0]!;
  await page.locator(`[data-encounter-row="${key}"]`).click();
  await expect(page.getByTestId("match-history")).toHaveAttribute("data-ready", "true");
  await expect(page).toHaveURL(/epage=/);
  await page.getByTestId("encounter-back").click();
  await expect(page.getByTestId("encounters")).toHaveAttribute("data-ready", "true");
  await expect.poll(async () => (await region(page, "encounters"))?.page).toBe(walk.pages.length);
  await expect(page.locator(`[data-encounter-row="${key}"]`)).toBeFocused();
});

test("Team Matches pages its cards, every game once, and its game window steps across the pages", async ({ page }) => {
  test.setTimeout(120_000);
  await openAt(page, "/matches", [1366, 768], "expanded");
  const r = (await region(page, "together"))!;
  expect(r.pages).toBeGreaterThan(1);
  await expect(page.getByTestId("together-more")).toHaveCount(0);
  const read = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid=together-list] > li")].filter((el) => el.getBoundingClientRect().height > 0).map((el) => el.dataset.rowKey!));
  const walk = await walkPages(page, "together", "together-next", read);
  expectEveryRecord(walk, r.total, "1366x768 Team Matches");
  // Back to the first page; its last game, then Next: the next page's first game in the window.
  await openAt(page, "/matches", [1366, 768], "expanded");
  const perPage = (await region(page, "together"))!.per;
  await page.getByTestId("together-card").nth(perPage - 1).click({ position: { x: 24, y: 12 } });
  await expect(page.locator("dialog[open][data-size=workspace] [data-testid=match-breakdown]")).toBeVisible();
  await expectWindowFits(page, "1366x768 Team Matches");
  await expect(page.getByTestId("match-detail-position")).toHaveText(`Game ${perPage} of ${r.total}`);
  await page.getByTestId("match-detail-next").click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByTestId("match-detail-position")).toHaveText(`Game ${perPage + 1} of ${r.total}`);
  await page.goBack();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
});

test("outside the gate the three lists are the flow, as they were: Show more, the stacked pager, games under their cards", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await demoPlayerId(page);
  for (const path of [MH(id), `${MH(id)}?view=encounters`, "/matches"]) await flowUnchanged(page, path);
  await openAt(page, MH(id), [1366, 640], "expanded");
  // Ten cards a page (the server's default, which the flow keeps on a window like this one), under the stacked pager.
  await expect(page.getByTestId("match-item")).toHaveCount(10);
  await expect(page.getByTestId("match-pages")).toBeVisible();
  await page.getByTestId("match-card").first().click({ position: { x: 24, y: 16 } });
  await expect(page.getByTestId("match-expanded").getByTestId("match-breakdown")).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  // A page size the workspace kept is the flow's to forget (a window that left the workspace).
  await page.context().addCookies([{ name: "uniiverse_per_encounters", value: "3", url: new URL(page.url()).origin }]);
  await openAt(page, `${MH(id)}?view=encounters`, [1366, 640], "expanded");
  await expect.poll(() => page.getByTestId("encounter-row").count()).toBe(7);
  expect((await page.context().cookies()).find((c) => c.name === "uniiverse_per_encounters")).toBeUndefined();
  await resizeTo(page, [1366, 640]);
});

import { expect, test, type Page } from "./test";
import { FLOOR, cfg, demoPlayerId, expectEveryRecord, fits, flowUnchanged, openAt, region, resizeTo, settled, walkPages, withWideText, type Side, type Size } from "./workspace";
import { cardOf } from "./match-history";
import { CLEARANCE } from "./modal-corner";

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

/**
 * The game window's corner: its header's steps (Previous, the game's place, Next and Close, GameSteps where="window"), the
 * nearest content to them, and Close's place: the steps' last control, in the window's top-right corner. Nothing personal:
 * the nearest is named by its test id or its tag.
 */
async function gameCorner(page: Page) {
  return page.evaluate(() => {
    const d = document.querySelector<HTMLElement>("dialog[open][data-testid=match-detail]")!;
    const steps = d.querySelector<HTMLElement>("[data-game-step][data-where=window]")!;
    const close = steps.querySelector<HTMLElement>("[data-testid=match-detail-close]")!;
    const k = steps.getBoundingClientRect();
    const c = close.getBoundingClientRect();
    const w = d.getBoundingClientRect();
    const seen = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 0.5 && r.height > 0.5 && getComputedStyle(e).visibility !== "hidden" && !e.closest(".sr-only");
    };
    // Whatever can be used or read outside the steps: controls, and every element with text of its own.
    const content = [...d.querySelectorAll("*")].filter((e) => !steps.contains(e) && !e.contains(steps) && seen(e) && (e.matches("a, button, input, select, textarea, [role=tab]") || [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())));
    const gap = (r: DOMRect) => Math.max(0, k.left - r.right, r.left - k.right, k.top - r.bottom, r.top - k.bottom);
    let nearest = { gap: Infinity, what: "" };
    for (const e of content) {
      const g = gap(e.getBoundingClientRect());
      if (g < nearest.gap) nearest = { gap: g, what: e.getAttribute("data-testid") ?? e.tagName.toLowerCase() };
    }
    const buttons = [...steps.querySelectorAll("button")];
    return { nearest, last: buttons.at(-1) === close && c.right >= k.right - 0.5, fromRight: w.right - c.right, fromTop: c.top - w.top, ringed: document.activeElement === close && close.matches(":focus-visible") };
  });
}

/*
  The game window's focus as it opens, by DetailModal's rule for every window (docs/DESIGN_SYSTEM.md, "Focus"): opened by a
  link or from the keyboard, its close button has the focus, ringed, so a keyboard user sees where they are; opened by a
  click, the window itself. Headless, its close button is its header's labelled Close (`headlessClose`), at the end of its
  steps: the window's own Previous and Next sit beside it, as on a card, and the window's content keeps 12px clear of them.
*/
test("the game window: opened by a link or the keyboard its Close has the focus, ringed; by a click the window itself; its steps keep the corner; Escape closes it", async ({ page }) => {
  test.setTimeout(120_000);
  const id = await demoPlayerId(page);
  await openAt(page, MH(id), [1440, 900], "expanded");
  const second = (await page.getByTestId("match-row").nth(1).getAttribute("data-match"))!;
  const win = page.locator("dialog[open][data-testid=match-detail]");
  const close = win.getByTestId("match-detail-close");
  // A link to a game: the window over the list, its Close focused and ringed.
  await page.goto(`${MH(id)}?match=${second}`);
  await expect(win.getByTestId("match-result")).toBeVisible({ timeout: 15_000 });
  expect(await win.getAttribute("data-size"), "the workspace's game window").toBe("workspace");
  await expect(close).toBeFocused();
  const corner = await gameCorner(page);
  expect(corner.ringed, "Close ringed (:focus-visible)").toBe(true);
  expect(corner.nearest.gap, `nearest content to the steps: ${corner.nearest.what}`).toBeGreaterThanOrEqual(CLEARANCE - 0.5);
  expect(corner.last, "Close is the steps' last control").toBe(true);
  expect(corner.fromRight, "Close in the top-right corner").toBeLessThanOrEqual(16);
  expect(corner.fromTop, "Close in the top-right corner").toBeLessThanOrEqual(16);
  // Escape closes it, the focus on its card (nothing on the page opened it), and the address without the game.
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);
  await expect(page).not.toHaveURL(/match=/);
  await expect(cardOf(page, second).getByTestId("match-row")).toBeFocused();
  // From the keyboard (Enter on a card): Close has the focus; Escape gives it back to the card.
  const first = page.getByTestId("match-row").first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(win.getByTestId("match-result")).toBeVisible({ timeout: 15_000 });
  await expect(close).toBeFocused();
  expect((await gameCorner(page)).ringed, "Close ringed from the keyboard").toBe(true);
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);
  await expect(first).toBeFocused();
  // By a click: the window itself takes the focus, nothing in it ringed.
  await page.getByTestId("match-card").nth(2).click({ position: { x: 24, y: 16 } });
  await expect(win.getByTestId("match-result")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null)).toBe("match-detail");
  await page.keyboard.press("Escape");
  await expect(win).toHaveCount(0);
});

/*
  A player's name on a card's teams is data (the owner's rule: nothing clipped in the workspace). In the workspace a name
  wider than its slot takes a second line, the icon and the opponent's rank level with its first, and the list's row budget
  counts the taller card; the flow keeps its five fixed lines. On CI the specs before this one have read the opponents'
  ranks of these games, and the rank at the line's end left a demo name ("Demo Rival 6") about 2px short at 1366 × 768 with
  the sidebar open (CI run 46140346944): here the ranks are read the same way, and one name is made as long as a Riot name
  can be (16 characters, none to break at), in the page itself, since no demo player has one.
*/
test("a long name on a card's teams shows whole in the workspace, on a second line, and the list still fits; the flow keeps its five lines", async ({ page }) => {
  test.setTimeout(120_000);
  await withWideText(page);
  const id = await demoPlayerId(page);
  await openAt(page, MH(id), [1366, 768], "expanded");
  // The first game's opponents' ranks read (its window's scoreboard asks for them), shown on its card once it closes.
  const matchId = (await page.getByTestId("match-row").first().getAttribute("data-match"))!;
  await page.getByTestId("match-card").first().click({ position: { x: 24, y: 16 } });
  const note = page.locator("dialog[open] [data-testid=ranks-note]");
  await expect(note).toBeAttached({ timeout: 15_000 });
  await expect(note).not.toHaveAttribute("data-state", "checking", { timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const card = cardOf(page, matchId);
  await expect(card.getByTestId("slot-rank").first()).toBeVisible();
  await settled(page);
  const before = (await card.boundingBox())!.height;
  // An opponent with a rank: the name a Riot name's longest.
  const slot = card.locator("[data-testid=team-slot]:not([data-you]):not([data-member]):has([data-testid=slot-rank])").first();
  const name = slot.getByTestId("team-slot-name");
  const LONG = "WanderingKnightX";
  await name.evaluate((el, long) => {
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode())
      if (n.textContent!.trim() && !n.parentElement!.closest(".sr-only")) {
        n.nodeValue = long;
        return;
      }
  }, LONG);
  await settled(page);
  const geometry = () =>
    name.evaluate((el, long) => {
      const box = el.getBoundingClientRect();
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let text: DOMRect | null = null;
      for (let n = walk.nextNode(); n && !text; n = walk.nextNode())
        if (n.textContent === long) {
          const range = document.createRange();
          range.selectNodeContents(n);
          text = range.getBoundingClientRect();
        }
      const s = el.closest("[data-testid=team-slot]")!;
      const icon = s.firstElementChild!.getBoundingClientRect();
      const rank = s.querySelector("[data-testid=slot-rank]")!.getBoundingClientRect();
      return { found: !!text, cut: el.scrollWidth > el.clientWidth + 0.5, lines: Math.round(box.height / parseFloat(getComputedStyle(el).lineHeight)), textLeft: text?.left ?? 0, textRight: text?.right ?? 0, left: box.left, right: box.right, top: box.top, iconTop: icon.top, rankTop: rank.top, rankLeft: rank.left, size: parseFloat(getComputedStyle(el).fontSize) };
    }, LONG);
  const ws = await geometry();
  expect(ws.found, "the long name is drawn").toBe(true);
  expect(ws.cut, "the name whole: no ellipsis").toBe(false);
  expect(ws.lines, "on a second line").toBeGreaterThanOrEqual(2);
  expect(ws.textLeft, "its text inside its box").toBeGreaterThanOrEqual(ws.left - 0.5);
  expect(ws.textRight, "its text inside its box").toBeLessThanOrEqual(ws.right + 0.5);
  expect(Math.abs(ws.iconTop - ws.top), "the icon level with its first line").toBeLessThanOrEqual(1);
  expect(Math.abs(ws.rankTop - ws.top), "the rank level with its first line").toBeLessThanOrEqual(2);
  expect(ws.rankLeft, "the rank after it").toBeGreaterThanOrEqual(ws.right - 0.5);
  expect(ws.size, "at the 12px floor").toBeGreaterThanOrEqual(12 - 0.01);
  expect((await card.boundingBox())!.height, "the card grows by its line").toBeGreaterThan(before + 8);
  // The list still fits, its cards a page counted again for the taller card, every truncated text whole.
  await fits(page, "1366x768 expanded: a long name on a card", { workspace: true, pager: "match-pages", cards: "[data-testid=match-list]", rows: "[data-testid=match-item]" });
  // The flow (just under the gate): the card's five fixed lines, the name on one, as it was.
  await resizeTo(page, [1366, 640]);
  await expect(page.getByTestId("match-history")).not.toHaveAttribute("data-workspace", /.*/);
  await expect(name).toContainText(LONG);
  const flow = await geometry();
  expect(flow.lines, "the flow: one line").toBe(1);
  // As tall as the page's other cards with their teams: the teams' five lines set every card's height.
  const heights = await page.getByTestId("match-card").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(heights.length, "the flow's ten cards").toBe(10);
  expect((await card.boundingBox())!.height, "the flow: the card no taller than the others").toBeLessThanOrEqual(Math.max(...heights.slice(1)) + 0.5);
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

/** A server-paged list's page as a walk settles on it: its page and size, its cards' places on the whole list, each card's height, and the session headers it draws. */
interface ServerPage {
  page: number;
  per: number;
  places: number[];
  heights: number[];
  headers: number;
}

/** Walks a server-paged list by Next to its last page, each page read once its size has settled (the budget written and the page of that size arrived). */
async function walkServerPages(page: Page, name: string, nextTestId: string, row: string): Promise<ServerPage[]> {
  const out: ServerPage[] = [];
  for (let n = 0; n < 80; n++) {
    await settled(page);
    const r = (await region(page, name))!;
    const drawn = await page.evaluate((sel) => [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getBoundingClientRect().height > 0).map((el) => ({ at: Number(el.getAttribute("aria-posinset")), height: el.getBoundingClientRect().height })), row);
    const headers = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-testid=session-header]")].filter((el) => el.getBoundingClientRect().height > 0).length);
    out.push({ page: r.page, per: r.per, places: drawn.map((d) => d.at), heights: drawn.map((d) => Math.round(d.height)), headers });
    const next = page.getByTestId(nextTestId);
    if (!(await next.count()) || (await next.isDisabled())) break;
    await next.click();
    await expect.poll(async () => (await cards(page, row))[0], { message: "the next page drawn" }).not.toBe(drawn[0]?.at);
  }
  return out;
}

/**
 * Turning the pages never skips a record, and shows one twice only where the count changed (docs/RESPONSIVE.md, "One-screen desktop
 * pages", server-paged lists; lib/list-per.test.ts proves the rule on any walk): every place on a page of the walk, each page's places
 * a run from the first; a page at the size of the one before follows on from it exactly; a page whose size changed (counted again on
 * the page Next drew) starts at the page, at its new size, holding that drawn page's first card (budgetPageOf), so it shows again the
 * page before's last cards, fewer than its own size. Returns where the size changed and how many cards that page repeats.
 */
function expectTurnsNeverSkip(walk: ServerPage[], total: number, at: string): Array<{ page: number; from: number; to: number; repeats: number }> {
  const changes: Array<{ page: number; from: number; to: number; repeats: number }> = [];
  for (const [i, p] of walk.entries()) {
    const first = p.places[0]!;
    expect(p.places, `${at}: page ${i + 1}'s places, a run from its first`).toEqual(Array.from({ length: Math.min(p.per, total - first + 1) }, (_, k) => first + k));
    if (i === 0) {
      expect(first, `${at}: the walk starts at the first record`).toBe(1);
      continue;
    }
    const before = walk[i - 1]!;
    // The first card of the page Next drew (0-based): the one after the page before's last.
    const drawnFirst = before.places[0]! - 1 + before.per;
    if (p.per === before.per) {
      expect(first - 1, `${at}: page ${i + 1} follows on from page ${i} (${p.per} a page)`).toBe(drawnFirst);
      expect(p.page, `${at}: page ${i + 1}'s number`).toBe(before.page + 1);
      continue;
    }
    const start = Math.floor(drawnFirst / p.per) * p.per;
    expect(first - 1, `${at}: page ${i + 1}, ${before.per} a page then ${p.per}: the page holding the first card Next drew`).toBe(start);
    expect(p.page, `${at}: page ${i + 1}'s number at ${p.per} a page`).toBe(start / p.per + 1);
    expect(drawnFirst - start, `${at}: page ${i + 1} repeats fewer cards than it holds`).toBeLessThan(p.per);
    changes.push({ page: i + 1, from: before.per, to: p.per, repeats: drawnFirst - start });
  }
  expect(new Set(walk.flatMap((p) => p.places)).size, `${at}: every record on a page of the walk`).toBe(total);
  return changes;
}

test("turning the pages of a server-paged list whose pages differ in height never skips a game: Match History's sessions, with their headers, and Team Matches, its cards as tall as their members; a game shows twice only where the count changed", async ({ page }) => {
  test.setTimeout(300_000);
  // CI's wider text, as the platform spec measures: the counts below are the ones it draws.
  await withWideText(page);
  const id = await demoPlayerId(page);
  const changes: Array<{ at: string; page: number; from: number; to: number; repeats: number }> = [];
  // The sessions: a header before each session and again on a page that starts inside one. At 1648 × 900 and 1536 × 864 the first page
  // holds 4 cards and the second, drawn at 4, holds 3 (two headers): it is counted again, and the page holding its first card at 3 a page
  // starts a card earlier. At the floor every page holds 2.
  for (const [size, side] of [
    [[1648, 900], "expanded"],
    [[1536, 864], "collapsed"],
    [FLOOR, "expanded"],
  ] as Array<[Size, Side]>) {
    await page.context().clearCookies();
    await openAt(page, `${MH(id)}?group=sessions`, size, side);
    const at = `${cfg(size, side)} sessions`;
    const total = (await region(page, "games"))!.total;
    const walk = await walkServerPages(page, "games", "match-next", "[data-testid=match-item]");
    changes.push(...expectTurnsNeverSkip(walk, total, at).map((c) => ({ at, ...c })));
    // The pages differ in height by their headers: a page that starts inside a session draws its header again, and one that holds a
    // session's end draws the next one's too (the demo's sessions are 3 games each, so 4 cards from the 5th take two).
    expect(walk.some((p) => p.headers > 1) || walk.some((p, i) => i > 0 && p.per !== walk[i - 1]!.per), `${at}: a page with two headers, or a count that changed for one`).toBe(true);
    expect(walk.every((p) => p.headers >= 1), `${at}: every page under its session's header`).toBe(true);
  }
  // Team Matches: its cards are 110–250px with their members; the count holds across the walk at these sizes.
  for (const size of [
    [1366, 768],
    [1440, 900],
    FLOOR,
  ] as Size[]) {
    await page.context().clearCookies();
    await openAt(page, "/matches", size, "expanded");
    const at = `${cfg(size, "expanded")} Team Matches`;
    const total = (await region(page, "together"))!.total;
    const walk = await walkServerPages(page, "together", "together-next", "[data-testid=together-list] > li");
    expect(walk.length, `${at}: more than one page`).toBeGreaterThan(1);
    const heights = walk.flatMap((p) => p.heights);
    expect(Math.max(...heights) - Math.min(...heights), `${at}: cards of different heights (${Math.min(...heights)}–${Math.max(...heights)}px)`).toBeGreaterThan(8);
    changes.push(...expectTurnsNeverSkip(walk, total, at).map((c) => ({ at, ...c })));
  }
  // The count changed on the way somewhere (so the repeat above was walked), and only where the sessions' headers grew a page.
  expect(changes.length, "a walk whose count changed").toBeGreaterThan(0);
  for (const c of changes) expect(c.at, "a change of count only on the sessions").toMatch(/sessions$/);
  test.info().annotations.push({ type: "changes", description: JSON.stringify(changes) });
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

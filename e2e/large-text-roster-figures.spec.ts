import { expect, test, type Page } from "./test";
import { playerEntry } from "./players";

/*
  The Players roster and a profile's season figures at large text sizes on phones: the root's font
  size from 125% to 200%, as a browser's text-size setting scales every rem (both follow their own
  width in rem, so a 320px phone's roster row is 16.4rem at 100% and 6.4rem at 200%, the season's
  card 17.9rem and 7.9rem). What the reader sees: every word whole (a word's own range on one
  line, so names and ranks wrap only between their words), nothing cut by a clipping box, nothing
  past its row or its cell, and no sideways scroll. Before, a roster row's text kept 3.3rem beside
  the picture at 200% on a 320px phone ("Emerald" over three lines, "Halfway" and "No Riot account"
  broken), and the season's card kept three figures across: the games' "champions" ran 21px past
  the card at 150% on a 320px phone (63px at 200%). At 100% nothing changes: the picture beside
  the name, the figures three across.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Phone widths and text sizes, either side of the roster's stacked rows (9.625rem of row) and the card's two and one across (17.5 and 11.75rem). */
const SIZES = [
  [320, 125],
  [320, 150],
  [320, 175],
  [320, 200],
  [360, 175],
  [360, 200],
  [375, 125],
  [375, 150],
  [375, 175],
  [375, 200],
  [393, 125],
  [393, 175],
  [393, 200],
  [414, 200],
] as const;

/**
 * The demo's own players' rows: their names are known to fit a narrow row whole. Members other
 * specs add (a username like "Viewer" and five letters, one word of eleven) may need a break inside
 * their one word at 200%, which is allowed where a word is wider than the whole line.
 */
const DEMO_ROWS = '[data-testid=players-directory] [data-testid=player-card-item][data-player-name^="Demo "]';

/** The phone's width and the root's font size, once laid out. */
async function setSize(page: Page, width: number, root: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.evaluate((r) => {
    document.documentElement.style.fontSize = `${r}%`;
  }, root);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/**
 * The visible text under `selector` (never what only screen readers get): `cut`, text past the
 * nearest box that clips it sideways (an ellipsis is deliberate); `broken`, a word (a run of letters
 * or digits, so a line may still break after a slash) whose own range takes more than one line.
 */
function textFacts(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const srOnly = (e: Element) => {
      for (let p: Element | null = e; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.position === "absolute" && parseFloat(cs.width) <= 1.5 && parseFloat(cs.height) <= 1.5) return true;
      }
      return false;
    };
    const where = (e: Element) => e.closest("[data-testid]")?.getAttribute("data-testid") ?? e.tagName.toLowerCase();
    const cut: string[] = [];
    const broken: string[] = [];
    let words = 0;
    for (const root of document.querySelectorAll(sel)) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const text = n.textContent ?? "";
        const parent = n.parentElement;
        if (!text.trim() || !parent || !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || srOnly(parent)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
        if (!rects.length) continue;
        for (let p: Element | null = parent; p && p !== document.documentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (!/hidden|clip/.test(cs.overflowX)) continue;
          const box = p.getBoundingClientRect();
          const past = Math.max(Math.max(...rects.map((r) => r.right)) - (box.right - parseFloat(cs.borderRightWidth)), box.left + parseFloat(cs.borderLeftWidth) - Math.min(...rects.map((r) => r.left)));
          if (past > 1 && cs.textOverflow !== "ellipsis" && getComputedStyle(parent).textOverflow !== "ellipsis") cut.push(`${where(parent)} "${text.trim().slice(0, 24)}" ${Math.round(past)}px past ${where(p)}`);
          break;
        }
        for (const m of text.matchAll(/[\p{L}\p{N}'’]{2,}/gu)) {
          const word = document.createRange();
          word.setStart(n, m.index);
          word.setEnd(n, m.index + m[0].length);
          const lines = new Set([...word.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top))).size;
          words++;
          if (lines > 1) broken.push(`${where(parent)} "${m[0]}" on ${lines} lines`);
        }
      }
    }
    return { cut, broken, words };
  }, selector);
}

/** Each roster row's picture, name, badges, role, rank and pool portraits against the row's own edges (inside its padding), and where its picture sits against its name. */
function rosterRows(page: Page) {
  return page.getByTestId("players-directory").evaluate((panel) =>
    [...panel.querySelectorAll<HTMLElement>("[data-testid=player-card-item]")].map((row) => {
      const r = row.getBoundingClientRect();
      const cs = getComputedStyle(row);
      const inner = { left: r.left + parseFloat(cs.paddingLeft) - 0.5, right: r.right - parseFloat(cs.paddingRight) + 0.5 };
      const shown = (el: Element) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && getComputedStyle(el).display !== "none";
      };
      const parts = [...row.querySelectorAll("[data-avatar-frame], [data-testid=card-name], [data-testid=card-you], [data-testid=directory-lineup], [data-testid=setup-incomplete], [data-testid=roster-roles], [data-testid=directory-no-roles], [data-testid=rank-inline], [data-testid=pool-portrait], [data-testid=directory-pool-more], [data-testid=directory-riot]")].filter(shown);
      const outside = parts.filter((p) => p.getBoundingClientRect().left < inner.left || p.getBoundingClientRect().right > inner.right).map((p) => p.getAttribute("data-testid") ?? "picture");
      const picture = row.querySelector("[data-avatar-frame]")!.getBoundingClientRect();
      const name = row.querySelector("[data-testid=card-name]")!.getBoundingClientRect();
      return { player: row.dataset.playerName ?? "", outside, beside: picture.right <= name.left, above: picture.bottom <= name.top, rank: !!row.querySelector("[data-testid=rank-inline]") };
    }),
  );
}

test("Players at 125% to 200% text on 320 to 414px phones: names, ranks and Riot's state wrap only between words, nothing cut or past its row, no sideways scroll; at 100% the picture stays beside the name", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  test.setTimeout(120_000);
  await page.goto("/players");
  await expect(playerEntry(page).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId("players-directory").getByTestId("rank-inline").first()).toBeVisible();
  await expect(page.getByTestId("players-directory").getByText("No Riot account").first()).toBeVisible();

  // At 100% every row keeps its one layout: the picture beside the name.
  for (const width of [320, 375]) {
    await setSize(page, width, 100);
    const rows = await rosterRows(page);
    expect(rows.length, "the demo's roster").toBeGreaterThanOrEqual(9);
    expect(rows.filter((r) => !r.beside).map((r) => r.player), `${width}px at 100%: the picture beside the name`).toEqual([]);
  }

  for (const [width, root] of SIZES) {
    await setSize(page, width, root);
    const at = `${width}px at ${root}%`;
    const demo = await textFacts(page, DEMO_ROWS);
    expect(demo.words, `${at}: the demo rows' words measured`).toBeGreaterThan(40);
    expect(demo.broken, `${at}: every name, rank and state whole`).toEqual([]);
    expect((await textFacts(page, "[data-testid=players-directory] [data-testid=player-card-item]")).cut, `${at}: nothing cut on any row`).toEqual([]);
    const rows = await rosterRows(page);
    expect(rows.filter((r) => r.rank).length, `${at}: rows with a rank measured`).toBeGreaterThanOrEqual(5);
    expect(rows.filter((r) => r.outside.length).map((r) => `${r.player}: ${r.outside.join(", ")}`), `${at}: every part inside its row`).toEqual([]);
    expect(await sideways(page), `${at}: no sideways scroll`).toBeLessThanOrEqual(1);
    // The narrowest rows (200% on a 320px phone, 6.4rem): the picture takes the row's first line,
    // the text the row's whole width under it.
    if (width === 320 && root === 200) expect(rows.filter((r) => !r.above).map((r) => r.player), `${at}: the picture over the name`).toEqual([]);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
});

/**
 * Each figure of the season's card against its cell: `outside`, text past the cell's content box
 * (its padding is the room between it and the next figure or the card's edge; the ⓘ's mark may
 * hang into it); `underTip`, a label whose text runs under its ⓘ.
 */
function figureCells(page: Page) {
  return page.getByTestId("season-figures").evaluate((card) => {
    const cells = [...card.querySelectorAll<HTMLElement>("[data-testid=season-headline] > div, [data-testid=season-supporting] > div, [data-testid=multikill-tiles] > *")];
    const outside: string[] = [];
    const underTip: string[] = [];
    for (const cell of cells) {
      const b = cell.getBoundingClientRect();
      const cs = getComputedStyle(cell);
      const left = b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
      const right = b.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
      const name = cell.getAttribute("data-testid") ?? "by-champion";
      const walk = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const parent = n.parentElement;
        if (!n.textContent?.trim() || !parent || parent.closest("button") || !parent.checkVisibility({ checkVisibilityCSS: true })) continue;
        let srOnly = false;
        for (let p: Element | null = parent; p && p !== cell; p = p.parentElement) if (getComputedStyle(p).position === "absolute" && p.getBoundingClientRect().width <= 1.5) srOnly = true;
        if (srOnly) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
          if (r.width <= 0.5) continue;
          const past = Math.max(r.right - right, left - r.left);
          if (past > 0.5) outside.push(`${name} "${n.textContent.trim().slice(0, 18)}" ${Math.round(past)}px`);
        }
      }
      const label = cell.querySelector(":scope > div:first-child > span:first-child");
      const tip = cell.querySelector(":scope > div:first-child [data-testid=info-tip] > span");
      if (label && tip) {
        const range = document.createRange();
        range.selectNodeContents(label);
        const end = Math.max(...[...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => r.right));
        if (end > tip.getBoundingClientRect().left + 0.5) underTip.push(`${name} ${Math.round(end - tip.getBoundingClientRect().left)}px`);
      }
    }
    return { cells: cells.length, outside, underTip };
  });
}

/** The tops of a band's figures: one row for three across, more for fewer. */
const bandRows = (page: Page, testId: string) => page.getByTestId(testId).evaluate((band) => new Set([...band.children].map((c) => Math.round(c.getBoundingClientRect().top))).size);

test("a profile's season figures at 125% to 200% text on 320 to 414px phones: every figure holds its label, number and context, words whole, nothing cut, no sideways scroll; at 100% three across", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  test.setTimeout(120_000);
  await page.goto("/players");
  await playerEntry(page, "Demo Top").click();
  await expect(page.getByTestId("season-figures")).toBeVisible();
  await expect(page.getByTestId("multikill-tiles")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByTestId("stat-games")).toContainText("champion");

  // At 100% the card keeps its phone layout: three figures across, the kills three by two.
  for (const width of [320, 375]) {
    await setSize(page, width, 100);
    expect(await bandRows(page, "season-headline"), `${width}px at 100%: win rate, KDA and games on one row`).toBe(1);
    expect(await bandRows(page, "season-supporting"), `${width}px at 100%: CS/min, damage/min and vision on one row`).toBe(1);
    expect(await bandRows(page, "multikill-tiles"), `${width}px at 100%: the kills three by two`).toBe(2);
    const cells = await figureCells(page);
    expect(cells.outside, `${width}px at 100%: every figure inside its cell`).toEqual([]);
  }

  for (const [width, root] of SIZES) {
    await setSize(page, width, root);
    const at = `${width}px at ${root}%`;
    const facts = await textFacts(page, "[data-testid=season-figures]");
    expect(facts.words, `${at}: the card's words measured`).toBeGreaterThan(30);
    expect(facts.cut, `${at}: nothing cut by the card`).toEqual([]);
    expect(facts.broken, `${at}: every word whole`).toEqual([]);
    const cells = await figureCells(page);
    expect(cells.cells, `${at}: the twelve cells (six figures, five counts and the link)`).toBe(12);
    expect(cells.outside, `${at}: every figure inside its cell`).toEqual([]);
    expect(cells.underTip, `${at}: no label under its ⓘ`).toEqual([]);
    expect(await sideways(page), `${at}: no sideways scroll`).toBeLessThanOrEqual(1);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
});

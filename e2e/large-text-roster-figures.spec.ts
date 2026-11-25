import { openStudioFromHeader, previewFrame } from "./studio";
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
  the card at 150% on a 320px phone (63px at 200%). No "·" starts or ends a line: the one before
  the rank (or "No Riot account") shows beside the role and is cut off with its room where the rank
  wraps under the role ("· Emerald III" started a line at 200% on a 320px phone). At 100% nothing
  changes: the picture beside the name, the figures three across, every "·" beside its role, and
  the Card Studio's previews of a row (narrower at 100% beside the controls on a 320 × 480 screen
  than any row on Players) as they were.
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

// Against the layout viewport's width: a phone's (isMobile) window grows with what spills past it, so innerWidth would hide it.
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

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
        // The roster's "·" before the rank is cut off on purpose where the rank starts a line (rosterDots checks it).
        const separator = text.trim() === "·" && !!parent.closest("[data-testid=roster-meta]");
        for (let p: Element | null = separator ? null : parent; p && p !== document.documentElement; p = p.parentElement) {
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

/**
 * Each "·" on the roster's second lines (before the rank or "No Riot account"). Shown, it has a part
 * of its line on either side (the role's icon or "Roles not set" before it, the crest or the words
 * after it); where the rank starts a line it is cut off whole past the line's clipped left edge, the
 * crest or the words starting at that edge. Either way no "·" starts or ends a line.
 */
function rosterDots(page: Page) {
  return page.getByTestId("players-directory").evaluate((panel) => {
    const problems: string[] = [];
    let shown = 0;
    let cutOff = 0;
    const srOnly = (e: Element) => {
      for (let p: Element | null = e; p && p !== panel; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.position === "absolute" && parseFloat(cs.width) <= 1.5 && parseFloat(cs.height) <= 1.5) return true;
      }
      return false;
    };
    for (const meta of panel.querySelectorAll<HTMLElement>("[data-testid=roster-meta]")) {
      const who = meta.closest("[data-player-name]")?.getAttribute("data-player-name") ?? "a row";
      const edge = meta.getBoundingClientRect().left;
      const clips = /clip|hidden/.test(getComputedStyle(meta).overflowX);
      const parts: DOMRect[] = [];
      const dots: { box: DOMRect; el: Element }[] = [];
      const walk = document.createTreeWalker(meta, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const parent = n.parentElement;
        const text = n.textContent ?? "";
        if (!parent || !text.trim() || !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || srOnly(parent)) continue;
        for (let k = 0; k < text.length; k++) {
          if (!text[k]!.trim()) continue;
          const range = document.createRange();
          range.setStart(n, k);
          range.setEnd(n, k + 1);
          const box = [...range.getClientRects()].find((b) => b.width > 0.1);
          if (!box) continue;
          if (text[k] === "·") dots.push({ box, el: parent });
          else parts.push(box);
        }
      }
      for (const el of meta.querySelectorAll("[data-role-icon], [data-testid=rank-emblem], img")) {
        const box = el.getBoundingClientRect();
        if (box.width > 1 && !srOnly(el)) parts.push(box);
      }
      for (const { box: d, el } of dots) {
        if (d.right <= edge + 0.5) {
          if (!clips) {
            problems.push(`${who}: a "·" drawn past its line's edge`);
            continue;
          }
          // Cut off: the rank (its crest, or the words) starts the line at its edge.
          cutOff++;
          const next = el.nextElementSibling?.getBoundingClientRect();
          if (!next || Math.abs(next.left - edge) > 1) problems.push(`${who}: a "·" cut off where the rank does not start its line`);
          continue;
        }
        if (d.left < edge - 0.5) {
          problems.push(`${who}: a "·" partly cut`);
          continue;
        }
        shown++;
        const line = (b: DOMRect) => Math.abs(b.top + b.height / 2 - (d.top + d.height / 2)) < Math.max(b.height, d.height) / 2;
        if (!parts.some((b) => line(b) && b.right <= d.left + 0.5)) problems.push(`${who}: a "·" starts a line`);
        if (!parts.some((b) => line(b) && b.left >= d.right - 0.5)) problems.push(`${who}: a "·" ends a line`);
      }
    }
    return { problems, shown, cutOff };
  });
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

  // At 100% every row keeps its one layout: the picture beside the name, every "·" beside its role.
  for (const width of [320, 375]) {
    await setSize(page, width, 100);
    const rows = await rosterRows(page);
    expect(rows.length, "the demo's roster").toBeGreaterThanOrEqual(9);
    expect(rows.filter((r) => !r.beside).map((r) => r.player), `${width}px at 100%: the picture beside the name`).toEqual([]);
    const dots = await rosterDots(page);
    expect(dots.problems, `${width}px at 100%: no "·" starting or ending a line`).toEqual([]);
    expect({ shown: dots.shown >= 9, cutOff: dots.cutOff }, `${width}px at 100%: every row's "·" beside its role`).toEqual({ shown: true, cutOff: 0 });
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
    const dots = await rosterDots(page);
    expect(dots.problems, `${at}: no "·" starting or ending a line`).toEqual([]);
    expect(dots.shown + dots.cutOff, `${at}: the rows' "·" measured`).toBeGreaterThanOrEqual(9);
    // The narrowest rows (200% on a 320px phone, 6.4rem): the picture takes the row's first line,
    // the text the row's whole width under it, and the ranks that no longer fit beside the role go
    // under it without their "·" (Demo ADC's "Emerald III", "No Riot account").
    if (width === 320 && root === 200) {
      expect(rows.filter((r) => !r.above).map((r) => r.player), `${at}: the picture over the name`).toEqual([]);
      expect(dots.cutOff, `${at}: ranks under the role, their "·" cut off`).toBeGreaterThan(0);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
});

test("Card Studio's preview of a Players row is laid out as the row on Players, even beside the controls on a 320 × 480 screen", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "phone", "a phone's window 480px tall, set below");
  // A screen 480px tall puts the preview beside the controls, in a pane two fifths of the screen
  // wide. Until Release 17 the preview drew the row in that pane, about 9rem wide, outside the roster,
  // so the roster's larger-text rules (STACKED, SEPARATOR in roster-row.tsx) could not apply. The
  // preview is now the row in Players' own panel, in a frame as wide as a phone (390 × 844 where this
  // window is not one held upright), scaled to fit: laid out exactly as on Players at that width.
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/players");
  await playerEntry(page, "Demo Top").click();
  await expect(page.getByTestId("profile-header")).toBeVisible();
  await openStudioFromHeader(page);
  await page.getByTestId("preview-context").selectOption("players");
  await page.getByTestId("preview-mobile").click();
  await expect(page.getByTestId("card-preview")).toHaveAttribute("data-context", "players");
  const facts = (li: Element) => {
    const rem = parseFloat(getComputedStyle(li.ownerDocument.documentElement).fontSize);
    const cs = getComputedStyle(li);
    const meta = li.querySelector("[data-testid=roster-meta]")!;
    return {
      width: Math.round(li.getBoundingClientRect().width),
      narrow: (li.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / rem < 16,
      clip: getComputedStyle(meta).overflowX,
      room: getComputedStyle(meta.querySelector("[data-testid=roster-roles]")!).marginRight,
      wrap: cs.flexWrap,
    };
  };
  const row = previewFrame(page).getByTestId("roster-row-preview");
  await expect(row).toBeVisible();
  const preview = await row.evaluate(facts);
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await page.context().storageState() });
  const real = await phone.newPage();
  await real.goto("/players");
  const entry = real.locator("main [data-testid=player-card-item]").filter({ has: real.locator("[data-player-name='Demo Top']") }).first();
  await expect(entry).toBeVisible();
  expect(preview, "the preview's row and the page's, at 390px").toEqual(await entry.evaluate(facts));
  await phone.close();
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

  // At 100% the card keeps its phone layout: three figures across, the kills on one line or two.
  for (const width of [320, 375]) {
    await setSize(page, width, 100);
    expect(await bandRows(page, "season-headline"), `${width}px at 100%: win rate, KDA and games on one row`).toBe(1);
    expect(await bandRows(page, "season-supporting"), `${width}px at 100%: CS/min, damage/min and vision on one row`).toBe(1);
    expect(await page.getByTestId("multikill-tiles").locator("dl").evaluate((dl) => new Set([...dl.children].map((c) => Math.round(c.getBoundingClientRect().top))).size), `${width}px at 100%: the kills on two lines at most`).toBeLessThanOrEqual(2);
    const cells = await figureCells(page);
    expect(cells.outside, `${width}px at 100%: every figure inside its cell`).toEqual([]);
  }

  for (const [width, root] of SIZES) {
    await setSize(page, width, root);
    const at = `${width}px at ${root}%`;
    const facts = await textFacts(page, "[data-testid=season-figures]");
    expect(facts.words, `${at}: the card's words measured`).toBeGreaterThan(20);
    expect(facts.cut, `${at}: nothing cut by the card`).toEqual([]);
    expect(facts.broken, `${at}: every word whole`).toEqual([]);
    const cells = await figureCells(page);
    expect(cells.cells, `${at}: the eight cells (six figures, the kills line and its link)`).toBe(8);
    expect(cells.outside, `${at}: every figure inside its cell`).toEqual([]);
    expect(cells.underTip, `${at}: no label under its ⓘ`).toEqual([]);
    expect(await sideways(page), `${at}: no sideways scroll`).toBeLessThanOrEqual(1);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
});

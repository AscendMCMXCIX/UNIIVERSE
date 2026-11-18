import { expect, test, type Page } from "./test";

/*
  Team Leaderboards at large text sizes on phones: the root's font size from 125% to 200%, as a
  browser's text-size setting scales every rem (the boards' layouts follow their own width in rem,
  so a 320px phone's Recent form board is 17.9rem at 100% and 7.9rem at 200%). What the reader
  sees: every word whole (a word's own range on one line, so names wrap only between their words),
  nothing cut by a clipping box, no text running into other text or a picture, and no sideways
  scroll. Recent form's rows reflow where a name cannot sit beside its figures (the win rate under
  the name, then the name under the place and picture); before, the name kept a few letters a line
  (one at 200%) and the gap ("1 win behind") ran 32px past the board. At 100% nothing changes.
  Records' boards already reflow on their own; a record's qualifier there hides its "·" only when
  it starts a line of its own (the title's clipped edge), never beside its record.
*/

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
});

/** Phone widths and text sizes: either side of each of the board's large-text tiers (17.5, 16.5 and 13.5rem). */
const SIZES = [
  [320, 125],
  [320, 150],
  [320, 175],
  [320, 200],
  [360, 125],
  [360, 150],
  [375, 125],
  [375, 150],
  [375, 175],
  [375, 200],
  [393, 150],
  [393, 200],
] as const;

async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("leaderboards")).toHaveAttribute("data-ready", "true");
  await page.evaluate(() => document.fonts.ready);
}

/** The phone's width and the root's font size, once laid out. */
async function setSize(page: Page, width: number, root: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.evaluate((r) => { document.documentElement.style.fontSize = `${r}%`; }, root);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/**
 * The visible text under `selector` (never what only screen readers get): `cut`, text past the
 * nearest box that clips it sideways (an ellipsis is deliberate; so is the separator of a Records
 * qualifier, checked on its own); `broken`, a word (a run of letters or digits, so a line may still
 * break after a hyphen or a slash) whose own range takes more than one line.
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
        const separator = text.trim() === "·" && !!parent.closest("[data-testid=record-qualifier]");
        for (let p: Element | null = parent; p && p !== document.documentElement && !separator; p = p.parentElement) {
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

test("Recent form at 125% to 200% text on 320 to 393px phones: names wrap only between words, nothing cut or overlapping, no sideways scroll; at 100% the win rate stays beside the name", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  test.setTimeout(120_000);
  await open(page, "/leaderboards");
  await expect(page.getByTestId("form-row").first()).toBeVisible();
  const rows = await page.getByTestId("form-row").count();
  expect(rows, "the demo's ranked rows").toBeGreaterThanOrEqual(7);
  await expect(page.getByTestId("form-not-enough-member")).not.toHaveCount(0);

  // At 100% the board keeps its narrow layout: on every row the win rate beside the name, to its right.
  for (const width of [320, 375]) {
    await setSize(page, width, 100);
    const beside = await page.getByTestId("form-row").evaluateAll((els) =>
      els.map((row) => {
        const name = row.querySelector("[data-testid=card-name]")!.getBoundingClientRect();
        const rate = row.querySelector("[data-testid=form-win-rate]")!.getBoundingClientRect();
        return rate.left >= name.right - 1 && rate.top < name.bottom && rate.bottom > name.top;
      }),
    );
    expect(beside, `${width}px at 100%: each win rate beside its name`).toEqual(beside.map(() => true));
  }

  for (const [width, root] of SIZES) {
    await setSize(page, width, root);
    const at = `${width}px at ${root}%`;
    expect.soft(await sideways(page), `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
    const text = await textFacts(page, "[data-testid=form]");
    expect.soft(text.words, `${at}: the board's words measured`).toBeGreaterThan(100);
    expect.soft(text.cut, `${at}: nothing cut`).toEqual([]);
    expect.soft(text.broken, `${at}: every word whole`).toEqual([]);
    // In each row (ranked or without enough games) no text runs into other text or the picture.
    const overlaps = await page.locator("[data-testid=form-row], [data-testid=form-not-enough-member]").evaluateAll((els) =>
      els.flatMap((row, i) => {
        const srOnly = (e: Element) => {
          for (let p: Element | null = e; p && p !== row; p = p.parentElement) {
            const cs = getComputedStyle(p);
            if (cs.position === "absolute" && parseFloat(cs.width) <= 1.5 && parseFloat(cs.height) <= 1.5) return true;
          }
          return false;
        };
        const boxes: { owner: number; what: string; r: DOMRect }[] = [];
        row.querySelectorAll("[data-avatar-frame]").forEach((a) => boxes.push({ owner: -1, what: "picture", r: a.getBoundingClientRect() }));
        const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
        let owner = 0;
        for (let n = walk.nextNode(); n; n = walk.nextNode(), owner++) {
          const parent = n.parentElement;
          // The picture's own initial is the picture.
          if (!n.textContent?.trim() || !parent || parent.closest("[data-avatar-frame]") || !parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || srOnly(parent)) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5) boxes.push({ owner, what: `"${n.textContent.trim().slice(0, 16)}"`, r });
        }
        const hits: string[] = [];
        for (let a = 0; a < boxes.length; a++)
          for (let b = a + 1; b < boxes.length; b++) {
            const [x, y] = [boxes[a]!, boxes[b]!];
            if (x.owner === y.owner) continue;
            if (x.r.left < y.r.right - 1 && y.r.left < x.r.right - 1 && x.r.top < y.r.bottom - 1 && y.r.top < x.r.bottom - 1) hits.push(`row ${i + 1}: ${x.what} over ${y.what}`);
          }
        return hits;
      }),
    );
    expect.soft(overlaps, `${at}: no text over other text or a picture`).toEqual([]);
    // A row's second line never ends with a "·": the record and the dates share a line or take one each.
    const dangling = await page.getByTestId("form-meta").evaluateAll((metas) =>
      metas.filter((meta) => {
        const parts = [...meta.children].map((c) => ({ dot: c.textContent?.trim() === "·", box: c.getBoundingClientRect() })).filter((p) => p.box.width > 0);
        const mid = (b: DOMRect) => b.top + b.height / 2;
        return parts.some((p, k) => p.dot && !(parts[k + 1] && Math.abs(mid(parts[k + 1]!.box) - mid(p.box)) <= 4));
      }).length,
    );
    expect.soft(dangling, `${at}: second lines ending with ·`).toBe(0);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

test("Records at 125% to 200% text on 320 to 393px phones: words whole, nothing cut but the separator of a qualifier on a line of its own, no sideways scroll", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  test.setTimeout(120_000);
  await open(page, "/leaderboards?view=records");
  await expect(page.getByTestId("season-record").first()).toBeVisible();
  await expect(page.getByTestId("record-qualifier")).not.toHaveCount(0);
  for (const [width, root] of [[320, 100], [375, 100], ...SIZES] as const) {
    await setSize(page, width, root);
    const at = `${width}px at ${root}%`;
    expect.soft(await sideways(page), `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
    const text = await textFacts(page, "[data-testid=records-book], [data-testid=records-multikills], [data-testid=records-milestones]");
    expect.soft(text.words, `${at}: the boards' words measured`).toBeGreaterThan(100);
    expect.soft(text.cut, `${at}: nothing cut`).toEqual([]);
    expect.soft(text.broken, `${at}: every word whole`).toEqual([]);
    // The qualifier's "·" shows beside its record, inside the title; it is hidden past the title's
    // clipped edge only when the qualifier starts a line of its own, so no line starts with it.
    const separators = await page.getByTestId("record-title").evaluateAll((titles) =>
      titles.flatMap((title) => {
        const qualifier = title.querySelector("[data-testid=record-qualifier]");
        if (!qualifier) return [];
        const lineBoxes = (n: Node) => {
          const r = document.createRange();
          r.selectNodeContents(n);
          return [...r.getClientRects()].filter((b) => b.width > 0.5);
        };
        const label = lineBoxes(title.querySelector("[data-testid=record-label]")!).at(-1)!;
        const own = [...qualifier.childNodes].filter((c) => c.nodeType === Node.TEXT_NODE && c.textContent!.trim()).at(-1)!;
        const first = lineBoxes(own)[0]!;
        const besideRecord = first.top < label.bottom - 1 && first.bottom > label.top + 1;
        const dot = lineBoxes(qualifier.querySelector("[aria-hidden]")!)[0]!;
        const box = title.getBoundingClientRect();
        const shown = dot.left >= box.left - 0.5 && dot.right <= box.right + 0.5;
        return shown === besideRecord ? [] : [`${title.closest("[data-record]")?.getAttribute("data-record")}: qualifier ${besideRecord ? "beside its record, its · cut" : "on its own line, its · shown"}`];
      }),
    );
    expect.soft(separators, `${at}: each qualifier's · shown beside its record, hidden only on a line of its own`).toEqual([]);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

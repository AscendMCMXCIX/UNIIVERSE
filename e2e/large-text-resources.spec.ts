import { expect, test, type Page } from "./test";

/*
  RESOURCES → Library at a larger text size on phones (the in-memory demo library). A row is the
  site's tile, its title with the host and ↗ beside it, the description under them, and the star.
  The tile, the host's room and the star take 10.5rem of a row, and a 320px phone's row is 11.3rem
  at 150% text and 7.9rem at 200%: the title was left nothing (a letter a line, from 150% on a 320px
  phone and 175% on a 375px one) and at 200% a description ran 47px past the panel, cut. Under a
  16rem list the tile and the star take a line of their own over the title and the description,
  which have the row's width (ResourceRow in resources-view.tsx). The usual size is untouched.
*/

test.beforeEach(async ({ context, baseURL, page }, info) => {
  test.skip(info.project.name !== "phone", "phone widths, set below");
  await context.addCookies([{ name: "uniiverse_view", value: "player", url: baseURL! }]);
  // The Library's rows ask each site for its icon; a test asks none (resources.spec.ts).
  await page.route(/\/favicon\.ico$/, (route) => route.abort());
});

/**
 * What the Library's rows show: text cut by a box that clips it (not the host, cut short with an
 * ellipsis on purpose), words split over two lines or more (each word's own range, one line box
 * each), the page's sideways scroll, and each row's parts: its star's target and whether it lies
 * over any of the row's text, ↗ drawn inside the row, and where the tile, title and link sit.
 */
const facts = (page: Page) =>
  page.getByTestId("resources-list").evaluate((list) => {
    // Screen-reader text ("(opens in a new tab)") is laid over the page, 1px, never seen.
    const srOnly = (el: Element) => {
      for (let p: Element | null = el; p && p !== list; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.position === "absolute" && parseFloat(cs.width) <= 1.5 && parseFloat(cs.height) <= 1.5) return true;
      }
      return false;
    };
    // A text's line boxes, but for the host, which ends in an ellipsis inside its own box: what shows
    // of it is that box (its range runs on under the star, hidden).
    const ellipsis = (n: Node) => getComputedStyle(n.parentElement!).textOverflow === "ellipsis";
    const shownBoxes = (n: Node) => {
      if (ellipsis(n)) return [n.parentElement!.getBoundingClientRect()];
      const range = document.createRange();
      range.selectNodeContents(n);
      return [...range.getClientRects()].filter((b) => b.width > 0.5 && b.height > 0.5);
    };
    const textBoxes = (root: Element) => {
      const boxes: DOMRect[] = [];
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent?.trim() && !srOnly(n.parentElement!)) boxes.push(...shownBoxes(n));
      return boxes;
    };
    const cut: string[] = [];
    const split: string[] = [];
    const walk = document.createTreeWalker(list, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const text = n.textContent ?? "";
      const parent = n.parentElement!;
      if (!text.trim() || srOnly(parent)) continue;
      const shown = shownBoxes(n);
      if (!shown.length) continue;
      const left = Math.min(...shown.map((b) => b.left));
      const right = Math.max(...shown.map((b) => b.right));
      // The nearest box that clips sideways (on a phone, the list's one panel).
      if (!ellipsis(n)) {
        for (let p: Element | null = parent; p && p !== document.documentElement; p = p.parentElement) {
          const cs = getComputedStyle(p);
          if (!/hidden|clip/.test(cs.overflowX)) continue;
          const b = p.getBoundingClientRect();
          const past = Math.max(right - (b.right - parseFloat(cs.borderRightWidth)), b.left + parseFloat(cs.borderLeftWidth) - left);
          if (past > 1) cut.push(`"${text.trim().slice(0, 30)}" ${Math.round(past)}px past its box`);
          break;
        }
      }
      if (right > innerWidth + 0.5 || left < -0.5) cut.push(`"${text.trim().slice(0, 30)}" past the screen`);
      for (const m of text.matchAll(/\S+/g)) {
        const word = document.createRange();
        word.setStart(n, m.index!);
        word.setEnd(n, m.index! + m[0].length);
        const lines = new Set([...word.getClientRects()].filter((b) => b.width > 0.5).map((b) => Math.round(b.top))).size;
        if (lines > 1) split.push(`"${m[0]}" over ${lines} lines`);
      }
    }
    const rows = [...list.querySelectorAll("[data-testid=resource]")].map((row) => {
      const box = (sel: string) => row.querySelector(sel)!.getBoundingClientRect();
      const star = box("[data-testid=resource-favourite]");
      const link = box("[data-testid=resource-link]");
      const tile = (row.querySelector("[data-testid=resource-link]")!.firstElementChild as Element).getBoundingClientRect();
      const title = box("[data-testid=resource-title]");
      const arrow = (row.querySelector("[data-testid=resource-host]")!.lastElementChild as Element).getBoundingClientRect();
      const edge = row.getBoundingClientRect();
      const overText = textBoxes(row.querySelector("[data-testid=resource-link]")!).some(
        (b) => Math.min(b.right, star.right) - Math.max(b.left, star.left) > 0.5 && Math.min(b.bottom, star.bottom) - Math.max(b.top, star.top) > 0.5,
      );
      return {
        title: row.querySelector("[data-testid=resource-title]")!.textContent!.trim(),
        star: { width: star.width, height: star.height, inside: star.left >= edge.left - 0.5 && star.right <= edge.right + 0.5 && star.top >= edge.top - 0.5 && star.bottom <= edge.bottom + 0.5, overText },
        arrow: arrow.width > 0 && arrow.left >= edge.left - 0.5 && arrow.right <= edge.right + 0.5,
        // The usual row: the tile beside the title, the star beside the row's link.
        tileBesideTitle: tile.right <= title.left + 0.5,
        starBesideLink: star.left >= link.right - 0.5,
      };
    });
    return { cut, split: [...new Set(split)], overflow: document.documentElement.scrollWidth - innerWidth, rows };
  });

test("at 125% to 200% text on 320, 375 and 393px phones, the Library's titles and descriptions are whole (no word split, nothing cut), the page no wider than the phone, the star's target clear of the text; the usual size unchanged", async ({ page }) => {
  await page.goto("/resources");
  await expect(page.getByTestId("resource").first()).toBeVisible();
  const total = await page.getByTestId("resource").count();
  // The usual size, on the narrowest phone too (its list is 17.9rem, the large-text layout under
  // 16rem): each row as it was, the tile beside the title and the star beside the row's link.
  for (const width of [320, 375, 393]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(async () => (await facts(page)).rows.every((r) => r.tileBesideTitle && r.starBesideLink), `${width}px at 100%: the usual row`).toBe(true);
  }
  for (const width of [320, 375, 393]) {
    await page.setViewportSize({ width, height: 800 });
    for (const root of [125, 150, 175, 200]) {
      await page.evaluate((r) => { document.documentElement.style.fontSize = `${r}%`; }, root);
      const at = `${width}px at ${root}%`;
      await expect.poll(async () => (await facts(page)).split, `${at}: every word of a title or description on one line`).toEqual([]);
      const f = await facts(page);
      expect(f.cut, `${at}: nothing cut`).toEqual([]);
      expect(f.overflow, `${at}: no sideways page scroll`).toBeLessThanOrEqual(1);
      expect(f.rows.length, `${at}: every row measured`).toBe(total);
      for (const r of f.rows) {
        expect(Math.min(r.star.width, r.star.height), `${at}, ${r.title}: the star's target at least 44px`).toBeGreaterThanOrEqual(44);
        expect(r.star.inside, `${at}, ${r.title}: the star inside its row`).toBe(true);
        expect(r.star.overText, `${at}, ${r.title}: the star over none of the row's text`).toBe(false);
        expect(r.arrow, `${at}, ${r.title}: ↗ drawn inside the row`).toBe(true);
      }
    }
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

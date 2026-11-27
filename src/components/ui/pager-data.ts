/**
 * The pager's data (the component is `Pager` in pager.tsx): which pages it offers and how it folds
 * where its line is too narrow. Match History's since Release 16; shared since 27 Nov 2026 with All
 * Champions' one-screen workspace (match-history/pager.ts re-exports it).
 */

/** Numbered pages with the ends and the neighbourhood of the current page; gaps shown as "…". */
export function pageList(page: number, pages: number): Array<number | "gap"> {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: Array<number | "gap"> = [];
  let last = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - last > 1) out.push("gap");
    out.push(p);
    last = p;
  }
  return out;
}

/**
 * The pager's items in order. A page `folds` when it is the page either side of the current one
 * (not an end): a pager too narrow for every button on one line leaves those two to the arrows,
 * which go to the same pages, so nothing is a tap further away. Where that leaves a jump between
 * two pages that stay ("1 3"), a "…" takes its place there (`jump`).
 */
export type PagerItem = { page: number; folds: boolean; jump: boolean } | { gap: true };

export function pagerItems(page: number, pages: number): PagerItem[] {
  const list = pageList(page, pages);
  return list.map((p, i) => {
    if (p === "gap") return { gap: true } as const;
    const folds = (p === page - 1 || p === page + 1) && p !== 1 && p !== pages;
    return { page: p, folds, jump: folds && list[i - 1] !== "gap" && list[i + 1] !== "gap" };
  });
}

/**
 * The widest line a pager of `pages` pages draws (its middle page's): a pager that folds by this
 * line, and reserves its width, never changes its fold as the reader turns its pages.
 */
export function widestItems(pages: number): PagerItem[] {
  return pagerItems(Math.ceil(pages / 2), pages);
}

/**
 * The items a line draws, folded or not: folded, the pages either side of the current one give way
 * to the arrows, and where that leaves a jump between two pages that stay a "…" takes their place.
 */
export function lineItems(items: readonly PagerItem[], folded: boolean): PagerItem[] {
  if (!folded) return [...items];
  return items.flatMap((item): PagerItem[] => ("gap" in item || !item.folds ? [item] : item.jump ? [{ gap: true }] : []));
}

/** The buttons' size: 2.75rem on a touch screen (44px), 2rem with a mouse (32px, from md). */
export const TOUCH_BUTTON_REM = 2.75;
export const MOUSE_BUTTON_REM = 2;

/**
 * How wide the pager's buttons are on one line, in rem: each button (the two arrows too) `buttonRem`
 * (a touch screen's 2.75rem by default, 2rem with a mouse), each "…" 1.0625rem, and 0.25rem between them.
 */
export function pagerRem(items: readonly PagerItem[], buttonRem: number = TOUCH_BUTTON_REM): number {
  const buttons = items.filter((x) => !("gap" in x)).length + 2;
  const gaps = items.length + 2 - buttons;
  return buttons * buttonRem + gaps * 1.0625 + (items.length + 1) * 0.25;
}

/**
 * When the pager folds: below the first of these widths of its own (a container query) at or a
 * little over what its whole line needs, so a line that fits never folds. A 320px phone gives the
 * pager 18rem; a line that needs no more (up to six buttons without a "…", 17.75rem) never folds.
 * The widest line, seven buttons and two "…" (23.375rem), folds on phones narrower than about
 * 410px. Folded, a line is at most five buttons and two "…" (17.375rem), which 18rem holds.
 * Written out whole for Tailwind: `hide` on a page that folds, `show` on the "…" standing in for it.
 */
const FOLDS = [
  { below: 18, hide: "", show: "hidden" },
  { below: 19.25, hide: "@max-[19.25rem]/pages:hidden", show: "hidden @max-[19.25rem]/pages:inline" },
  { below: 21, hide: "@max-[21rem]/pages:hidden", show: "hidden @max-[21rem]/pages:inline" },
  { below: 22.25, hide: "@max-[22.25rem]/pages:hidden", show: "hidden @max-[22.25rem]/pages:inline" },
  { below: 23.5, hide: "@max-[23.5rem]/pages:hidden", show: "hidden @max-[23.5rem]/pages:inline" },
] as const;

/**
 * The same with a mouse's 2rem buttons (All Champions' workspace footers), from the same formula
 * plus 0.25rem: five pages whole (15.5rem) fit the narrowest list's rail and never fold; six or more
 * pages fold below their whole line (16.8125 and 18.125rem); folded, a line is at most five buttons
 * and two "…" (13.625rem).
 */
const FOLDS_MOUSE = [
  { below: 15.75, hide: "", show: "hidden" },
  { below: 17.0625, hide: "@max-[17.0625rem]/pages:hidden", show: "hidden @max-[17.0625rem]/pages:inline" },
  { below: 18.375, hide: "@max-[18.375rem]/pages:hidden", show: "hidden @max-[18.375rem]/pages:inline" },
] as const;

export function pagerFold(items: readonly PagerItem[], buttonRem: number = TOUCH_BUTTON_REM): { below: number; hide: string; show: string } {
  const table = buttonRem === MOUSE_BUTTON_REM ? FOLDS_MOUSE : FOLDS;
  const need = pagerRem(items, buttonRem);
  return table.find((f) => need <= f.below) ?? table[table.length - 1]!;
}

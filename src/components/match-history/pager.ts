/**
 * Match History's pager, as data: which pages it offers and how it folds on a narrow phone (the
 * component is `Pages` in match-history-view.tsx).
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
 * How wide the pager's buttons are on one line at a touch screen's size, in rem: each button (the
 * two arrows too) 2.75rem, each "…" 1.0625rem, and 0.25rem between them.
 */
export function pagerRem(items: readonly PagerItem[]): number {
  const buttons = items.filter((x) => !("gap" in x)).length + 2;
  const gaps = items.length + 2 - buttons;
  return buttons * 2.75 + gaps * 1.0625 + (items.length + 1) * 0.25;
}

/**
 * When the pager folds: below the first of these widths of its own (a container query) that its
 * whole line needs, a little over it, so a line that fits never folds. A 320px phone gives the
 * pager 18rem, which every line of six buttons or fewer fits; the widest line, seven buttons and
 * two "…" (23.375rem), folds on phones narrower than about 410px. Folded, the line is at most five
 * buttons and two "…" (17.375rem). Written out whole for Tailwind: `hide` on a page that folds,
 * `show` on the "…" that stands in for it.
 */
const FOLDS = [
  { below: 18, hide: "", show: "hidden" },
  { below: 19.25, hide: "@max-[19.25rem]/pages:hidden", show: "hidden @max-[19.25rem]/pages:inline" },
  { below: 21, hide: "@max-[21rem]/pages:hidden", show: "hidden @max-[21rem]/pages:inline" },
  { below: 22.25, hide: "@max-[22.25rem]/pages:hidden", show: "hidden @max-[22.25rem]/pages:inline" },
  { below: 23.5, hide: "@max-[23.5rem]/pages:hidden", show: "hidden @max-[23.5rem]/pages:inline" },
] as const;

export function pagerFold(items: readonly PagerItem[]): { below: number; hide: string; show: string } {
  const need = pagerRem(items);
  return FOLDS.find((f) => need <= f.below) ?? FOLDS[FOLDS.length - 1]!;
}

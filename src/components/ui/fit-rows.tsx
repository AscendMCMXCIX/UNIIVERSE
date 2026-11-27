"use client";

import * as React from "react";

/*
  Fit rows (Release 16, round 3): a list on a one-screen page that shows as many rows as fit above the
  window's bottom, the rest behind its Show all or "and N more" (Leaderboards' multikills and
  milestones, the Overview's recent champions). The server draws the conservative overview, by the
  window's height in tiers of CSS (globals.css, board-at-*), so the first paint fits the windows they
  are tuned for and rows are only added there; once the page is interactive, the list measures the room under it and
  shows more rows where they fit, at its own end (the last part of its column, so nothing under it
  moves); where even the tiers' rows run past the window (a larger team), it shows fewer, down to the
  first row, so nothing runs past it.

  Since Release 19 every fitted list keeps a guard band above the window's bottom (FIT_GUARD_REM), and
  the server's tiers draw one row fewer than fit the windows they are tuned for, so neither the first
  paint nor the fitted list ends within a few pixels of the window (CI's browser sets text a little
  wider than this container's, and two one-screen specs flipped on it in Release 18).

  The rows carry `data-ov-rank` (1-based: the order in which they are shown), a caption that heads some
  of them `data-ov-caption` (the rank of its first row). The list's element carries the mode in
  `attribute`: its CSS value ("closed" for a board, "css" for the champions), where the tiers' classes
  apply; "measure" for the instant it is measured, every row drawn (never painted: it is put back in
  the same task); "fit" once measured, where every row is drawn but those past the count, hidden by a
  rule the component writes (FitStyle).
*/

/** The fitted count, how many rows stay hidden, and the highest rank (for the rule that hides them). */
export interface Fit {
  count: number;
  more: number;
  ranks: number;
}

/**
 * The guard band (Release 19, the owner's request of 26 Nov 2026: no layout that depends on 2px of
 * spare room): a fitted list never ends within this much of the window's bottom (above the page's
 * own bottom padding), so a wider run of glyphs (CI's browser sets text about 0.5% wider than this
 * container's), a late font swap or a chart that loads late cannot push the page past the window.
 * 1rem: 16px at 1440, about 17.7px at 1920. It costs at most one row, which the list's "and N more"
 * counts. The profile's primary pool folds by the same margin (profile-editor.tsx, usePoolFit).
 */
export const FIT_GUARD_REM = 1;

/** The guard band in px at the page's root size. */
export function fitGuardPx(): number {
  return FIT_GUARD_REM * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
}

/**
 * Where the first screen ends for a list, in the page's coordinates: the window's bottom less the
 * page's bottom padding (`#content`'s, so the page does not scroll) and the guard band. With a
 * `sibling` (the column beside the list's, the Overview's pools) that itself runs past the window's
 * bottom less that padding, the page scrolls anyway, and the list may run to that column's bottom
 * instead: it then shows every row that fits beside it, rather than one or two while the page scrolls
 * past them (large text). A sibling that ends inside the window, in the guard band included, leaves
 * the first screen's limit: the page does not scroll for it, so the band stands (a six-row pool drawn
 * whole for an instant before it folds, after a live resize, ended there and took the rail's last
 * row into the band: the review of Release 19).
 */
export function fitLimit(sibling?: string): number {
  const main = document.getElementById("content");
  const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
  // The rows' bottoms are read in the page's coordinates (their box plus the scroll), and the first screen is the page's top.
  const windowEnd = window.innerHeight - pad;
  const firstScreen = windowEnd - fitGuardPx();
  const beside = sibling ? document.querySelector(sibling) : null;
  const besideBottom = beside && beside.getBoundingClientRect().height > 0 ? beside.getBoundingClientRect().bottom + window.scrollY : -Infinity;
  return besideBottom > windowEnd ? besideBottom : firstScreen;
}

/**
 * The count the rows fit at (pure, for its unit test): from the CSS tiers' count, as many more as
 * still end at or above `limit`, then fewer, down to the first, while the list ends past it.
 * `items` are the rows' ranks and heights, `caps` the captions' (each with the rank of its first
 * row), `bottomAll` where the list (or its card) ends with every row drawn.
 */
export function fitCount({ items, caps, bottomAll, limit, cssCount }: { items: ReadonlyArray<{ rank: number; h: number }>; caps: ReadonlyArray<{ first: number; h: number }>; bottomAll: number; limit: number; cssCount: number }): Fit {
  const ranks = Math.max(...items.map((i) => i.rank));
  const bottomFor = (k: number) => bottomAll - items.filter((i) => i.rank > k).reduce((s, i) => s + i.h, 0) - caps.filter((c) => c.first > k).reduce((s, c) => s + c.h, 0);
  let count = Math.max(1, Math.min(cssCount, ranks));
  while (count < ranks && bottomFor(count + 1) <= limit) count++;
  // Where even the tiers' rows run past the limit (a larger team lengthening the column above), fewer, down to the first.
  while (count > 1 && bottomFor(count) > limit) count--;
  return { count, more: items.filter((i) => i.rank > count).length, ranks };
}

const shown = (el: Element) => el.getBoundingClientRect().height > 0;

/**
 * How many rows fit: every row drawn for a moment (the `measure` mode), each row's and caption's
 * height read, then the most rows whose list ends at or above the first screen's end (fitLimit: the
 * window's bottom less the page's bottom padding and the guard band, or the sibling column's bottom
 * where the page scrolls anyway): more than the CSS tiers show where there is room, fewer (down to
 * the first row) where even theirs run past it.
 */
export function measureFit(el: HTMLElement, attribute: string, cssMode: string, outer?: string, sibling?: string): Fit | null {
  const before = el.getAttribute(attribute);
  el.setAttribute(attribute, cssMode);
  const rows = [...el.querySelectorAll<HTMLElement>("[data-ov-rank]")];
  if (!rows.length) {
    if (before !== null) el.setAttribute(attribute, before);
    return null;
  }
  const cssCount = Math.max(0, ...rows.filter(shown).map((r) => Number(r.dataset.ovRank)));
  el.setAttribute(attribute, "measure");
  // The card the list ends (its padding and border under the list count too): the list itself where it is the card.
  const bottomAll = ((outer ? el.closest(outer) : null) ?? el).getBoundingClientRect().bottom + window.scrollY;
  const items = rows.map((r) => ({ rank: Number(r.dataset.ovRank), h: r.getBoundingClientRect().height }));
  const caps = [...el.querySelectorAll<HTMLElement>("[data-ov-caption]")].map((c) => ({ first: Number(c.dataset.ovCaption), h: c.getBoundingClientRect().height }));
  if (before !== null) el.setAttribute(attribute, before);
  return fitCount({ items, caps, bottomAll, limit: fitLimit(sibling), cssCount });
}

/** The rule hiding the rows past the fitted count, scoped to the list (`selector`) in its `fit` mode. */
export function FitStyle({ selector, fit }: { selector: string; fit: Fit }) {
  if (fit.count >= fit.ranks) return null;
  const past = Array.from({ length: fit.ranks - fit.count }, (_, i) => fit.count + 1 + i);
  const css = `${selector} :is(${past.map((r) => `[data-ov-rank="${r}"],[data-ov-caption="${r}"]`).join(",")}){display:none!important}`;
  return <style>{css}</style>;
}

/**
 * Measures `ref`'s list while `active()` holds (else null: the CSS tiers stand), again on every resize,
 * whenever `key` changes (the fold opened or closed, the list's size), once the fonts have loaded, and
 * whenever the page's frame or the `sibling` column changes size. In a layout effect, so the fitted rows are drawn before the browser
 * paints the interactive page.
 */
export function useFit(ref: React.RefObject<HTMLElement | null>, attribute: string, cssMode: string, active: (el: HTMLElement) => boolean, key: unknown, outer?: string, sibling?: string): Fit | null {
  const [fit, setFit] = React.useState<Fit | null>(null);
  // The test of whether to measure, kept current without re-subscribing (it is a function of the element only).
  const activeRef = React.useRef(active);
  React.useLayoutEffect(() => {
    activeRef.current = active;
  });
  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el || !activeRef.current(el)) return setFit(null);
    const next = measureFit(el, attribute, cssMode, outer, sibling);
    setFit((was) => (was && next && was.count === next.count && was.more === next.more && was.ranks === next.ranks ? was : next));
  }, [ref, attribute, cssMode, outer, sibling]);
  React.useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    // The page's frame changing size measures again as well: a resize's root size and column widths can settle a frame or
    // more after its event (seen in Chromium with reduced motion emulated: the Production check read 1920 × 950 with the rows
    // fitted for the root size of 1440, the milestones 16px past the window). Measuring leaves the layout as it was, and the
    // fitted rows change it once, to a size that measures the same, so this settles.
    const frame = typeof ResizeObserver === "function" ? document.getElementById("content") : null;
    const observer = frame ? new ResizeObserver(() => measure()) : null;
    if (frame) observer?.observe(frame);
    // The column beside the list as well (the Overview's pools): it changes height without the frame changing size while
    // the page fits (a six-row pool folding a commit after a resize was measured, an off role opened, Show all), and the
    // list measures again against it. No loop: the list's rows never change that column's height (the 2×2's pools sit
    // under the season's card, self-start, whatever the rail beside them holds).
    const beside = observer && sibling ? document.querySelector(sibling) : null;
    if (beside) observer?.observe(beside);
    return () => {
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  }, [measure, key, sibling]);
  return fit;
}

/** A page of 59rem or more (Leaderboards' two columns), measured by the page's own element. */
export function wideBoard(el: HTMLElement): boolean {
  const page = el.closest<HTMLElement>("[data-testid=leaderboards]");
  return !!page && page.clientWidth / parseFloat(getComputedStyle(document.documentElement).fontSize) >= 59;
}

/**
 * The Overview's recent champions as a fitted list: the heading with "and N more" (the CSS tiers' words
 * until measured, then the fitted count's), and the rows. Only where the list is drawn (the 2×2).
 */
export function FitChampions({ total, heading, cssMore, children }: { total: number; heading: React.ReactNode; /** "and N more" by the CSS tiers, until measured. */ cssMore: React.ReactNode; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const id = React.useId().replace(/:/g, "");
  // Beside the pools' column: where it ends past the window (large text, an off role opened), the page scrolls anyway and the list runs to its bottom.
  const fit = useFit(ref, "data-fit", "css", shown, total, "[data-testid=recent-form]", "[data-testid=overview-pools]");
  return (
    <div ref={ref} data-fit={fit ? "fit" : "css"} data-fit-id={id} className="group/fit" data-testid="recent-form-champions-fit">
      {fit ? <FitStyle selector={`[data-fit-id="${id}"][data-fit="fit"]`} fit={fit} /> : null}
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
        {heading}
        {fit ? (
          fit.more ? (
            <p className="text-xs text-fg-subtle" data-testid="recent-form-champions-more">
              and {fit.more} more
            </p>
          ) : null
        ) : (
          cssMore
        )}
      </div>
      {children}
    </div>
  );
}

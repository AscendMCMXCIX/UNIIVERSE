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

const shown = (el: Element) => el.getBoundingClientRect().height > 0;

/**
 * How many rows fit: every row drawn for a moment (the `measure` mode), each row's and caption's
 * height read, then the most rows whose list ends at or above the window's bottom less the page's
 * bottom padding (so the page does not scroll): more than the CSS tiers show where there is room, fewer
 * (down to the first row) where even theirs run past it.
 */
export function measureFit(el: HTMLElement, attribute: string, cssMode: string): Fit | null {
  const before = el.getAttribute(attribute);
  el.setAttribute(attribute, cssMode);
  const rows = [...el.querySelectorAll<HTMLElement>("[data-ov-rank]")];
  if (!rows.length) {
    if (before !== null) el.setAttribute(attribute, before);
    return null;
  }
  const cssCount = Math.max(0, ...rows.filter(shown).map((r) => Number(r.dataset.ovRank)));
  el.setAttribute(attribute, "measure");
  const bottomAll = el.getBoundingClientRect().bottom + window.scrollY;
  const items = rows.map((r) => ({ rank: Number(r.dataset.ovRank), h: r.getBoundingClientRect().height }));
  const caps = [...el.querySelectorAll<HTMLElement>("[data-ov-caption]")].map((c) => ({ first: Number(c.dataset.ovCaption), h: c.getBoundingClientRect().height }));
  if (before !== null) el.setAttribute(attribute, before);
  const main = document.getElementById("content");
  const limit = window.innerHeight - (main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0);
  const ranks = Math.max(...items.map((i) => i.rank));
  const bottomFor = (k: number) => bottomAll - items.filter((i) => i.rank > k).reduce((s, i) => s + i.h, 0) - caps.filter((c) => c.first > k).reduce((s, c) => s + c.h, 0);
  let count = cssCount;
  while (count < ranks && bottomFor(count + 1) <= limit + 0.5) count++;
  // Where even the tiers' rows run past the window (a larger team lengthening the column above), fewer, down to the first.
  while (count > 1 && bottomFor(count) > limit + 0.5) count--;
  return { count, more: items.filter((i) => i.rank > count).length, ranks };
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
 * whenever `key` changes (the fold opened or closed, the list's size) and once the fonts have loaded. In a layout effect, so the fitted rows are drawn before the browser
 * paints the interactive page.
 */
export function useFit(ref: React.RefObject<HTMLElement | null>, attribute: string, cssMode: string, active: (el: HTMLElement) => boolean, key: unknown): Fit | null {
  const [fit, setFit] = React.useState<Fit | null>(null);
  // The test of whether to measure, kept current without re-subscribing (it is a function of the element only).
  const activeRef = React.useRef(active);
  React.useLayoutEffect(() => {
    activeRef.current = active;
  });
  const measure = React.useCallback(() => {
    const el = ref.current;
    if (!el || !activeRef.current(el)) return setFit(null);
    const next = measureFit(el, attribute, cssMode);
    setFit((was) => (was && next && was.count === next.count && was.more === next.more && was.ranks === next.ranks ? was : next));
  }, [ref, attribute, cssMode]);
  React.useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, key]);
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
  const fit = useFit(ref, "data-fit", "css", shown, total);
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

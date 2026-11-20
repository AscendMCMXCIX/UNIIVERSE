/**
 * The size of the screen the page is drawn on, as fixed positioning places things on it: the box of
 * an invisible element fixed to the screen's four edges (`position: fixed; inset: 0`).
 *
 * Script that places something fixed (a menu below its button, a tip beside its icon, the edge a
 * drag scrolls at) measures the very box it places in, so the place and the measure always agree,
 * whatever the browser's other readings say. In installed apps iOS has reported the visual viewport
 * short after the keyboard or a resume, and the root's clientHeight short by the status bar (WebKit
 * bugs 322900, 323322); fixed boxes then follow the shortened viewport too, and this box with them.
 * Browser code only; the element is made on first use, after the page has hydrated, and kept.
 */
let probe: HTMLDivElement | null = null;

export function screenBox(): { width: number; height: number } {
  if (!probe || !probe.isConnected) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.dataset.screenProbe = "";
    probe.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1";
    document.body.append(probe);
  }
  return {
    width: probe.offsetWidth || document.documentElement.clientWidth,
    height: probe.offsetHeight || window.innerHeight,
  };
}

/** The screen's height, as screenBox() measures it. */
export function screenHeight(): number {
  return screenBox().height;
}

/**
 * The part of the screen clear of the frame's bars, top and bottom, as fixed positioning sees it:
 * from under the top bar to above the tab bar on a phone, the whole screen where there are none.
 * Read from the page's scroll padding, which MobileNav and globals.css keep to the bars, so that
 * whatever scrolls into view stops clear of them (WCAG 2.4.11).
 */
export function clearArea(): { top: number; bottom: number } {
  const style = getComputedStyle(document.documentElement);
  return { top: parseFloat(style.scrollPaddingTop) || 0, bottom: screenHeight() - (parseFloat(style.scrollPaddingBottom) || 0) };
}

/** How far the page scrolls before a phone's top bar may slide away (about the bar's height): MobileNav's useHideOnScroll. */
export const BAR_HIDE_AFTER = 64;
/** The distance scrolled one way, from where that direction began, that hides or shows the bar: MobileNav's useHideOnScroll. */
export const BAR_INTENT = 8;

/**
 * The top bar whose first row slides away (MobileNav's "row": an upright phone the frame crowds),
 * with that row's height: the part of the bar the scroll padding leaves out, since the row goes as
 * the page scrolls down. Null where nothing slides that way, and while the bar holds the focus (its
 * row then stays, and the padding counts it).
 */
function slidingRow(): { bar: HTMLElement; row: number } | null {
  const bar = document.querySelector<HTMLElement>("[data-testid=mobile-topbar][data-slides=row]");
  if (!bar || bar.matches(":focus-within")) return null;
  const row = parseFloat(bar.style.getPropertyValue("--bar-row")) || 0;
  return row > 0 ? { bar, row } : null;
}

/**
 * The line under everything pinned at the top of the screen now: the scroll padding, and the top
 * bar's first row too while it is in view where the padding leaves it out (slidingRow).
 */
export function pinnedTop(): number {
  const sliding = slidingRow();
  return clearArea().top + (sliding && sliding.bar.dataset.hidden === "false" ? sliding.row : 0);
}

/**
 * Scrolls the page so `el` starts just under what is pinned over it, as scrollIntoView({ block:
 * "start" }) does with the page's scroll padding, and clear of the top bar as the bar will be once
 * the page has moved. Where the bar's first row slides away, the padding leaves the row out, which
 * suits a move down: the row goes. A move up brings the row back, and so does a stop near the
 * page's top; a move too small to count leaves it as it is (useHideOnScroll). There `el` stops the
 * row's height lower, so the row never comes back over what was brought into view (a game's card
 * after its window closes, a list's first game after the pager or a filter: R6 review BX2).
 */
export function scrollToStart(el: HTMLElement, behavior: ScrollBehavior = "instant"): void {
  const sliding = slidingRow();
  let below = 0;
  if (sliding) {
    const from = window.scrollY;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const end = Math.max(0, Math.min(from + el.getBoundingClientRect().top - clearArea().top - margin, document.documentElement.scrollHeight - window.innerHeight));
    const shown = sliding.bar.dataset.hidden === "false";
    if (end < from - 0.5 || end < BAR_HIDE_AFTER || (shown && end - from <= BAR_INTENT)) below = sliding.row;
  }
  if (!below) {
    el.scrollIntoView({ block: "start", behavior });
    return;
  }
  // The position is worked out as the call is made, a smooth scroll's too: the margin can go at once.
  const inline = el.style.scrollMarginTop;
  el.style.scrollMarginTop = `${(parseFloat(getComputedStyle(el).scrollMarginTop) || 0) + below}px`;
  el.scrollIntoView({ block: "start", behavior });
  el.style.scrollMarginTop = inline;
}

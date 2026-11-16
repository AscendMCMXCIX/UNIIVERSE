/*
  Where a picker's list opens. The member and champion pickers (Team → Matches' and a profile's
  filters, in the Filters sheet on phones) and the champion window's opponent picker open a list
  under their button. Floating there with a height and a scroller of its own, inside a window whose
  body already scrolls, the list was a scroll inside a scroll, and the body cut it off at its edge.
  Inside a window, and on a phone, it opens in the flow instead: part of the window's body, which is
  then the one thing that scrolls, brought into view as it opens. On a page from sm up it floats, as
  before. The add-champion search opens on the page; its list goes above its field when the room
  below, down to the tab bar, is too small (placeList).
*/

/** Phones: below Tailwind's sm. */
const PHONE_QUERY = "(max-width: 39.99rem)";

/** Whether a picker's list opens in the flow of what holds it (inside a window, or on a phone) rather than floating. */
export function opensInFlow(el: Element | null): boolean {
  if (!el) return false;
  return !!el.closest("dialog") || window.matchMedia(PHONE_QUERY).matches;
}

/**
 * Brings what opened in the flow into view: what holds it (a window's body) scrolls just enough to
 * show it whole, or its top where it is taller than that (scrollIntoView, block "nearest"). The page
 * behind a window never moves for it: a browser that scrolls the page as well has it put back.
 */
export function bringIntoView(el: Element | null): void {
  if (!el) return;
  const x = window.scrollX;
  const y = window.scrollY;
  el.scrollIntoView({ block: "nearest" });
  if (el.closest("dialog") && (window.scrollX !== x || window.scrollY !== y)) window.scrollTo({ left: x, top: y, behavior: "instant" });
}

/**
 * Where a list opened from a field goes, and how tall it may be there: below the field, unless the
 * room below (to `area`'s bottom, the tab bar's top on a phone) is less than the list `needs` and
 * the room above is larger; never taller than the room on its side (nor shorter than `least`), so
 * it never runs under the bars. `gap` is the space between the field and the list.
 */
export function placeList(field: { top: number; bottom: number }, needs: number, area: { top: number; bottom: number }, gap: number, least: number): { side: "below" | "above"; maxHeight: number } {
  const below = area.bottom - field.bottom - gap;
  const above = field.top - area.top - gap;
  const side = below >= needs || below >= above ? "below" : "above";
  return { side, maxHeight: Math.floor(Math.max(least, Math.min(needs, side === "below" ? below : above))) };
}

/*
  Where a picker's list opens. The member and champion pickers (Team → Matches' and a profile's
  filters, in the Filters sheet on phones) and the champion window's opponent picker open a list
  under their button. Floating there with a height and a scroller of its own, inside a window whose
  body already scrolls, the list was a scroll inside a scroll, and the body cut it off at its edge.
  Inside a window, and on a phone, it opens in the flow instead: part of the window's body, which is
  then the one thing that scrolls, brought into view as it opens. On a page from sm up it floats, as
  before. A list in the flow fades in where it rests (a rise would move it as it is brought into
  view, and leave it a rise's height off), and closes on the click of a press outside it rather than
  as the press starts (closeOnPressOutside). The add-champion search opens on the page; its list goes
  above its field when the room below, down to the tab bar or the on-screen keyboard, is too small
  (placeList, visibleArea).
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
 * Closes an open list when a press lands outside it and its button (`inside` says what is theirs).
 * A floating list closes as the press starts (pointerdown): it covers nothing the press is aimed at,
 * and nothing moves as it goes. A list in the flow closes on the press's click instead. It takes room
 * in what holds it, so closing it moves everything below it up by its height; closed as the press
 * started, the click that followed reached whatever had moved under the finger (a tap on the field
 * under the Filters sheet's member list landed further down, a tap on a game under the opponent list
 * opened another game). Closed on the click, the click has already found its target. Heard on the
 * way down (the capture phase), before anything the press reaches can stop it. Returns the way to
 * stop listening.
 */
export function closeOnPressOutside(target: Pick<EventTarget, "addEventListener" | "removeEventListener">, inside: (node: Node | null) => boolean, inFlow: boolean, close: () => void): () => void {
  const type = inFlow ? "click" : "pointerdown";
  const away = (e: Event) => {
    if (!inside(e.target as Node | null)) close();
  };
  target.addEventListener(type, away, true);
  return () => target.removeEventListener(type, away, true);
}

/**
 * The part of the screen a list may use: `clear` (between the bars, clearArea), and only what is
 * above the on-screen keyboard while it is up (`aboveKeyboard`, keyboard-fit.ts), which covers the
 * bottom of the screen and the tab bar with it.
 */
export function visibleArea(clear: { top: number; bottom: number }, aboveKeyboard: { top: number; bottom: number } | null): { top: number; bottom: number } {
  if (!aboveKeyboard) return clear;
  return { top: Math.max(clear.top, aboveKeyboard.top), bottom: Math.min(clear.bottom, aboveKeyboard.bottom) };
}

/**
 * Where a list opened from a field goes, and how tall it may be there: below the field, unless the
 * room below (to `area`'s bottom: the tab bar's top on a phone, the keyboard's while it is up) is
 * less than the list `needs` and the room above is larger; never taller than the room on its side
 * (nor shorter than `least`), so it never runs under the bars. `gap` is the space between the field
 * and the list.
 */
export function placeList(field: { top: number; bottom: number }, needs: number, area: { top: number; bottom: number }, gap: number, least: number): { side: "below" | "above"; maxHeight: number } {
  const below = area.bottom - field.bottom - gap;
  const above = field.top - area.top - gap;
  const side = below >= needs || below >= above ? "below" : "above";
  return { side, maxHeight: Math.floor(Math.max(least, Math.min(needs, side === "below" ? below : above))) };
}

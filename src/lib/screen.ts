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

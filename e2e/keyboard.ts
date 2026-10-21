import type { Page } from "@playwright/test";

/**
 * A phone's on-screen keyboard, emulated: headless Chromium has none, so the visual viewport (what a
 * keyboard shrinks; the page's own layout stays as it is, as on iOS Safari and on Chrome for Android)
 * is replaced by one whose height, and optional offset, the test sets with `keyboard(page, px, top)`.
 * `top` stands for the browser panning the visible part down to the field being typed in.
 * Call before the page loads.
 */
export async function emulateKeyboard(page: Page) {
  await page.addInitScript(() => {
    let keyboard = 0;
    let top = 0;
    const events = new EventTarget();
    const viewport = {
      get width() {
        return window.innerWidth;
      },
      get height() {
        return window.innerHeight - keyboard;
      },
      get offsetTop() {
        return top;
      },
      offsetLeft: 0,
      get pageTop() {
        return window.scrollY + top;
      },
      get pageLeft() {
        return window.scrollX;
      },
      scale: 1,
      onresize: null,
      onscroll: null,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    };
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => viewport });
    (window as unknown as { __keyboard: (h: number, t: number) => void }).__keyboard = (h: number, t: number) => {
      keyboard = h;
      top = t;
      events.dispatchEvent(new Event("resize"));
    };
  });
}

/** Raises the emulated keyboard to `px` high (0 puts it away), with the visible part panned down by `top`. */
export const keyboard = (page: Page, px: number, top = 0) => page.evaluate(([h, t]) => (window as unknown as { __keyboard: (h: number, t: number) => void }).__keyboard(h, t), [px, top] as const);

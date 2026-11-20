import type { Locator } from "./test";

/**
 * A finger pulled down from `target` by `distance` px in twelve steps, as touch events the window
 * itself hears (useSheetDrag in ui/detail-modal.tsx). Dispatched in the page, so Chromium and
 * Safari's engine get the same pull; the browser's own scrolling plays no part in it.
 */
export async function pullDown(target: Locator, distance = 320): Promise<void> {
  await target.evaluate(async (el, d) => {
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(60, r.width / 2);
    const y0 = r.top + Math.min(20, r.height / 2);
    // Safari's engine as Playwright runs it has no Touch constructor ("Illegal constructor"), and its
    // TouchEvent takes TouchLists only, not arrays: there its older factories, document.createTouch
    // (page and screen coordinates) and document.createTouchList, make the same touches.
    type LegacyDocument = Document & {
      createTouch(view: Window, target: EventTarget, id: number, pageX: number, pageY: number, screenX: number, screenY: number): Touch;
      createTouchList(...touches: Touch[]): TouchList;
    };
    const doc = document as LegacyDocument;
    let legacy = false;
    try {
      new Touch({ identifier: 1, target: el, clientX: x, clientY: y0 });
    } catch {
      legacy = true;
    }
    const touchAt = (y: number): Touch => (legacy ? doc.createTouch(window, el, 1, x + window.scrollX, y + window.scrollY, x, y) : new Touch({ identifier: 1, target: el, clientX: x, clientY: y }));
    const list = (...touches: Touch[]) => (legacy ? doc.createTouchList(...touches) : touches) as unknown as Touch[];
    const fire = (type: string, y: number) => {
      const t = touchAt(y);
      const touches = type === "touchend" ? list() : list(t);
      el.dispatchEvent(new TouchEvent(type, { touches, targetTouches: touches, changedTouches: list(t), bubbles: true, cancelable: true }));
    };
    fire("touchstart", y0);
    for (let i = 1; i <= 12; i++) {
      fire("touchmove", y0 + (i * d) / 12);
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    fire("touchend", y0 + d);
  }, distance);
}

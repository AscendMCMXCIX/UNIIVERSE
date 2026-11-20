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
    const fire = (type: string, y: number) => {
      const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      const touches = type === "touchend" ? [] : [t];
      el.dispatchEvent(new TouchEvent(type, { touches, targetTouches: touches, changedTouches: [t], bubbles: true, cancelable: true }));
    };
    fire("touchstart", y0);
    for (let i = 1; i <= 12; i++) {
      fire("touchmove", y0 + (i * d) / 12);
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    fire("touchend", y0 + d);
  }, distance);
}

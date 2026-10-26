import { expect, type Page } from "./test";

/*
  The close button's corner of an open window (DetailModal): nothing else in the window within
  CLEARANCE px of the corner's controls, the close button the corner's last control, 44 px on touch
  screens, and the window's own navigation (Back, previous / next) past a divider. Shared by
  modal-close-area.spec.ts and webkit.spec.ts.
*/

export const CLEARANCE = 12;

/** Until the open window's opening motion (which scales it) is over; finite motions only, as a loading pulse runs for ever. */
export async function untilStill(page: Page) {
  await expect.poll(() => page.evaluate(() => document.querySelector("dialog[open]")?.getAnimations({ subtree: true }).filter((a) => a.playState === "running" && a.effect?.getComputedTiming().endTime !== Infinity).length ?? -1)).toBe(0);
}

/** The open window's corner, measured once it is still. */
export async function corner(page: Page) {
  await untilStill(page);
  return page.evaluate(() => {
    const d = document.querySelector("dialog[open]")!;
    const cluster = d.querySelector<HTMLElement>("[data-testid=modal-controls]")!;
    const close = cluster.querySelector<HTMLElement>('button[aria-label="Close"]')!;
    const k = cluster.getBoundingClientRect();
    const c = close.getBoundingClientRect();
    const w = d.getBoundingClientRect();
    const seen = (e: Element) => {
      const r = e.getBoundingClientRect();
      return r.width > 0.5 && r.height > 0.5 && getComputedStyle(e).visibility !== "hidden" && !e.closest(".sr-only");
    };
    // Whatever can be used or read: controls, and every element with text of its own.
    const content = [...d.querySelectorAll("*")].filter((e) => !cluster.contains(e) && !e.contains(cluster) && seen(e) && (e.matches("a, button, input, select, textarea, [role=tab]") || [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim())));
    const gap = (r: DOMRect) => Math.max(0, k.left - r.right, r.left - k.right, k.top - r.bottom, r.top - k.bottom);
    let nearest = { gap: Infinity, what: "" };
    for (const e of content) {
      const g = gap(e.getBoundingClientRect());
      if (g < nearest.gap) nearest = { gap: g, what: e.getAttribute("data-testid") ?? e.textContent!.trim().slice(0, 40) };
    }
    const nav = [...cluster.children].filter((e) => e !== close && e.getAttribute("data-testid") !== "modal-controls-divider" && e.getBoundingClientRect().width > 0);
    return {
      nearest,
      close: { width: c.width, height: c.height, fromRight: w.right - c.right, fromTop: c.top - w.top, rightmost: c.right >= k.right - 0.5 },
      // From the window's own navigation to the close button, and whether a divider sets them apart.
      navGap: nav.length ? Math.min(...nav.map((e) => c.left - e.getBoundingClientRect().right)) : null,
      divider: !!cluster.querySelector("[data-testid=modal-controls-divider]"),
      clusterLeft: k.left,
    };
  });
}

export async function expectClearCorner(page: Page, { nav = false }: { nav?: boolean } = {}) {
  const m = await corner(page);
  expect(m.nearest.gap, `nearest content to the corner: ${m.nearest.what}`).toBeGreaterThanOrEqual(CLEARANCE - 0.5);
  // The close button is the corner's last control, in the top-right corner.
  expect(m.close.rightmost).toBe(true);
  expect(m.close.fromRight).toBeLessThanOrEqual(16);
  expect(m.close.fromTop).toBeLessThanOrEqual(16);
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches)) expect(Math.min(m.close.width, m.close.height)).toBeGreaterThanOrEqual(44);
  if (nav) {
    expect(m.divider).toBe(true);
    expect(m.navGap!).toBeGreaterThanOrEqual(16);
  } else expect(m.divider).toBe(false);
  return m;
}


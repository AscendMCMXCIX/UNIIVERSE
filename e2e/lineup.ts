import { expect, type CDPSession, type Locator, type Page } from "./test";

/**
 * Team Overview's lineup as it is laid out, read in one frame once it is at rest: its five cells,
 * the track, and how far the page scrolls sideways. The lineup streams in: React holds it in a
 * hidden container and reveals it a little later (it batches reveals, up to 300ms after the page's
 * first paint), which can be after the load event that page.goto waits for. Five cells can then be
 * counted while none is laid out (every box 0 × 0): a test that read them right after counting
 * them once measured a lineup that ended at 0. So every figure a test compares comes from one
 * frame, taken once the cells and the track have a size and two frames in a row agree.
 */
export async function lineupAtRest(page: Page) {
  const layout = await page.evaluate(async () => {
    // In the page's own font: a fallback lays the cards' text out differently.
    await document.fonts.ready;
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, top: Math.round(r.top), bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const read = () => {
      const track = document.querySelector("[data-testid=lineup-overview]");
      return { cells: [...document.querySelectorAll("[data-testid=lineup-cell]")].map(box), track: track && box(track), overflow: document.documentElement.scrollWidth - window.innerWidth };
    };
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    let last = read();
    for (let i = 0; i < 600; i++) {
      await frame();
      const now = read();
      const laidOut = now.cells.length === 5 && [...now.cells, now.track].every((b) => !!b && b.width > 0 && b.height > 0);
      if (laidOut && JSON.stringify(now) === JSON.stringify(last)) return { ...now, still: true };
      last = now;
    }
    return { ...last, still: false };
  });
  expect(layout.still, "the lineup laid out and at rest").toBe(true);
  return { ...layout, track: layout.track! };
}

export const ROLE_LABEL: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MID: "Mid", ADC: "Bottom", SUPPORT: "Support" };

/** A card's horizontal distance from the middle of the phone's carousel, to a tenth of a pixel (0 when it is the card in view, at rest). */
export const offCentre = (card: Locator) =>
  card.evaluate((c) => {
    const t = c.closest("[data-testid=lineup-overview]")!.getBoundingClientRect();
    const r = c.getBoundingClientRect();
    return Math.round(Math.abs(r.left + r.width / 2 - (t.left + t.width / 2)) * 10) / 10;
  });

/**
 * Brings a role's card into view: on a phone (the lineup a carousel) through its position dot, which
 * moves the carousel the shortest way round, then waits until it is at rest in the middle; elsewhere
 * every card is already in the grid. A tap before the page is interactive does nothing, so it taps
 * until the card is in view.
 */
export async function showLineupCard(page: Page, role: string) {
  const dots = page.getByTestId("lineup-indicator");
  const card = page.getByTestId(`lineup-row-${role}`);
  if (await dots.isVisible()) {
    const dot = dots.getByRole("tab", { name: new RegExp(`^${ROLE_LABEL[role]}:`) });
    await expect(async () => {
      await dot.click({ timeout: 2_000 });
      await expect(dot).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
      await expect(card).toBeInViewport({ ratio: 0.5, timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await expect.poll(() => offCentre(card)).toBeLessThanOrEqual(0.5);
  }
  return card;
}

/** A finger drag on the touchscreen in 12 steps (real touch events, so the browser scrolls natively). */
export async function swipe(page: Page, cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * i) / 12, y: from.y + ((to.y - from.y) * i) / 12 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

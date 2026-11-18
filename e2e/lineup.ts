import { expect, type Page } from "./test";

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

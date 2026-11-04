import { describe, expect, it } from "vitest";
import { countFit } from "./player-card";

/*
  The Players pool row (PoolPreview's fit="count"), read the way the browser applies its container
  queries: at every width, for every pool size, the portraits shown are the pool's first ones, whole
  and inside the row, with the rest counted after them; as many as fit; never "+1".
*/

const PORTRAIT = 2.25;
const GAP = 0.25;

/** Whether a class list leaves its element shown at a row `width` rem wide (hidden, @min-[a], @max-[b], and both). */
function shownAt(className: string, width: number, shownByDefault: boolean): boolean {
  const range = (variant: string) => {
    const min = /@min-\[([\d.]+)rem\]\/pool:/.exec(variant);
    const max = /@max-\[([\d.]+)rem\]\/pool:/.exec(variant);
    return (!min || width >= Number(min[1])) && (!max || width < Number(max[1]));
  };
  let shown = shownByDefault;
  for (const token of className.split(/\s+/).filter(Boolean)) {
    const utility = token.slice(token.lastIndexOf(":") + 1);
    if (range(token)) shown = utility === "hidden" ? false : utility === "grid" ? true : shown;
  }
  return shown;
}

describe("Players pool row (fit=count)", () => {
  for (let n = 0; n <= 20; n++)
    it(`a pool of ${n}: whole portraits in order, then the rest counted, at every width`, () => {
      const { portraits, counts } = countFit(n);
      for (let width = 2.25; width <= 40; width += 0.0625) {
        const shown = portraits.map((c) => shownAt(c, width, true));
        const k = shown.filter(Boolean).length;
        const visibleCounts = counts.filter((c) => shownAt(c.className, width, false));
        // The first k, with no gap among them.
        expect(shown.slice(0, k).every(Boolean), `n=${n} at ${width}rem: the first ${k}`).toBe(true);
        expect(visibleCounts.length, `n=${n} at ${width}rem: at most one count`).toBeLessThanOrEqual(1);
        const count = visibleCounts[0];
        if (k < n) {
          expect(count?.shown, `n=${n} at ${width}rem: ${n - k} counted after ${k}`).toBe(k);
          expect(n - k, `n=${n} at ${width}rem: never +1`).toBeGreaterThan(1);
        } else expect(count, `n=${n} at ${width}rem: a whole pool has no count`).toBeUndefined();
        // Everything shown fits the row, and one more portrait would not have.
        const used = k * PORTRAIT + Math.max(0, k - 1) * GAP + (count ? GAP * (k ? 1 : 0) + PORTRAIT : 0);
        expect(used, `n=${n} at ${width}rem: fits`).toBeLessThanOrEqual(width + 1e-9);
        if (k < n) {
          const next = (k + 1) * PORTRAIT + k * GAP + (k + 1 < n ? GAP + PORTRAIT : 0);
          if (k < portraits.length) expect(next, `n=${n} at ${width}rem: no room for one more`).toBeGreaterThan(width);
        }
      }
    });
});

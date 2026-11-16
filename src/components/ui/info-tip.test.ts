import { describe, expect, it } from "vitest";
import { landAt, placeTip } from "./info-tip";

/*
  An ⓘ's bubble: where it goes (placeTip), and the style position that lands it there however the
  box holding it is moved (landAt). Inside a window the bubble is fixed in the window's dialog, which
  is a containing block for it while a transform moves the window (its opening motion): the bubble
  is then offset and scaled with it. Measured once, at the position it has, the offset and the scale
  give the position that puts it where placeTip says. Drawn over a real window in e2e/popups.spec.ts.
*/

const screen = { width: 375, height: 667 };

describe("where a bubble goes", () => {
  it("above its trigger, centred on it", () => {
    expect(placeTip({ left: 100, top: 300, bottom: 324, width: 24 }, { width: 120, height: 40 }, screen)).toEqual({ left: 52, top: 254, side: "top" });
  });

  it("below it when there is no room above", () => {
    expect(placeTip({ left: 100, top: 20, bottom: 44, width: 24 }, { width: 120, height: 40 }, screen)).toEqual({ left: 52, top: 50, side: "bottom" });
  });

  it("kept 8px inside the screen's edges", () => {
    expect(placeTip({ left: 0, top: 300, bottom: 324, width: 24 }, { width: 120, height: 40 }, screen).left).toBe(8);
    expect(placeTip({ left: 360, top: 300, bottom: 324, width: 24 }, { width: 120, height: 40 }, screen).left).toBe(375 - 8 - 120);
  });
});

/** Where a bubble lands on screen for a style position, in a box offset by `origin` and scaled by `scale` (a window's transform). */
function lands(style: { left: number; top: number }, origin: { x: number; y: number }, scale: number, size = { width: 120, height: 40 }) {
  return { left: origin.x + style.left * scale, top: origin.y + style.top * scale, width: size.width * scale, height: size.height * scale };
}

describe("the style position that lands a bubble where it goes", () => {
  const size = { width: 120, height: 40 };
  const target = { left: 52, top: 254 };

  it("is where it goes, when nothing moves the box it is fixed in (the screen)", () => {
    const style = { left: 0, top: 0 };
    expect(landAt(target, style, lands(style, { x: 0, y: 0 }, 1), size)).toEqual(target);
  });

  it("makes up for a window that holds it, moved and scaled by its opening motion", () => {
    for (const [origin, scale] of [
      [{ x: 0, y: 8 }, 1],
      [{ x: 11.25, y: 30 }, 0.97],
      [{ x: -40, y: 120 }, 0.5],
    ] as const) {
      // Measured at whatever position it has: its first, hidden one (0, 0), or the one it was given.
      for (const style of [{ left: 0, top: 0 }, { left: 52, top: 254 }]) {
        const at = landAt(target, style, lands(style, origin, scale), size);
        const landed = lands(at, origin, scale);
        expect(landed.left).toBeCloseTo(target.left, 6);
        expect(landed.top).toBeCloseTo(target.top, 6);
      }
    }
  });

  it("measured again where it already lands right, stays where it is", () => {
    const origin = { x: 11.25, y: 30 };
    const first = landAt(target, { left: 0, top: 0 }, lands({ left: 0, top: 0 }, origin, 0.97), size);
    const again = landAt(target, first, lands(first, origin, 0.97), size);
    expect(again.left).toBeCloseTo(first.left, 6);
    expect(again.top).toBeCloseTo(first.top, 6);
  });

  it("reads no scale from a box that has no size yet", () => {
    expect(landAt(target, { left: 10, top: 10 }, { left: 30, top: 40, width: 0, height: 0 }, { width: 0, height: 0 })).toEqual({ left: 32, top: 224 });
  });
});

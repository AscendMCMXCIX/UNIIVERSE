import { describe, expect, it } from "vitest";
import { AVATAR_ZOOM_MAX, clampCrop, cropRect, DEFAULT_CROP, dragCrop, viewportLayout } from "./avatar-crop";

const inside = (r: { sx: number; sy: number; side: number }, w: number, h: number) => r.sx >= 0 && r.sy >= 0 && r.sx + r.side <= w + 1e-9 && r.sy + r.side <= h + 1e-9;

describe("avatar crop geometry", () => {
  it("starts centred, the shorter side filling the crop, for any shape", () => {
    expect(cropRect(DEFAULT_CROP, 1600, 900)).toEqual({ sx: 350, sy: 0, side: 900 });
    expect(cropRect(DEFAULT_CROP, 600, 1200)).toEqual({ sx: 0, sy: 300, side: 600 });
    expect(cropRect(DEFAULT_CROP, 512, 512)).toEqual({ sx: 0, sy: 0, side: 512 });
  });

  it("never leaves empty space: positions and zoom are clamped to the picture", () => {
    for (const [w, h] of [
      [1600, 900],
      [600, 1200],
      [512, 512],
      [4000, 300],
    ] as const) {
      for (const zoom of [0.2, 1, 2.5, AVATAR_ZOOM_MAX, 99]) {
        for (const [cx, cy] of [
          [-3, -3],
          [0, 1],
          [0.5, 0.5],
          [7, 2],
        ] as const) {
          const r = cropRect({ zoom, cx, cy }, w, h);
          expect(inside(r, w, h)).toBe(true);
          const v = viewportLayout({ zoom, cx, cy }, w, h, 256);
          // The displayed picture always covers the whole viewport.
          expect(v.x).toBeLessThanOrEqual(1e-9);
          expect(v.y).toBeLessThanOrEqual(1e-9);
          expect(v.x + v.w).toBeGreaterThanOrEqual(256 - 1e-9);
          expect(v.y + v.h).toBeGreaterThanOrEqual(256 - 1e-9);
        }
      }
    }
    expect(clampCrop({ zoom: 0.5, cx: 0.5, cy: 0.5 }, 100, 100).zoom).toBe(1);
    expect(clampCrop({ zoom: Number.NaN, cx: Number.NaN, cy: 0.5 }, 100, 100)).toEqual(DEFAULT_CROP);
  });

  it("the picture follows the pointer, and stops at its edges", () => {
    // A wide picture: dragging right shows more of its left side.
    const moved = dragCrop(DEFAULT_CROP, 50, 0, 1600, 900, 256);
    expect(moved.cx).toBeLessThan(0.5);
    expect(viewportLayout(moved, 1600, 900, 256).x).toBeCloseTo(viewportLayout(DEFAULT_CROP, 1600, 900, 256).x + 50, 6);
    // No vertical room at zoom 1: a vertical drag changes nothing.
    expect(dragCrop(DEFAULT_CROP, 0, 80, 1600, 900, 256).cy).toBe(0.5);
    // Far past the edge: held at the edge.
    expect(cropRect(dragCrop(DEFAULT_CROP, 5000, 0, 1600, 900, 256), 1600, 900).sx).toBe(0);
  });

  it("zooming keeps the centre point where it was", () => {
    const at = { zoom: 2, cx: 0.4, cy: 0.6 };
    const r = cropRect(at, 1000, 1000);
    expect(r.side).toBe(500);
    expect(r.sx + r.side / 2).toBeCloseTo(400, 6);
    expect(r.sy + r.side / 2).toBeCloseTo(600, 6);
    // Zooming back out moves it only as far as the edges require.
    expect(clampCrop({ ...at, zoom: 1 }, 1000, 1000)).toEqual({ zoom: 1, cx: 0.5, cy: 0.5 });
  });
});

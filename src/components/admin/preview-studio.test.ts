import { describe, expect, it } from "vitest";
import { previewScale } from "./preview-studio";

/*
  Previews' fitted canvas (docs/RESPONSIVE.md, "One-screen desktop pages", Previews): the device is
  never enlarged; in the flow it is scaled by the room's width alone (the page scrolls to the rest,
  as before), in the workspace by the width and the height, so the whole device page is in the window.
*/

describe("previewScale", () => {
  it("draws at full size until the room is measured, and never enlarges", () => {
    expect(previewScale({ width: 0, height: 0 }, 390, 844, true)).toBe(1);
    expect(previewScale({ width: 2000, height: 2000 }, 390, 844, true)).toBe(1);
  });

  it("fits the width alone in the flow, as before", () => {
    expect(previewScale({ width: 700, height: 300 }, 1366, 768, false)).toBeCloseTo(700 / 1366);
    expect(previewScale({ width: 700, height: 300 }, 390, 844, false)).toBe(1);
  });

  it("fits the width and the height in the workspace: a phone by its height, a desktop by its width", () => {
    // 1366 × 657 with the sidebar open: about 780 × 390 beside the controls.
    expect(previewScale({ width: 780, height: 390 }, 390, 844, true)).toBeCloseTo(390 / 844);
    expect(previewScale({ width: 780, height: 390 }, 1920, 1080, true)).toBeCloseTo(Math.min(780 / 1920, 390 / 1080));
    // A height not measured yet falls back to the width.
    expect(previewScale({ width: 780, height: 0 }, 1920, 1080, true)).toBeCloseTo(780 / 1920);
  });
});

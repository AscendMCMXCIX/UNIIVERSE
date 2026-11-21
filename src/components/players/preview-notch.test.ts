import { describe, expect, it } from "vitest";
import { notchPlacement } from "./preview-notch";

describe("notchPlacement", () => {
  const column = { top: 100 };
  const preview = { top: 150, bottom: 700 };
  it("sits beside the row, as tall as it, where the preview's edge runs beside the whole row", () => {
    expect(notchPlacement({ top: 300, bottom: 351 }, column, preview)).toEqual({ y: 200, height: 51, clipTop: 0, clipBottom: 0, hidden: false });
  });
  it("is cut where the row passes under the pinned preview's top or beyond its foot", () => {
    expect(notchPlacement({ top: 130, bottom: 181 }, column, preview)).toMatchObject({ clipTop: 20, clipBottom: 0, hidden: false });
    expect(notchPlacement({ top: 680, bottom: 731 }, column, preview)).toMatchObject({ clipTop: 0, clipBottom: 31, hidden: false });
  });
  it("goes once the row has scrolled out of the preview's edge, above or below", () => {
    expect(notchPlacement({ top: 40, bottom: 91 }, column, preview).hidden).toBe(true);
    expect(notchPlacement({ top: 99, bottom: 150 }, column, preview).hidden).toBe(true);
    expect(notchPlacement({ top: 720, bottom: 771 }, column, preview).hidden).toBe(true);
  });
});

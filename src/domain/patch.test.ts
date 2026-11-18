import { describe, expect, it } from "vitest";
import { comparePatches, patchDistance, patchFromVersion, patchSortKey, patchesAfter } from "./patch";

describe("patch helpers", () => {
  it("parses data dragon and game versions", () => {
    expect(patchFromVersion("15.19.1")).toBe("15.19");
    expect(patchFromVersion("15.19.712.6386")).toBe("15.19");
    expect(patchFromVersion("16.1.1")).toBe("16.1");
    expect(patchFromVersion("garbage")).toBeNull();
  });
  it("sorts numerically rather than lexically", () => {
    expect(patchSortKey("15.9")).toBeLessThan(patchSortKey("15.10"));
    expect(comparePatches("14.24", "15.1")).toBeLessThan(0);
  });
  it("measures distance using the list of known patches", () => {
    const known = ["15.20", "15.19", "15.18", "15.17"];
    expect(patchDistance("15.20", "15.18", known)).toBe(2);
    expect(patchDistance("15.20", "15.20", known)).toBe(0);
  });
  it("counts the patches after one, by the known list where it covers them, never fewer than the numbering shows", () => {
    expect(patchesAfter("16.22", "16.25")).toBe(3);
    expect(patchesAfter("16.22", "16.23")).toBe(1);
    // Not after it, or not a patch: none.
    expect(patchesAfter("16.22", "16.22")).toBe(0);
    expect(patchesAfter("16.23", "16.22")).toBe(0);
    expect(patchesAfter("16.22", "garbage")).toBe(0);
    // Year names count as their client version.
    expect(patchesAfter("26.22", "16.24")).toBe(2);
    // Across a season the list decides; without it, only what the numbers prove (17.1 and 17.2).
    expect(patchesAfter("16.22", "17.2", ["17.2", "17.1", "16.24", "16.23", "16.22", "16.21"])).toBe(4);
    expect(patchesAfter("16.22", "17.2")).toBe(2);
    expect(patchesAfter("16.24", "17.1")).toBe(1);
    // A list with gaps never counts fewer than the numbers, and patches outside the span never count.
    expect(patchesAfter("16.20", "16.25", ["16.25", "16.21"])).toBe(5);
    expect(patchesAfter("16.22", "16.23", ["16.30", "16.23", "16.22", "16.10"])).toBe(1);
  });
});

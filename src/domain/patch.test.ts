import { describe, expect, it } from "vitest";
import { comparePatches, patchDistance, patchFromVersion, patchSortKey } from "./patch";

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
});

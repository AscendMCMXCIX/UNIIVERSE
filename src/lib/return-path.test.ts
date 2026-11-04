import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("the address to return to after signing in", () => {
  it("keeps paths on this site, with their query and fragment", () => {
    expect(safeReturnPath("/team")).toBe("/team");
    expect(safeReturnPath("/players/abc/matches?season=16&mode=solo#game-3")).toBe("/players/abc/matches?season=16&mode=solo#game-3");
    expect(safeReturnPath("/overview/../team")).toBe("/team");
  });

  it("falls back to the start page when nothing usable was asked for", () => {
    for (const next of [null, undefined, "", "team", "https://evil.example/", "javascript:alert(1)"]) expect(safeReturnPath(next)).toBe("/");
  });

  it("refuses addresses a browser would take off the site", () => {
    for (const next of ["//evil.example", "/\\evil.example", "/\\/evil.example", "/\t/evil.example", "/\n/evil.example", "/%5Cevil.example".replace("%5C", "\\"), "/\u0000/evil.example"]) {
      expect(safeReturnPath(next), JSON.stringify(next)).toBe("/");
    }
  });

  it("keeps an encoded backslash as text in the path, which never leaves the site", () => {
    expect(safeReturnPath("/%5Cevil.example")).toBe("/%5Cevil.example");
  });
});

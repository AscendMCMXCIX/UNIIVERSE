import { describe, expect, it } from "vitest";
import { displayNameProblem, normaliseDisplayName } from "./display-name";

describe("display names", () => {
  it("trims and collapses spaces", () => {
    expect(normaliseDisplayName("  Faker   Fan ")).toBe("Faker Fan");
  });
  it("accepts ordinary names, any letters, punctuation and emoji", () => {
    for (const name of ["Jo", "Ascend", "ミッド", "Ö'Brien-Smith", "Mid ★ Main", "the.jungler_99"]) expect(displayNameProblem(name)).toBeNull();
  });
  it("needs 2 to 32 characters", () => {
    expect(displayNameProblem(" a ")).toMatch(/2 characters/);
    expect(displayNameProblem("x".repeat(32))).toBeNull();
    expect(displayNameProblem("x".repeat(33))).toMatch(/32 characters/);
  });
  it("refuses invisible and control characters, and names without a letter or digit", () => {
    expect(displayNameProblem("Ad​min")).toMatch(/visible/);
    expect(displayNameProblem("abc‮def")).toMatch(/visible/);
    expect(displayNameProblem("a\u0007b")).toMatch(/visible/);
    expect(displayNameProblem("-- !!")).toMatch(/letter or digit/);
  });
});

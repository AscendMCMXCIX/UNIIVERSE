import { describe, expect, it } from "vitest";
import { byDisplayName, displayNameProblem, normaliseDisplayName } from "./display-name";

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

describe("alphabetical order by display name", () => {
  const order = (names: Array<[string, string]>) => names.map(([name, id]) => ({ name, id })).sort(byDisplayName((p) => p.name, (p) => p.id)).map((p) => `${p.name}/${p.id}`);

  it("ignores case and accents, and reads numbers as numbers", () => {
    expect(order([["zoe", "1"], ["Ámélie", "2"], ["bob", "3"], ["Alex", "4"], ["Player 10", "5"], ["Player 2", "6"]])).toEqual(["Alex/4", "Ámélie/2", "bob/3", "Player 2/6", "Player 10/5", "zoe/1"]);
  });

  it("is the same whatever order the names arrive in, even for equal names", () => {
    const names: Array<[string, string]> = [["Sam", "b"], ["sam", "a"], ["Sam", "a"], ["Såm", "c"], [" Sam ", "d"]];
    const once = order(names);
    expect(order([...names].reverse())).toEqual(once);
    // Equal under the loose rules: exact spelling first ("sam" < "Sam" < "Såm"), then the id; the
    // name is compared as shown (" Sam " is "Sam").
    expect(once).toEqual(["sam/a", "Sam/a", "Sam/b", " Sam /d", "Såm/c"]);
  });
});

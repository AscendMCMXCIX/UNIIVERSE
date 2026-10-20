import { describe, expect, it } from "vitest";
import { largestMultikill, multikillsOfGames, parseMultikills } from "./multikills";

describe("parseMultikills", () => {
  it("reads the stored short form", () => {
    expect(parseMultikills(null)).toBeNull();
    expect(parseMultikills(undefined)).toBeNull();
    expect(parseMultikills("")).toEqual({ double: 0, triple: 0, quadra: 0, penta: 0 });
    expect(parseMultikills("2,1,0,0")).toEqual({ double: 2, triple: 1, quadra: 0, penta: 0 });
    expect(parseMultikills("1,1,1,1")).toEqual({ double: 1, triple: 1, quadra: 1, penta: 1 });
  });

  it("never turns a malformed value into a count", () => {
    expect(parseMultikills("x,-1,1.5,")).toEqual({ double: 0, triple: 0, quadra: 0, penta: 0 });
  });
});

describe("multikillsOfGames", () => {
  it("adds up only the games whose record has counts, and says how many those are", () => {
    const s = multikillsOfGames([{ multikills: "2,1,0,0" }, { multikills: "" }, { multikills: null }, {}, { multikills: "1,0,0,1" }]);
    expect(s).toEqual({ games: 5, counted: 3, double: 3, triple: 1, quadra: 0, penta: 1 });
  });

  it("is empty, not zero-filled, without games", () => {
    expect(multikillsOfGames([])).toEqual({ games: 0, counted: 0, double: 0, triple: 0, quadra: 0, penta: 0 });
  });
});

describe("largestMultikill", () => {
  it("uses Riot's largest multikill when sent", () => {
    expect(largestMultikill({ largestMultiKill: 1, doubleKills: 0 })).toBeNull();
    expect(largestMultikill({ largestMultiKill: 2 })).toBe(2);
    expect(largestMultikill({ largestMultiKill: 3, doubleKills: 1, tripleKills: 1 })).toBe(3);
    expect(largestMultikill({ largestMultiKill: 5 })).toBe(5);
  });

  it("falls back to the largest kind with a count", () => {
    expect(largestMultikill({ doubleKills: 2, tripleKills: 0 })).toBe(2);
    expect(largestMultikill({ doubleKills: 1, quadraKills: 1 })).toBe(4);
    expect(largestMultikill({ pentaKills: 1 })).toBe(5);
    expect(largestMultikill({})).toBeNull();
    expect(largestMultikill(null)).toBeNull();
  });
});

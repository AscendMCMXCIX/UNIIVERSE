import { describe, expect, it } from "vitest";
import { largestMultikill, multikillCoverage, multikillsByChampion, multikillsOfGames, parseMultikills } from "./multikills";

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

  it("reads a game whose record will never have counts as no counts, not zeros", () => {
    expect(parseMultikills("-")).toBeNull();
  });
});

describe("multikillsOfGames", () => {
  it("adds up only the games whose record has counts, and says how many those are", () => {
    const s = multikillsOfGames([{ multikills: "2,1,0,0" }, { multikills: "" }, { multikills: null }, {}, { multikills: "1,0,0,1" }]);
    expect(s).toEqual({ games: 5, counted: 3, unavailable: 0, double: 3, triple: 1, quadra: 0, penta: 1 });
  });

  it("tells the games still to be fetched from those that will never have counts", () => {
    const s = multikillsOfGames([{ multikills: "1,0,0,0" }, { multikills: "-" }, { multikills: "-" }, { multikills: null }]);
    expect(s).toEqual({ games: 4, counted: 1, unavailable: 2, double: 1, triple: 0, quadra: 0, penta: 0 });
  });

  it("is empty, not zero-filled, without games", () => {
    expect(multikillsOfGames([])).toEqual({ games: 0, counted: 0, unavailable: 0, double: 0, triple: 0, quadra: 0, penta: 0 });
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

describe("multikillsByChampion", () => {
  it("lists the champions with multikills, the biggest first, without those that have none", () => {
    const games = [
      { championId: "Jinx", multikills: "3,1,0,0" },
      { championId: "Jinx", multikills: "1,0,0,0" },
      { championId: "Ahri", multikills: "1,1,1,1" },
      { championId: "Thresh", multikills: "" },
      { championId: "Riven", multikills: null },
      { championId: "Riven", multikills: "-" },
      { championId: "Zed", multikills: "2,0,0,0" },
    ];
    expect(multikillsByChampion(games).map((c) => [c.championId, c.multikills.double, c.multikills.triple, c.multikills.quadra, c.multikills.penta, c.multikills.counted])).toEqual([
      ["Ahri", 1, 1, 1, 1, 1],
      ["Jinx", 4, 1, 0, 0, 2],
      ["Zed", 2, 0, 0, 0, 1],
    ]);
    expect(multikillsByChampion(games, 1)).toHaveLength(1);
  });
});

describe("multikillCoverage", () => {
  const summary = (games: number, counted: number, unavailable = 0) => ({ games, counted, unavailable, double: 0, triple: 0, quadra: 0, penta: 0 });

  it("never presents a partial total as the whole: 50 of 1,103 games say so, and why", () => {
    const c = multikillCoverage(summary(1103, 50));
    expect(c.state).toBe("partial");
    expect(c.label).toBe("From 50 of 1,103 games");
    expect(c.note).toBe("The other 1,053 games' counts are still being fetched from Riot (a few each hour), so these totals are not complete yet.");
  });

  it("says when every game has counts, with no note", () => {
    expect(multikillCoverage(summary(589, 589))).toEqual({ state: "complete", label: "From all 589 games", note: null });
    expect(multikillCoverage(summary(1, 1)).label).toBe("From all 1 game");
  });

  it("tells games Riot no longer provides from games still to come, once nothing is left to fetch", () => {
    expect(multikillCoverage(summary(100, 90, 10))).toEqual({ state: "partial", label: "From 90 of 100 games", note: "Riot no longer provides the records of 10 games, so they are left out." });
    expect(multikillCoverage(summary(100, 0, 1)).note).toBe("99 of them are still being fetched from Riot, a few each hour. Riot no longer provides the record of 1 game, so it is left out.");
  });

  it("has a plain label when no game has counts yet, and never says \"yet\" when none ever will", () => {
    expect(multikillCoverage(summary(12, 0))).toEqual({ state: "none", label: "No counts yet for these 12 games", note: "Their counts are still being fetched from Riot, a few each hour." });
    expect(multikillCoverage(summary(3, 0, 3))).toEqual({ state: "none", label: "No counts for these 3 games", note: "Riot no longer provides the records of 3 games, so they are left out." });
  });
});

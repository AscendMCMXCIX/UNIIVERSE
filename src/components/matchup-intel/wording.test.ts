import { describe, expect, it } from "vitest";
import { abilityAnchor, abilityName, cooldownWords, freshnessWords, recastWords } from "./wording";

describe("the cooldown line", () => {
  it("writes Data Dragon's base cooldown per rank, and the same value once", () => {
    expect(cooldownWords({ kind: "per-rank", seconds: [18, 17, 16, 15, 14], starts: null, from: "ddragon" })).toEqual({ value: "18 / 17 / 16 / 15 / 14 s", notes: [], known: true });
    expect(cooldownWords({ kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: null, from: "ddragon" }).value).toBe("13 s at every rank");
  });

  it("says when a cooldown starts, if a source says so and it is not the ordinary on cast", () => {
    expect(cooldownWords({ kind: "per-rank", seconds: [13, 13, 13, 13, 13], starts: "after-first-cast", from: "curated" }).notes).toEqual(["starts after the first cast"]);
    expect(cooldownWords({ kind: "per-rank", seconds: [8, 7, 6, 5, 4], starts: "on-cast", from: "curated" }).notes).toEqual([]);
    expect(cooldownWords({ kind: "per-rank", seconds: [20, 18, 16, 14, 12], starts: "after-effect-ends", from: "curated" }).notes).toEqual(["starts when the effect ends"]);
  });

  it("gives charges with their recharge, or says Riot's data has none", () => {
    expect(cooldownWords({ kind: "charges", charges: 2, recharge: [20, 18, 16, 14, 12], betweenCasts: 2, from: "curated" })).toEqual({ value: "2 charges", notes: ["one back every 20 / 18 / 16 / 14 / 12 s", "2 s between casts"], known: true });
    expect(cooldownWords({ kind: "charges", charges: 3, recharge: null, betweenCasts: 0.25, from: "ddragon" })).toEqual({ value: "3 charges", notes: ["recharge not in Riot's data", "0.25 s between casts"], known: true });
    expect(cooldownWords({ kind: "charges", charges: 1, recharge: null, betweenCasts: null, from: "ddragon" }).value).toBe("1 charge");
  });

  it("gives a passive's own cooldown by level or rank, and never a passive's missing one as none", () => {
    expect(cooldownWords({ kind: "passive", seconds: [12, 9, 6], scalesWith: "level", levels: [1, 7, 13] })).toEqual({ value: "12 / 9 / 6 s", notes: ["at levels 1 / 7 / 13"], known: true });
    expect(cooldownWords({ kind: "passive", seconds: [10], scalesWith: "none", levels: null })).toEqual({ value: "10 s", notes: [], known: true });
    expect(cooldownWords({ kind: "passive", seconds: [30, 25, 20], scalesWith: "rank", levels: null })).toEqual({ value: "30 / 25 / 20 s", notes: ["by its rank"], known: true });
    expect(cooldownWords({ kind: "passive", seconds: [6, 6, 6], scalesWith: "level", levels: [1, 6, 11] }).value).toBe("6 s at every level");
    expect(cooldownWords({ kind: "unknown", reason: "passive-not-in-ddragon" })).toEqual({ value: "Cooldown not in Riot's data", notes: [], known: false });
  });

  it("says plainly when there is no number, never a guess", () => {
    expect(cooldownWords({ kind: "none" })).toEqual({ value: "No cooldown", notes: [], known: true });
    expect(cooldownWords({ kind: "unknown", reason: "no-number-in-ddragon" }).value).toBe("No fixed cooldown in Riot's data");
    expect(cooldownWords({ kind: "unknown", reason: "no-data" }).known).toBe(false);
    expect(cooldownWords({ kind: "per-rank", seconds: [], starts: null, from: "curated" })).toEqual({ value: "—", notes: [], known: false });
  });
});

describe("the rest of the page's words", () => {
  it("names recasts, abilities and their rows", () => {
    expect(recastWords({ count: 2, windowSeconds: 4, note: "" })).toBe("Can be cast 2 more times within 4 s");
    expect(recastWords({ count: 1, note: "" })).toBe("Can be cast again");
    expect(abilityName("Renekton", "W")).toBe("Renekton W");
    expect(abilityName("Riven", "P")).toBe("Riven passive");
    expect(abilityAnchor("Renekton", "W")).toBe("ability-Renekton-W");
  });

  it("says when notes were checked, and warns only when Riot's numbers moved after the check", () => {
    expect(freshnessWords("current", "26.22")).toEqual({ checked: "Checked on patch 26.22", warning: null });
    expect(freshnessWords("unchanged-since", "26.21")).toEqual({ checked: "Checked on patch 26.21", warning: null });
    expect(freshnessWords("changed-since", "26.21")).toEqual({ checked: "Checked on patch 26.21", warning: "Riot's numbers for these abilities changed after the check: may be out of date" });
  });
});

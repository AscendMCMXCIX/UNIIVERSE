import { describe, expect, it } from "vitest";
import type { OverviewCard } from "@/server/players/overview";
import { gamesShare, sortChampions, summaryPairs } from "./all-champions";

const card = (championId: string, games: number, winRate: number | null, mastery: number | null, kda: number | null = null): OverviewCard =>
  ({ championId, role: "MID", selected: { games, winRate }, performance: { kdaRatio: kda, csPerMinute: null }, mastery: mastery === null ? null : { points: mastery } }) as unknown as OverviewCard;
const rows = [card("Ahri", 10, 0.6, 50_000, 3), card("Zed", 0, null, null), card("Azir", 4, 0.25, 900_000, 2.5), card("Lux", 10, 0.5, 120_000, null)];
const names = (r: OverviewCard[]) => r.map((c) => c.championId);
const nameOf = (id: string) => id;

describe("All Champions sorting", () => {
  it("sorts both ways by champion name", () => {
    expect(names(sortChampions(rows, "champion", "asc", nameOf))).toEqual(["Ahri", "Azir", "Lux", "Zed"]);
    expect(names(sortChampions(rows, "champion", "desc", nameOf))).toEqual(["Zed", "Lux", "Azir", "Ahri"]);
  });
  it("breaks equal values by name and keeps missing figures last in either direction", () => {
    expect(names(sortChampions(rows, "games", "desc", nameOf))).toEqual(["Ahri", "Lux", "Azir", "Zed"]);
    expect(names(sortChampions(rows, "games", "asc", nameOf))).toEqual(["Zed", "Azir", "Ahri", "Lux"]);
    // Zed has no games: no win rate, so it is last both ways (never above a real 60%).
    expect(names(sortChampions(rows, "win", "desc", nameOf))).toEqual(["Ahri", "Lux", "Azir", "Zed"]);
    expect(names(sortChampions(rows, "win", "asc", nameOf))).toEqual(["Azir", "Lux", "Ahri", "Zed"]);
    expect(names(sortChampions(rows, "kda", "asc", nameOf)).slice(-2).sort()).toEqual(["Lux", "Zed"]);
  });
  it("sorts total kills both ways, a champion without counts last either way", () => {
    const kills = (championId: string, totalKills: number | null) => ({ championId, role: "MID", selected: { games: 3, winRate: 0.5 }, performance: { kdaRatio: 2, csPerMinute: null, totalKills, detailedGames: totalKills === null ? 0 : 3 }, mastery: null }) as unknown as OverviewCard;
    const list = [kills("Ahri", 21), kills("Zed", null), kills("Azir", 40), kills("Lux", 0)];
    expect(names(sortChampions(list, "kills", "desc", nameOf))).toEqual(["Azir", "Ahri", "Lux", "Zed"]);
    expect(names(sortChampions(list, "kills", "asc", nameOf))).toEqual(["Lux", "Ahri", "Azir", "Zed"]);
  });
  it("sorts mastery points both ways", () => {
    expect(names(sortChampions(rows, "mastery", "desc", nameOf))).toEqual(["Azir", "Lux", "Ahri", "Zed"]);
    expect(names(sortChampions(rows, "mastery", "asc", nameOf))).toEqual(["Ahri", "Lux", "Azir", "Zed"]);
  });
});

/*
  The phone rows' labelled figures. Sorted by champion, games or win rate the pairs are exactly as
  they were before the sorted pair moved first (the expected strings below are the old output); sorted
  by one of them, that pair leads, unchanged, and the rest keep their order.
*/
const full = (over: Partial<{ kda: number | null; perfect: boolean; cs: number | null; kills: number | null; detailed: number; games: number; multikills: Partial<OverviewCard["multikills"]> | null; mastery: number | null }> = {}): OverviewCard => {
  const o = { kda: 2.744, perfect: false, cs: 7.94, kills: 70, detailed: 14, games: 14, mastery: 427_500, ...over };
  return {
    championId: "Gwen",
    role: "TOP",
    selected: { games: o.games, wins: 4, losses: o.games - 4, winRate: 4 / o.games },
    performance: { kdaRatio: o.kda, perfectKda: o.perfect, csPerMinute: o.cs, totalKills: o.kills, detailedGames: o.detailed },
    multikills: over.multikills === null ? undefined : { games: o.games, counted: o.games, unavailable: 0, double: 14, triple: 1, quadra: 0, penta: 0, ...over.multikills },
    mastery: o.mastery === null ? null : { points: o.mastery },
  } as unknown as OverviewCard;
};
const text = (pairs: ReturnType<typeof summaryPairs>) => pairs.map((p) => `${p.label} ${p.value}${p.sorted ? " (sorted)" : ""}`);

describe("All Champions phone pairs", () => {
  it("are byte-identical to the old pairs, in the old order, when the sort is not one of them", () => {
    const before = ["KDA 2.74", "CS/min 7.9", "Kills 70", "Multikills 1 triple", "Mastery 428K"];
    for (const key of ["games", "win", "champion"] as const) expect(text(summaryPairs(full(), key))).toEqual(before);
    // The old forms of missing and partial figures: dashes, "Perfect", "*" from some games, no Multikills pair without games to count in.
    expect(text(summaryPairs(full({ perfect: true, cs: null, kills: null, detailed: 0, mastery: null, multikills: { counted: 0 } }), "games"))).toEqual(["KDA Perfect", "CS/min —", "Kills —", "Multikills —", "Mastery —"]);
    expect(text(summaryPairs(full({ kda: null, kills: 21, detailed: 9, multikills: { counted: 9, double: 0, triple: 0 } }), "games"))).toEqual(["KDA —", "CS/min 7.9", "Kills 21*", "Multikills none*", "Mastery 428K"]);
    expect(text(summaryPairs(full({ multikills: null }), "games"))).toEqual(["KDA 2.74", "CS/min 7.9", "Kills 70", "Mastery 428K"]);
  });

  it("put the sorted pair first, marked, with the same value, the others in their order", () => {
    expect(text(summaryPairs(full(), "kills"))).toEqual(["Kills 70 (sorted)", "KDA 2.74", "CS/min 7.9", "Multikills 1 triple", "Mastery 428K"]);
    expect(text(summaryPairs(full(), "kda"))).toEqual(["KDA 2.74 (sorted)", "CS/min 7.9", "Kills 70", "Multikills 1 triple", "Mastery 428K"]);
    expect(text(summaryPairs(full(), "mastery"))).toEqual(["Mastery 428K (sorted)", "KDA 2.74", "CS/min 7.9", "Kills 70", "Multikills 1 triple"]);
    // The rarest multikill, and pentakills (the same order), lead with the Multikills pair.
    for (const key of ["multikills", "penta"] as const) expect(text(summaryPairs(full(), key))[0]).toBe("Multikills 1 triple (sorted)");
  });

  it("sorted by double, triple or quadra kills, lead with that kind's own count, a dash or * as the column has it", () => {
    expect(text(summaryPairs(full(), "double"))).toEqual(["Double kills 14 (sorted)", "KDA 2.74", "CS/min 7.9", "Kills 70", "Multikills 1 triple", "Mastery 428K"]);
    expect(text(summaryPairs(full({ multikills: { counted: 10 } }), "quadra"))[0]).toBe("Quadra kills 0* (sorted)");
    expect(text(summaryPairs(full({ multikills: { counted: 0 } }), "triple"))[0]).toBe("Triple kills — (sorted)");
    // No games to count multikills in: neither the kind nor the Multikills pair.
    expect(text(summaryPairs(full({ multikills: null }), "double"))).toEqual(["KDA 2.74", "CS/min 7.9", "Kills 70", "Mastery 428K"]);
  });
});

describe("All Champions games share", () => {
  it("is a champion's games over every game in the filters, 0 without any", () => {
    expect(gamesShare(14, 36)).toBeCloseTo(0.3889, 4);
    expect(gamesShare(36, 36)).toBe(1);
    expect(gamesShare(0, 36)).toBe(0);
    expect(gamesShare(3, 0)).toBe(0);
    // Never past the whole bar, whatever it is given.
    expect(gamesShare(40, 36)).toBe(1);
  });
});

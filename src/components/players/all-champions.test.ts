import { describe, expect, it } from "vitest";
import type { ChampionRow } from "@/server/players/overview";
import { PANE_COLUMN_OPEN, PANE_COLUMN_SHOWN, PANE_ROOM_REM, WS_PANE_SECTION_REM, closesWorkspaceWindow, gamesShare, paneFits, shareWords, sortChampions, summaryPairs } from "./all-champions";

const card = (championId: string, games: number, winRate: number | null, mastery: number | null, kda: number | null = null): ChampionRow =>
  ({ championId, role: "MID", selected: { games, winRate }, performance: { kdaRatio: kda, csPerMinute: null }, mastery: mastery === null ? null : { points: mastery } }) as unknown as ChampionRow;
const rows = [card("Ahri", 10, 0.6, 50_000, 3), card("Zed", 0, null, null), card("Azir", 4, 0.25, 900_000, 2.5), card("Lux", 10, 0.5, 120_000, null)];
const names = (r: ChampionRow[]) => r.map((c) => c.championId);
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
    const kills = (championId: string, totalKills: number | null) => ({ championId, role: "MID", selected: { games: 3, winRate: 0.5 }, performance: { kdaRatio: 2, csPerMinute: null, totalKills, detailedGames: totalKills === null ? 0 : 3 }, mastery: null }) as unknown as ChampionRow;
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
const full = (over: Partial<{ kda: number | null; perfect: boolean; cs: number | null; kills: number | null; detailed: number; games: number; multikills: Partial<ChampionRow["multikills"]> | null; mastery: number | null }> = {}): ChampionRow => {
  const o = { kda: 2.744, perfect: false, cs: 7.94, kills: 70, detailed: 14, games: 14, mastery: 427_500, ...over };
  return {
    championId: "Gwen",
    role: "TOP",
    selected: { games: o.games, wins: 4, losses: o.games - 4, winRate: 4 / o.games },
    performance: { kdaRatio: o.kda, perfectKda: o.perfect, csPerMinute: o.cs, totalKills: o.kills, detailedGames: o.detailed },
    multikills: over.multikills === null ? undefined : { games: o.games, counted: o.games, unavailable: 0, double: 14, triple: 1, quadra: 0, penta: 0, ...over.multikills },
    mastery: o.mastery === null ? null : { points: o.mastery },
  } as unknown as ChampionRow;
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

describe("All Champions games share in words", () => {
  it("is a whole percent, but never 0% or 100% for a share that is neither", () => {
    expect(shareWords(gamesShare(14, 36))).toBe("39%");
    expect(shareWords(gamesShare(1, 250))).toBe("under 1%");
    expect(shareWords(gamesShare(1, 199))).toBe("1%");
    expect(shareWords(gamesShare(249, 250))).toBe("over 99%");
    expect(shareWords(gamesShare(36, 36))).toBe("100%");
    expect(shareWords(gamesShare(0, 36))).toBe("0%");
    expect(shareWords(gamesShare(0, 0))).toBe("0%");
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

describe("All Champions' pane and its windows", () => {
  // The first paint (the server's HTML and the hydration render) draws the pane's column where the CSS's bounds allow;
  // once hydrated the page decides (paneFits) and the column it opens is drawn whatever the container queries say, so the
  // two never disagree: until 28 Nov 2026 the page compared the section's rounded width with each bound less half a pixel,
  // and a section in that half pixel (an 18px root at 1525px with the sidebar open: 1165 of 1165.5) opened a pane the
  // container query hid, nothing of the champion showing.
  it("draws the first paint's column from the two bounds, the flow's on the nearest container and the workspace's on the section, and the hydrated column wherever the page opened it", () => {
    expect(PANE_ROOM_REM).toBe(47.5);
    expect(WS_PANE_SECTION_REM).toBe(64.75);
    const classes = PANE_COLUMN_SHOWN.split(" ");
    expect(classes[0], "hidden until a bound is met").toBe("hidden");
    expect(classes).toContain(`md:[@media(min-height:30.0625rem)]:@min-[${PANE_ROOM_REM}rem]:block`);
    expect(classes).toContain("ws:hidden!");
    expect(classes).toContain(`ws:@min-[${WS_PANE_SECTION_REM}rem]/section:flex!`);
    expect(classes).toHaveLength(4);
    expect(PANE_COLUMN_OPEN, "no bound: the page decided").not.toMatch(/@min|hidden/);
  });

  // The page's own scrollbar takes width from the section, and what the page holds decides whether it is there: until
  // 28 Nov 2026 (classic scrollbars) a pane that made the page scroll narrowed the section under its bound, the column went,
  // the sheet left the page short again, the scrollbar went and the pane came back, every 140ms or so (Demo ADC at 1085 × 768
  // with the sidebar open: 765px with no scrollbar, 755 with it). The room is the section with the page's scrollbar given
  // back, so the answer is one whether or not the page scrolls; the flow allows for the scrollbar it may bring.
  it("opens the pane from the section's room, the flow allowing for the page's scrollbar and the workspace for none", () => {
    const flow = (room: number, bar = 0, root = 16) => paneFits({ room, bar, root, workspace: false });
    const ws = (room: number, bar = 0, root = 16) => paneFits({ room, bar, root, workspace: true });
    // Overlay scrollbars (phones, tablets, a Mac's default, Playwright's hidden ones): the bound itself, to the fraction.
    expect(flow(760)).toBe(true);
    expect(flow(759.98)).toBe(false);
    expect(ws(1036)).toBe(true);
    expect(ws(1035.5625)).toBe(false);
    // A classic scrollbar (10px): the flow's pane holds 47.5rem with it in the section, so from a room of 770.
    expect(flow(765, 10), "Demo ADC at 1085 × 768: the sheet, scrolling or not").toBe(false);
    expect(flow(769.9, 10)).toBe(false);
    expect(flow(770, 10), "1090 × 768: the pane, scrolling or not").toBe(true);
    // The workspace never scrolls: no allowance, so the owner's 1366 × 768 with the sidebar open (1046) keeps its pane.
    expect(ws(1036, 10)).toBe(true);
    expect(ws(1046, 17)).toBe(true);
    // The root's size scales both bounds (an 18px root: 855 and 1165.5).
    expect(flow(855, 0, 18)).toBe(true);
    expect(flow(865, 10, 18)).toBe(true);
    expect(flow(864, 10, 18)).toBe(false);
    expect(ws(1166, 10, 18)).toBe(true);
    expect(ws(1165, 0, 18)).toBe(false);
  });

  // Escape goes innermost first (an opponent's games back to the grid, then the window); every other request closes it at
  // once, opponent and all, as the sheet's did: until 28 Nov 2026 a click on the dimmed page around the workspace window with
  // an opponent open only went back to the grid.
  it("the workspace window goes back a step on Escape alone", () => {
    expect(closesWorkspaceWindow("escape", true)).toBe(false);
    expect(closesWorkspaceWindow("escape", false)).toBe(true);
    for (const via of ["backdrop", "button", "drag", "control"] as const) {
      expect(closesWorkspaceWindow(via, true), via).toBe(true);
      expect(closesWorkspaceWindow(via, false), via).toBe(true);
    }
  });
});

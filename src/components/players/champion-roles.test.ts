import { describe, expect, it } from "vitest";
import type { ChampionRow } from "@/server/players/overview";
import { positionsWords, roleAtPoint, roleFigures, roleRecordWords, type MarkBox } from "./champion-roles";
import { selectionFor } from "./preview-data";

/*
  All Champions' positions (25 Nov 2026): which position a preview shows, whose figures it reads,
  and how a position's record is said (the icon's tooltip and accessible name).
*/

const perf = (games: number) => ({ games, kdaRatio: games }) as unknown as ChampionRow["performance"];
const record = (games: number, wins: number) => ({ games, wins, losses: games - wins, winRate: games ? wins / games : null, lastPlayedAt: null });
const row = (championId: string, roles: ChampionRow["roles"], noRole = 0): ChampionRow =>
  ({ championId, role: roles[0]?.role ?? null, roles, noRole, poolRoles: [], selected: record(roles.reduce((s, r) => s + r.games, 0) + noRole, 3), performance: perf(99), multikills: undefined, mastery: null }) as unknown as ChampionRow;
const gwen = row("Gwen", [
  { role: "TOP", games: 4, wins: 3, figures: { selected: record(4, 3), performance: perf(4), multikills: { games: 4, counted: 4, unavailable: 0, double: 1, triple: 0, quadra: 0, penta: 0 } } },
  { role: "JUNGLE", games: 1, wins: 0, figures: { selected: record(1, 0), performance: perf(1), multikills: { games: 1, counted: 0, unavailable: 0, double: 0, triple: 0, quadra: 0, penta: 0 } } },
], 1);
const syndra = row("Syndra", [{ role: "MID", games: 2, wins: 1 }]);
const teemo = row("Teemo", [], 2);

describe("the position a preview shows (selectionFor)", () => {
  it("is the address's where the champion was played in it, else its most played", () => {
    expect(selectionFor([gwen, syndra], { championId: "Gwen", role: "JUNGLE", vs: null })).toEqual({ row: gwen, role: "JUNGLE" });
    expect(selectionFor([gwen, syndra], { championId: "Gwen", role: "SUPPORT", vs: null })).toEqual({ row: gwen, role: "TOP" });
    expect(selectionFor([gwen, syndra], { championId: "Gwen", role: null, vs: null })).toEqual({ row: gwen, role: "TOP" });
  });
  it("is none for a champion no game of which records a position, and null for a champion not on the list", () => {
    expect(selectionFor([teemo], { championId: "Teemo", role: "TOP", vs: null })).toEqual({ row: teemo, role: null });
    expect(selectionFor([gwen], { championId: "Zed", role: "MID", vs: null })).toBeNull();
  });
});

describe("a position's figures (roleFigures)", () => {
  it("are its own where the row sends them, the row's where it has one position and no game without one", () => {
    expect(roleFigures(gwen, "JUNGLE")!.selected).toMatchObject({ games: 1, wins: 0 });
    expect(roleFigures(gwen, "TOP")!.performance.games).toBe(4);
    expect(roleFigures(syndra, "MID")!.performance).toBe(syndra.performance);
  });
  it("are none for a position the row does not hold, or no position", () => {
    expect(roleFigures(gwen, "MID")).toBeNull();
    expect(roleFigures(teemo, null)).toBeNull();
  });
});

describe("a position's record in words", () => {
  it("says the games, the win rate and the record", () => {
    expect(roleRecordWords({ games: 12, wins: 7 })).toBe("12 games · 58% win rate · 7W 5L");
    expect(roleRecordWords({ games: 1, wins: 0 })).toBe("1 game · 0% win rate · 0W 1L");
    expect(roleRecordWords({ games: 0, wins: 0 })).toBe("0 games");
  });
});

describe("a tap on a touch screen's position marks (roleAtPoint; the 25 Nov 2026 review)", () => {
  // Five 14px marks 2px apart on one line, from x=100, y=50 to 64 (as champion-roles.tsx draws them).
  const roles = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;
  const marks: MarkBox[] = roles.map((role, i) => ({ role, left: 100 + i * 16, right: 114 + i * 16, top: 50, bottom: 64 }));
  it("honours the mark tapped, each widened by half the gap on each side", () => {
    expect(roleAtPoint(marks, 107, 57)).toBe("TOP");
    expect(roleAtPoint(marks, 123, 57)).toBe("JUNGLE");
    // The 2px gap between Top (100–114) and Jungle (116–130): its first half Top's, its second Jungle's.
    expect(roleAtPoint(marks, 114.5, 57)).toBe("TOP");
    expect(roleAtPoint(marks, 115.5, 57)).toBe("JUNGLE");
    expect(roleAtPoint(marks, 171, 57)).toBe("SUPPORT");
    // The outer marks by the same half gap.
    expect(roleAtPoint(marks, 99.2, 57)).toBe("TOP");
    expect(roleAtPoint(marks, 178.8, 57)).toBe("SUPPORT");
  });
  it("counts a tap a little above or below a mark (6px), and nothing further: the row's own target (the most played position)", () => {
    expect(roleAtPoint(marks, 140, 45)).toBe("MID");
    expect(roleAtPoint(marks, 140, 70)).toBe("MID");
    expect(roleAtPoint(marks, 140, 40)).toBeNull();
    expect(roleAtPoint(marks, 140, 75)).toBeNull();
    expect(roleAtPoint(marks, 95, 57)).toBeNull();
    expect(roleAtPoint(marks, 190, 57)).toBeNull();
    expect(roleAtPoint([], 107, 57)).toBeNull();
  });
  it("never widens a mark by more than 4px, and copes with marks wrapped onto a second line", () => {
    const apart: MarkBox[] = [{ role: "TOP", left: 100, right: 114, top: 50, bottom: 64 }, { role: "MID", left: 134, right: 148, top: 50, bottom: 64 }];
    expect(roleAtPoint(apart, 119, 57)).toBeNull();
    expect(roleAtPoint(apart, 117.5, 57)).toBe("TOP");
    const wrapped: MarkBox[] = [{ role: "TOP", left: 200, right: 214, top: 50, bottom: 64 }, { role: "MID", left: 100, right: 114, top: 70, bottom: 84 }];
    expect(roleAtPoint(wrapped, 207, 57)).toBe("TOP");
    expect(roleAtPoint(wrapped, 107, 80)).toBe("MID");
  });
});

describe("the marks' words for screen readers", () => {
  it("say each position's games, win rate and record, as a mouse's tooltip does", () => {
    expect(positionsWords(gwen.roles)).toBe("Top: 4 games · 75% win rate · 3W 1L; Jungle: 1 game · 0% win rate · 0W 1L");
  });
});

import { describe, expect, it } from "vitest";
import { filterTogether, groupPlayedTogether, type TogetherRow } from "./played-together";

const names: Record<string, string> = { ace: "Ace", bea: "Bea", cy: "Cy", dee: "Dee" };
const nameOf = (id: string) => names[id] ?? id;
let t = 1000;
const row = (matchId: string, playerId: string, teamId: number | null, over: Partial<TogetherRow> = {}): TogetherRow => ({ matchId, playerId, teamId, queueId: 440, gameCreation: t, durationS: 1800, win: teamId === 100, championId: "Ahri", role: "MID", kills: 1, deaths: 1, assists: 1, cs: 100, damage: 1000, vision: 10, ...over });

describe("played together", () => {
  it("finds two or more members on the same side, newest first, in role order", () => {
    t = 1000;
    const rows = [row("M1", "ace", 100, { role: "SUPPORT" }), row("M1", "bea", 100, { role: "TOP" }), row("M1", "cy", 100, { role: "MID" }), row("M2", "ace", 200, { gameCreation: 5000 }), row("M2", "dee", 200, { gameCreation: 5000 })];
    const { games, pairs } = groupPlayedTogether(rows, nameOf);
    expect(games.map((g) => [g.matchId, g.members.length])).toEqual([
      ["M2", 2],
      ["M1", 3],
    ]);
    expect(games[1]!.members.map((m) => m.playerId)).toEqual(["bea", "cy", "ace"]);
    expect(pairs.find((p) => p.a === "ace" && p.b === "bea")).toMatchObject({ games: 1, wins: 1 });
    expect(pairs).toHaveLength(4);
  });

  it("never counts members on opposite sides as teammates, and names them separately", () => {
    const rows = [row("M3", "ace", 100), row("M3", "bea", 200)];
    expect(groupPlayedTogether(rows, nameOf).games).toEqual([]);
    const three = [row("M4", "ace", 100), row("M4", "bea", 100), row("M4", "cy", 200)];
    const g = groupPlayedTogether(three, nameOf).games;
    expect(g).toHaveLength(1);
    expect(g[0]!.members.map((m) => m.playerId).sort()).toEqual(["ace", "bea"]);
    expect(g[0]!.opponents).toEqual(["Cy"]);
  });

  it("counts one person once however many of their accounts were in the game", () => {
    const rows = [row("M5", "ace", 100), row("M5", "ace", 100, { championId: "Zed" })];
    expect(groupPlayedTogether(rows, nameOf).games).toEqual([]);
    const withBea = [...rows, row("M5", "bea", 100)];
    expect(groupPlayedTogether(withBea, nameOf).games[0]!.members).toHaveLength(2);
  });

  it("does not guess when the side is unknown (no stored match details)", () => {
    const rows = [row("M6", "ace", null), row("M6", "bea", 100)];
    const r = groupPlayedTogether(rows, nameOf);
    expect(r.games).toEqual([]);
    expect(r.unknownSide).toBe(1);
  });

  it("filters by queue, party size and member", () => {
    const rows = [row("A", "ace", 100, { queueId: 420 }), row("A", "bea", 100, { queueId: 420 }), row("B", "ace", 100), row("B", "bea", 100), row("B", "cy", 100)];
    const { games } = groupPlayedTogether(rows, nameOf);
    expect(filterTogether(games, { queues: [420], minMembers: 2, playerId: null }).map((g) => g.matchId)).toEqual(["A"]);
    expect(filterTogether(games, { queues: null, minMembers: 3, playerId: null }).map((g) => g.matchId)).toEqual(["B"]);
    expect(filterTogether(games, { queues: null, minMembers: 2, playerId: "cy" }).map((g) => g.matchId)).toEqual(["B"]);
  });
});

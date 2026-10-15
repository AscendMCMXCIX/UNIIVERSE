import { describe, expect, it } from "vitest";
import { suggestRiotMatches, timingScore, type LinkCandidateRow, type LinkableMatch } from "./match-link-suggestions";

const T0 = Date.UTC(2026, 9, 10, 18, 0);
const match: LinkableMatch = {
  playedAt: T0,
  side: "blue",
  mode: "ranked-flex",
  assignments: { TOP: "p1", JUNGLE: "p2", MID: "p3", ADC: "p4", SUPPORT: "p5" },
  ourPicks: [
    { playerId: "p1", role: "TOP", championId: "Ornn" },
    { playerId: "p2", role: "JUNGLE", championId: "Vi" },
    { playerId: "p3", role: "MID", championId: "Ahri" },
    { playerId: "p4", role: "ADC", championId: "Jinx" },
    { playerId: "p5", role: "SUPPORT", championId: "Nautilus" },
  ],
};

const ROLE = { p1: "TOP", p2: "JUNGLE", p3: "MID", p4: "ADC", p5: "SUPPORT" } as const;
function rows(matchId: string, opts: { at?: number; team?: number; queue?: number; players?: Array<keyof typeof ROLE>; champs?: Partial<Record<keyof typeof ROLE, string>> } = {}): LinkCandidateRow[] {
  const players = opts.players ?? (["p1", "p2", "p3", "p4", "p5"] as const);
  return players.map((p) => ({
    matchId,
    playerId: p,
    teamId: opts.team ?? 100,
    queueId: opts.queue ?? 440,
    gameCreation: opts.at ?? T0 + 3 * 60_000,
    durationS: 1800,
    win: true,
    championId: opts.champs?.[p] ?? match.ourPicks.find((x) => x.playerId === p)!.championId,
    role: ROLE[p],
  }));
}

describe("suggestRiotMatches", () => {
  it("ranks the game the draft became first and calls it strong", () => {
    const out = suggestRiotMatches(match, [...rows("EUW1_1"), ...rows("EUW1_2", { at: T0 + 3 * 3600_000, players: ["p1", "p2", "p3"], champs: { p1: "Garen", p2: "Lee Sin", p3: "Zed" } })]);
    expect(out[0]!.matchId).toBe("EUW1_1");
    expect(out[0]!.strength).toBe("strong");
    expect(out[0]!.championsMatched).toBe(5);
    expect(out[0]!.reasons[0]).toBe("5 of 5 lineup players");
    expect(out.map((s) => s.matchId)).not.toContain("EUW1_2");
  });

  it("never suggests a game with fewer than three lineup members, outside the window or excluded", () => {
    expect(suggestRiotMatches(match, rows("EUW1_1", { players: ["p1", "p2"] }))).toEqual([]);
    expect(suggestRiotMatches(match, rows("EUW1_1", { at: T0 + 7 * 3600_000 }))).toEqual([]);
    expect(suggestRiotMatches(match, rows("EUW1_1"), new Set(["EUW1_1"]))).toEqual([]);
  });

  it("ignores rows whose side is unknown", () => {
    expect(suggestRiotMatches(match, rows("EUW1_1").map((r) => ({ ...r, teamId: null })))).toEqual([]);
  });

  it("marks a game on the other side as possible at most, and says so", () => {
    const [s] = suggestRiotMatches(match, rows("EUW1_1", { team: 200 }));
    expect(s!.strength).toBe("possible");
    expect(s!.sameSide).toBe(false);
    expect(s!.reasons).toContain("played on the red side, not blue");
  });

  it("treats a queue that does not fit the mode as weaker evidence", () => {
    const [flex] = suggestRiotMatches(match, rows("EUW1_1"));
    const [normal] = suggestRiotMatches(match, rows("EUW1_1", { queue: 400 }));
    expect(normal!.score).toBeLessThan(flex!.score);
    expect(normal!.queueMatches).toBe(false);
  });

  it("returns nothing for a match without a lineup", () => {
    expect(suggestRiotMatches({ ...match, assignments: {} }, rows("EUW1_1"))).toEqual([]);
  });
});

describe("timingScore", () => {
  it("is full near the draft and zero at six hours", () => {
    expect(timingScore(5 * 60_000)).toBe(1);
    expect(timingScore(-15 * 60_000)).toBe(1);
    expect(timingScore(6 * 3600_000)).toBe(0);
    expect(timingScore(3 * 3600_000)).toBeGreaterThan(0);
  });
});

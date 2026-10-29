import { describe, expect, it } from "vitest";
import { largestMultikillOf, narrowsGames, NO_REFINE, patchOptions, readDay, readRefine, refineGames, refineParams, SESSION_GAP_MINUTES, sessionKeys, sessionSummaries, type MembersInGame } from "./history-refine";
import type { SeasonGame } from "./season-stats";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 20, 9, 0);
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let n = 0;
function game(over: Partial<SeasonGame> = {}): SeasonGame {
  n += 1;
  return { matchId: `OC1_${n}`, accountId: "a", queueId: 420, championId: "Ahri", role: "MIDDLE", win: true, patch: "16.20", gameCreation: T0 + n * 60 * MIN, kills: 5, deaths: 2, assists: 7, cs: 200, damage: 20_000, visionScore: 20, gameDuration: 1800, multikills: "", ...over };
}

describe("reading Refine from the address", () => {
  it("keeps what it can read and leaves out the rest", () => {
    expect(readRefine({})).toEqual(NO_REFINE);
    expect(readRefine({ result: "win", patch: "26.20", from: "2026-10-01", to: "2026-10-07", with: ALICE, hl: "triple", group: "sessions" })).toEqual({ result: "win", patch: "16.20", from: "2026-10-01", to: "2026-10-07", member: { side: "with", id: ALICE }, highlight: "triple", sessions: true });
    expect(readRefine({ result: "draw", patch: "latest", from: "2026-02-30", to: "yesterday", against: "bob", hl: "hexakill", group: "days" })).toEqual(NO_REFINE);
    expect(readRefine({ against: "any" }).member).toEqual({ side: "against", id: "any" });
  });

  it("swaps days given the wrong way round, and names only real days", () => {
    expect(readRefine({ from: "2026-10-09", to: "2026-10-02" })).toMatchObject({ from: "2026-10-02", to: "2026-10-09" });
    expect(readDay("2024-02-29")).toBe("2024-02-29");
    expect(readDay("2026-02-29")).toBeNull();
    expect(readDay("2026-1-5")).toBeNull();
  });

  it("writes the same choices back as parameters", () => {
    const r = readRefine({ result: "loss", patch: "16.19", to: "2026-10-07", against: BOB, hl: "best", group: "sessions" });
    expect(readRefine(refineParams(r))).toEqual(r);
    expect(refineParams(NO_REFINE)).toEqual({});
    expect(narrowsGames({ ...NO_REFINE, sessions: true })).toBe(false);
  });
});

describe("refining the games", () => {
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const none = new Map<string, MembersInGame>();
  const ctx = { dayOf, members: none, best: () => false };

  it("keeps wins or losses, never a game without a recorded result", () => {
    const games = [game({ win: true }), game({ win: false }), game({ win: null })];
    expect(refineGames(games, { ...NO_REFINE, result: "win" }, ctx).map((g) => g.win)).toEqual([true]);
    expect(refineGames(games, { ...NO_REFINE, result: "loss" }, ctx).map((g) => g.win)).toEqual([false]);
    expect(refineGames(games, NO_REFINE, ctx)).toHaveLength(3);
  });

  it("keeps one patch, whichever way it is named, and the days between two dates", () => {
    const a = game({ patch: "16.20", gameCreation: Date.UTC(2026, 9, 1, 12) });
    const b = game({ patch: "16.19", gameCreation: Date.UTC(2026, 9, 5, 12) });
    const c = game({ patch: null, gameCreation: Date.UTC(2026, 9, 8, 12) });
    expect(refineGames([a, b, c], readRefine({ patch: "26.20" }), ctx)).toEqual([a]);
    expect(refineGames([a, b, c], readRefine({ from: "2026-10-05" }), ctx)).toEqual([b, c]);
    expect(refineGames([a, b, c], readRefine({ from: "2026-10-01", to: "2026-10-05" }), ctx)).toEqual([a, b]);
  });

  it("keeps the games a team member played with the player, or against them, as the record places them", () => {
    const [a, b, c] = [game(), game(), game()];
    const members = new Map<string, MembersInGame>([
      [a.matchId, { with: [ALICE], against: [] }],
      [b.matchId, { with: [], against: [ALICE, BOB] }],
    ]);
    const withCtx = { ...ctx, members };
    expect(refineGames([a, b, c], readRefine({ with: ALICE }), withCtx)).toEqual([a]);
    expect(refineGames([a, b, c], readRefine({ against: ALICE }), withCtx)).toEqual([b]);
    expect(refineGames([a, b, c], readRefine({ with: "any" }), withCtx)).toEqual([a]);
    expect(refineGames([a, b, c], readRefine({ against: "any" }), withCtx)).toEqual([b]);
    expect(refineGames([a, b, c], readRefine({ with: BOB }), withCtx)).toEqual([]);
  });

  it("keeps games with a multikill of at least the size chosen, never a game without counts", () => {
    const games = [game({ multikills: "1,0,0,0" }), game({ multikills: "2,1,0,0" }), game({ multikills: "" }), game({ multikills: null }), game({ multikills: "-" }), game({ multikills: "0,0,0,1" })];
    expect(games.map((g) => largestMultikillOf(g.multikills))).toEqual([2, 3, null, null, null, 5]);
    expect(refineGames(games, readRefine({ hl: "double" }), ctx)).toEqual([games[0], games[1], games[5]]);
    expect(refineGames(games, readRefine({ hl: "triple" }), ctx)).toEqual([games[1], games[5]]);
    expect(refineGames(games, readRefine({ hl: "penta" }), ctx)).toEqual([games[5]]);
  });

  it("asks about personal bests only when they are chosen", () => {
    const games = [game(), game()];
    let asked = 0;
    const best = (g: SeasonGame) => {
      asked += 1;
      return g === games[1];
    };
    expect(refineGames(games, readRefine({ result: "win" }), { ...ctx, best })).toHaveLength(2);
    expect(asked).toBe(0);
    expect(refineGames(games, readRefine({ hl: "best" }), { ...ctx, best })).toEqual([games[1]]);
  });

  it("offers the patches played, newest first, with their public names", () => {
    expect(patchOptions([{ patch: "16.9" }, { patch: "16.10" }, { patch: "16.10" }, { patch: null }, { patch: "26.10" }])).toEqual([
      { patch: "16.10", label: "26.10", games: 3 },
      { patch: "16.9", label: "26.9", games: 1 },
    ]);
  });
});

describe("playing sessions", () => {
  const at = (minute: number, duration = 30 * 60, over: Partial<SeasonGame> = {}) => game({ gameCreation: T0 + minute * MIN, gameDuration: duration, ...over });

  it("joins games less than the gap apart, from one's end to the next one's start", () => {
    // 0:00–0:30, then 1:00 (30 min after the end), then 2:15 (45 min after 1:30: a new sitting).
    const [a, b, c] = [at(0), at(60), at(60 + 30 + SESSION_GAP_MINUTES)];
    const keys = sessionKeys([c, a, b]);
    expect(keys.get(a.matchId)).toBe(a.matchId);
    expect(keys.get(b.matchId)).toBe(a.matchId);
    expect(keys.get(c.matchId)).toBe(c.matchId);
  });

  it("counts a sitting's listed games only, with its record, KDA and CS per minute", () => {
    const a = at(0, 1800, { win: true, kills: 4, deaths: 2, assists: 6, cs: 210 });
    const b = at(35, 1200, { win: false, kills: 1, deaths: 3, assists: 1, cs: 120 });
    // A normal game in between keeps the sitting whole, though the list leaves it out.
    const normal = at(60, 1800, { queueId: 400 });
    const c = at(100, 1800, { win: true, kills: 2, deaths: 0, assists: 2, cs: 180 });
    const keys = sessionKeys([a, b, normal, c]);
    const summaries = sessionSummaries([c, b, a], keys);
    expect(summaries.size).toBe(1);
    const s = summaries.get(a.matchId)!;
    expect(s).toMatchObject({ games: 3, wins: 2, losses: 1, start: a.gameCreation, end: c.gameCreation + 1800 * 1000, minutes: 80 });
    expect(s.kda).toBeCloseTo((4 + 6 + 1 + 1 + 2 + 2) / 5);
    expect(s.csPerMinute).toBeCloseTo((210 + 120 + 180) / 80);
  });

  it("never stretches a sitting over a length that cannot be right", () => {
    const a = at(0, 99_999);
    const b = at(200);
    const keys = sessionKeys([a, b]);
    expect(keys.get(b.matchId)).toBe(b.matchId);
  });
});

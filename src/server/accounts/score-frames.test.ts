import { describe, expect, it } from "vitest";
import { framesBySeat, framesGoldOf, recordedGoldDifferenceOf, scoreFramesOf, scoreTimelineOf, type StoredScoreTimeline, type TimelineSeat } from "./match-timeline";

/*
  The rules a stored timeline is read by, shared by the opened game's timeline (getMatchTimeline)
  and Match History's card score (players/match-history cardPerformance): who the profile's player
  is, the teams' gold difference and its check against the record, each player's frames and their
  lane opponent's, and the trimmed read by place. tests/db/card-score.test.ts checks the two views
  agree on stored games.
*/

const POS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const seat = (slot: number, over: Partial<TimelineSeat> = {}): TimelineSeat => ({ puuid: `p${slot}`, teamId: slot < 5 ? 100 : 200, position: POS[slot % 5]!, teamPosition: POS[slot % 5]!, individualPosition: POS[slot % 5]!, ...over });
const parts = (over: Record<number, Partial<TimelineSeat>> = {}) => Array.from({ length: 10 }, (_, s) => seat(s, over[s]));
const t = [0, 300_000, 600_000, 900_000, 1_200_000];
/** Blue ahead by `lead` gold a player at every frame. */
const frames = (lead = 100) => ({ t, p: Object.fromEntries(Array.from({ length: 10 }, (_, s) => [`p${s}`, { g: t.map((ms) => 500 + ms / 1_000 + (s < 5 ? lead : 0)), x: t.map((ms) => ms / 2_000), c: t.map((ms) => ms / 10_000) }])) });
const kept = new Set(Array.from({ length: 10 }, (_, s) => `p${s}`));

describe("framesGoldOf", () => {
  it("finds the profile's player and the teams' gold difference from their side", () => {
    const red = framesGoldOf(parts(), frames(100), new Set(["p7"]));
    expect(red.meSlot).toBe(7);
    expect(red.gold!.map((g) => g.diff)).toEqual(t.map(() => -500));
    expect(framesGoldOf(parts(), frames(100), new Set(["p2"])).gold!.at(-1)!.diff).toBe(500);
  });

  it("gives no difference without the player, without frames, or with a player's frames missing", () => {
    expect(framesGoldOf(parts(), frames(), new Set(["nobody"]))).toEqual({ meSlot: -1, gold: null });
    expect(framesGoldOf(parts(), null, new Set(["p2"])).gold).toBeNull();
    expect(framesGoldOf(parts({ 9: { removed: true, puuid: "" } }), frames(), new Set(["p2"])).gold).toBeNull();
  });
});

describe("framesBySeat", () => {
  it("gives each player their frames and their lane opponent's", () => {
    const f = frames();
    const seats = framesBySeat(parts(), f);
    expect(seats[2]).toEqual({ frames: f.p.p2, opponentSlot: 7, opponentFrames: f.p.p7 });
    expect(seats[7]!.opponentSlot).toBe(2);
  });

  it("gives nothing of the frames when none may be read, and no frames for a removed player", () => {
    expect(framesBySeat(parts(), null)[2]).toEqual({ frames: null, opponentSlot: 7, opponentFrames: null });
    const seats = framesBySeat(parts({ 5: { removed: true, puuid: "" } }), frames());
    expect(seats[5]!.frames).toBeNull();
    // The removed player was the top laner's opponent: now none.
    expect(seats[0]!.opponentSlot).toBeNull();
  });
});

describe("recordedGoldDifferenceOf", () => {
  it("is the teams' recorded gold from a side, and nothing when a player's is missing or removed", () => {
    const ps = Array.from({ length: 10 }, (_, s) => ({ teamId: s < 5 ? 100 : 200, gold: 10_000 + (s < 5 ? 200 : 0) }));
    expect(recordedGoldDifferenceOf(ps, 100)).toBe(1_000);
    expect(recordedGoldDifferenceOf(ps, 200)).toBe(-1_000);
    expect(recordedGoldDifferenceOf(ps.map((p, i) => (i === 3 ? { ...p, gold: null } : p)), 100)).toBeNull();
    expect(recordedGoldDifferenceOf(ps.map((p, i) => (i === 3 ? { ...p, removed: true } : p)), 100)).toBeNull();
    expect(recordedGoldDifferenceOf([], 100)).toBeNull();
  });
});

describe("scoreTimelineOf", () => {
  it("gives the kept players' gold and experience, with the lane where both players' frames are there", () => {
    const tl = scoreTimelineOf(parts(), frames(), kept, new Set(["p2"]), () => 500);
    expect(tl.t).toEqual(t);
    expect(tl.players).toHaveLength(10);
    expect(tl.players[2]).toEqual({ slot: 2, frames: { g: frames().p.p2!.g, x: frames().p.p2!.x }, lane: { opponentSlot: 7 } });
  });

  it("reads none of the frames when the timeline contradicts the record, the same check from either side", () => {
    for (const me of ["p2", "p7"]) {
      const tl = scoreTimelineOf(parts(), frames(1_000), kept, new Set([me]), (teamId) => (teamId === 100 ? -5_000 : 5_000));
      expect(tl.t).toBeNull();
      expect(tl.players.every((p) => p.frames === null && p.lane === null)).toBe(true);
    }
  });

  it("leaves out players the timeline does not keep and removed players, and has no lane without the opponent's frames", () => {
    const f = frames();
    delete (f.p as Record<string, unknown>).p7;
    const tl = scoreTimelineOf(parts({ 9: { removed: true, puuid: "" } }), f, new Set([...kept].filter((p) => p !== "p4")), new Set(["p2"]), () => null);
    expect(tl.players.map((p) => p.slot)).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(tl.players.find((p) => p.slot === 2)!.lane).toBeNull();
    expect(tl.players.find((p) => p.slot === 7)!.frames).toBeNull();
  });

  it("treats empty frames as none", () => {
    expect(scoreTimelineOf(parts(), { t: [], p: {} }, kept, new Set(["p2"]), () => 0)).toEqual({ t: null, players: expect.any(Array) });
    expect(scoreTimelineOf(parts(), null, kept, new Set(["p2"]), () => 0).players.every((p) => !p.frames)).toBe(true);
  });
});

describe("scoreFramesOf", () => {
  it("puts the trimmed read's places back on the record's players", () => {
    const stored: StoredScoreTimeline = { available: true, dated: false, t, seats: [{ kept: true, frames: { g: [1], x: [2] } }, { kept: false, frames: null }, { kept: true, frames: null }] };
    const { frames: f, kept: k } = scoreFramesOf(stored, [{ puuid: "a" }, { puuid: "" }, { puuid: "c" }]);
    expect(f).toEqual({ t, p: { a: { g: [1], x: [2] } } });
    expect([...k]).toEqual(["a", "c"]);
    expect(scoreFramesOf({ ...stored, t: null }, [{ puuid: "a" }]).frames).toBeNull();
  });
});

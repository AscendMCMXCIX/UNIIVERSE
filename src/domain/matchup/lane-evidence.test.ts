import { describe, expect, it } from "vitest";
import { wilsonInterval } from "@/domain/champion-builds";
import { LANE_MS, MIN_LANE_GAMES, laneEvidence, laneFigures, laneWindow, lastRecordedChange, observeGame, quantile, type LaneGameRow, type LaneObservation } from "./lane-evidence";

/* Matchup Intel's "In the team's matches" block (docs/MATCHUP_INTEL.md): one pair's lane at 10:00, in the team's stored games, by queue. */

const T = [0, 60_500, 121_000, 181_000, 241_000, 301_000, 361_000, 421_000, 481_000, 541_000, 601_000, 661_000];
const flat = (v: number) => T.map(() => v);
/** A game: `lo` ahead by `gold` at every frame (so 10:00 reads it), its side's result, its kill times. */
function game(over: Partial<LaneGameRow> & { gold?: number } = {}): LaneGameRow {
  const gold = over.gold ?? 100;
  return {
    patch: "16.22",
    queue: 420,
    loWon: true,
    member: false,
    t: T,
    lo: { g: flat(3000 + gold), x: flat(3500), c: flat(80) },
    hi: { g: flat(3000), x: flat(3400), c: flat(75) },
    loKills: [],
    loDeaths: [],
    hiKills: [],
    hiDeaths: [],
    deaths: [],
    loFirstBlood: false,
    hiFirstBlood: false,
    ...over,
  };
}
const rec = { change: null, comparedFrom: null };
const input = (a = "Ahri", b = "Zed") => ({ a, b, role: "MID" as const, season: 16, currentPatch: "16.22", recorded: rec });

describe("one game", () => {
  it("reads 10:00 between the frames around it, never by frame number", () => {
    const row = game({ t: [0, 540_000, 660_000], lo: { g: [500, 3000, 4200], x: [0, 3000, 3600], c: [0, 70, 82] }, hi: { g: [500, 3000, 3000], x: [0, 3000, 3000], c: [0, 70, 70] } });
    const o = observeGame(row, true);
    // Halfway from 9:00 to 11:00: 3,600 against 3,000.
    expect(o.gold10).toBe(600);
    expect(o.xp10).toBe(300);
    expect(o.cs10).toBe(6);
  });

  it("has no value at 10:00 when the game or its frames ended before it, or there is no timeline", () => {
    expect(observeGame(game({ t: [0, 300_000, 590_000], lo: { g: [1, 2, 3], x: [1, 2, 3], c: [1, 2, 3] }, hi: { g: [1, 2, 3], x: [1, 2, 3], c: [1, 2, 3] } }), true).gold10).toBeNull();
    expect(observeGame(game({ t: null, lo: null, hi: null }), true).gold10).toBeNull();
  });

  it("matches kills by their time in the other player's deaths, a millisecond another death shares left out", () => {
    const o = observeGame(game({ loKills: [200_000, 300_000, 650_000], hiDeaths: [200_000, 300_000, 650_000], hiKills: [400_000], loDeaths: [400_000], deaths: [200_000, 300_000, 300_000, 400_000, 650_000] }), true);
    // 300,000 has two deaths in the game: ambiguous. 650,000 is after 10:00.
    expect(o.killsAonB).toBe(1);
    expect(o.killsBonA).toBe(1);
    expect(observeGame(game({ loKills: null }), true).killsAonB).toBeNull();
    expect(observeGame(game({ deaths: null }), true).killsBonA).toBeNull();
  });

  it("attributes first blood from the two records' flags, another player when neither took it, nothing without the figures", () => {
    expect(observeGame(game({ loFirstBlood: true }), true).firstBlood).toBe("A");
    expect(observeGame(game({ loFirstBlood: true }), false).firstBlood).toBe("B");
    expect(observeGame(game({}), true).firstBlood).toBe("other");
    expect(observeGame(game({ loFirstBlood: null, hiFirstBlood: null }), true).firstBlood).toBeNull();
  });

  it("flips every sign, the result and the kills when seen from the other champion (Swap: the same games)", () => {
    const row = game({ gold: 250, loWon: false, loKills: [100_000], hiDeaths: [100_000], deaths: [100_000] });
    const a = observeGame(row, true);
    const b = observeGame(row, false);
    expect(b.gold10).toBe(-a.gold10!);
    expect(b.xp10).toBe(-a.xp10!);
    expect(b.won).toBe(!a.won);
    expect([b.killsAonB, b.killsBonA]).toEqual([a.killsBonA, a.killsAonB]);
  });
});

describe("the figures", () => {
  const obs = (n: number, gold: (i: number) => number, won = (i: number) => i % 2 === 0): LaneObservation[] =>
    Array.from({ length: n }, (_, i) => ({ patch: "16.22", queue: 420, won: won(i), member: i < 3, gold10: gold(i), xp10: gold(i) / 2, cs10: 3, killsAonB: i % 3 === 0 ? 1 : 0, killsBonA: 0, firstBlood: i % 2 ? "A" : "other" }));

  it("show nothing under MIN_LANE_GAMES games and everything from it", () => {
    expect(MIN_LANE_GAMES).toBe(10);
    expect(laneFigures(obs(9, () => 100), "MID")).toBeNull();
    expect(laneFigures(obs(10, () => 100), "MID")).not.toBeNull();
  });

  it("count ahead in gold above 0 only (an even game is in the games, not ahead), with Wilson's 95% range", () => {
    const f = laneFigures(obs(14, (i) => (i < 9 ? 200 : i === 9 ? 0 : -150)), "TOP")!;
    expect(f.ahead).toMatchObject({ n: 9, of: 14 });
    expect(f.even).toBe(1);
    const w = wilsonInterval(9, 14)!;
    expect(f.ahead.low).toBeCloseTo(w.low, 10);
    expect(f.ahead.high).toBeCloseTo(w.high, 10);
    expect(f.won).toMatchObject({ n: 7, of: 14 });
  });

  it("give the medians and the middle half of the gold, and leave CS out for supports", () => {
    const f = laneFigures(obs(12, (i) => i * 100), "MID")!;
    expect(f.gold.median).toBe(550);
    expect(f.gold.low).toBe(Math.round(quantile([...Array(12).keys()].map((i) => i * 100), 0.25)));
    expect(f.cs).toEqual({ median: 3, low: 3, high: 3 });
    expect(laneFigures(obs(12, () => 1), "SUPPORT")!.cs).toBeNull();
  });

  it("count the kills only over games with kill times, from MIN_LANE_GAMES of them; first blood over flagged games", () => {
    const base = obs(12, () => 10);
    const f = laneFigures(base, "MID")!;
    expect(f.kills).toEqual({ games: 12, a: 4, b: 0, gamesA: 4, gamesB: 0 });
    expect(f.firstBlood).toEqual({ games: 12, a: 6, b: 0, other: 6 });
    const fewTimed = base.map((g, i) => (i < 3 ? { ...g, killsAonB: null, killsBonA: null, firstBlood: null } : g));
    expect(laneFigures(fewTimed, "MID")!.kills).toBeNull();
    expect(laneFigures(fewTimed, "MID")!.firstBlood).toBeNull();
  });
});

describe("the window", () => {
  const timed = (patches: string[]): LaneObservation[] => patches.map((patch) => ({ patch, queue: 420, won: true, member: false, gold10: 1, xp10: 1, cs10: 1, killsAonB: null, killsBonA: null, firstBlood: null }));

  it("keeps only the games since Riot's latest change where MIN_LANE_GAMES of them exist", () => {
    const games = timed([...Array(4).fill("16.21"), ...Array(10).fill("16.22")]);
    const w = laneWindow(games, { change: { patch: "16.22", champions: ["Darius"] }, comparedFrom: "16.21" }, 16);
    expect(w.window.kind).toBe("since-change");
    expect(w.games).toHaveLength(10);
  });

  it("keeps the season, saying how many games came before the change, where fewer came after it", () => {
    const games = timed([...Array(9).fill("16.21"), ...Array(5).fill("16.22")]);
    const w = laneWindow(games, { change: { patch: "16.22", champions: ["Darius"] }, comparedFrom: "16.21" }, 16);
    expect(w.window).toEqual({ kind: "season", change: { patch: "16.22", champions: ["Darius"] }, before: 9, comparedFrom: "16.21" });
    expect(w.games).toHaveLength(14);
  });

  it("says nothing was compared where no digests were recorded, and ignores a change of another season", () => {
    expect(laneWindow(timed(["16.22"]), { change: null, comparedFrom: null }, 16).window).toEqual({ kind: "season", change: null, before: 0, comparedFrom: null });
    expect(laneWindow(timed(["17.1"]), { change: { patch: "16.24", champions: ["Ahri"] }, comparedFrom: "16.22" }, 17).window).toMatchObject({ change: null });
  });

  it("finds the latest recorded change to either champion from the digests, and the first patch compared", () => {
    const digests = [
      { patch: "16.22", key: "Darius", hash: "a" },
      { patch: "16.23", key: "Darius", hash: "a" },
      { patch: "16.24", key: "Darius", hash: "b" },
      { patch: "16.21", key: "Riven", hash: "x" },
      { patch: "16.22", key: "Riven", hash: "y" },
      { patch: "16.24", key: "Riven", hash: "z" },
    ];
    expect(lastRecordedChange(digests, ["Riven", "Darius"], ["Riven", "Darius"])).toEqual({ change: { patch: "16.24", champions: ["Riven", "Darius"] }, comparedFrom: "16.22" });
    expect(lastRecordedChange(digests.slice(0, 2), ["Riven", "Darius"], ["Riven", "Darius"])).toEqual({ change: null, comparedFrom: "16.22" });
    expect(lastRecordedChange([], ["A", "B"], ["A", "B"])).toEqual({ change: null, comparedFrom: null });
  });
});

describe("one pair's evidence", () => {
  it("is the mirror line for the same champion twice (draft queues allow one pick)", () => {
    expect(laneEvidence([game()], input("Ahri", "Ahri"))).toEqual({ status: "mirror" });
  });

  it("keeps each queue apart, never pooled, and counts only the season's games (26.24 and 27.1 never together)", () => {
    const rows = [...Array.from({ length: 10 }, () => game({ queue: 420 })), ...Array.from({ length: 6 }, () => game({ queue: 440 })), game({ queue: 400 }), game({ queue: 420, patch: "17.1" })];
    const e = laneEvidence(rows, input());
    if (e.status !== "counted") throw new Error("counted");
    expect(e.queues.solo).toMatchObject({ games: 10, stored: 10 });
    expect(e.queues.solo.figures).not.toBeNull();
    expect(e.queues.flex).toMatchObject({ games: 6, figures: null });
    expect(e.queues.draft.games).toBe(1);
    expect(e.queues.clash).toMatchObject({ games: 0, stored: 0, figures: null });
    const next = laneEvidence(rows, { ...input(), season: 17 });
    if (next.status !== "counted") throw new Error("counted");
    expect(next.queues.solo.games).toBe(1);
  });

  it("orients the rows by the first column's champion: Swap shows the same games with every sign flipped", () => {
    const rows = Array.from({ length: 10 }, (_, i) => game({ gold: 100 + i, loWon: i < 7 }));
    const ab = laneEvidence(rows, input("Ahri", "Zed"));
    const ba = laneEvidence(rows, input("Zed", "Ahri"));
    if (ab.status !== "counted" || ba.status !== "counted") throw new Error("counted");
    expect(ab.queues.solo.figures!.gold.median).toBe(-ba.queues.solo.figures!.gold.median);
    expect(ab.queues.solo.figures!.ahead.n).toBe(10);
    expect(ba.queues.solo.figures!.ahead.n).toBe(0);
    expect(ab.queues.solo.figures!.won.n + ba.queues.solo.figures!.won.n).toBe(10);
  });

  it("counts a game without a timeline to 10:00 as stored, never in a figure", () => {
    const rows = [...Array.from({ length: 9 }, () => game()), game({ t: null, lo: null, hi: null })];
    const e = laneEvidence(rows, input());
    if (e.status !== "counted") throw new Error("counted");
    expect(e.queues.solo).toMatchObject({ games: 9, stored: 10, noTimeline: 1, figures: null });
    expect(LANE_MS).toBe(600_000);
  });
});

import { describe, expect, it } from "vitest";
import type { SeasonGame } from "./season-stats";
import { BASELINE_GAMES, BASELINE_MIN, BEST_MIN, CONTRADICTION_MIN, LEAD_MIN, figureOf, goldContradictsRecord, goldStory, laneMoments, laneOpponentOf, personalComparison, placeOf, queueGroup, standoutOf, teamGoldDifference } from "./match-analysis";

let n = 0;
/** A 30-minute game; `at` orders the games (minutes since an arbitrary start). */
function game(at: number, over: Partial<SeasonGame> = {}): SeasonGame {
  n += 1;
  return { matchId: `M${n}`, accountId: "a1", queueId: 420, championId: "Ahri", role: "MID", win: true, patch: "16.20", gameCreation: at * 60_000, kills: 5, deaths: 5, assists: 5, cs: 210, damage: 21_000, visionScore: 30, gameDuration: 1800, ...over };
}

describe("queue groups", () => {
  it("compares ranked with ranked, draft with blind, and keeps the fast modes and Clash apart", () => {
    expect(queueGroup(420)).toBe(queueGroup(440));
    expect(queueGroup(400)).toBe(queueGroup(430));
    expect(queueGroup(480)).toBe("fast");
    expect(queueGroup(490)).toBe("fast");
    expect(queueGroup(700)).toBe("clash");
    expect(queueGroup(420)).not.toBe(queueGroup(400));
    expect(queueGroup(450)).toBe("other");
    expect(queueGroup(null)).toBe("other");
  });
});

describe("figures", () => {
  it("are per minute of a valid game, KDA with deaths of at least one, and missing without the figure", () => {
    const g = game(0, { kills: 4, deaths: 0, assists: 6, cs: 240, gameDuration: 1200 });
    expect(figureOf(g, "kda")).toBe(10);
    expect(figureOf(g, "csPerMin")).toBe(12);
    expect(figureOf(game(0, { gameDuration: 200 }), "csPerMin")).toBeNull();
    expect(figureOf(game(0, { cs: null }), "csPerMin")).toBeNull();
    // Riot no longer serves the game's details (kills = -1).
    expect(figureOf(game(0, { kills: -1 }), "kda")).toBeNull();
  });
});

describe("personal comparison", () => {
  it("needs enough earlier games of the same role and queue group, and never counts later ones", () => {
    const history = Array.from({ length: BASELINE_MIN - 1 }, (_, i) => game(i));
    const target = game(100);
    // Other roles, normal games and later games are not comparable.
    const noise = [game(50, { role: "TOP" }), game(51, { queueId: 400 }), game(200)];
    expect(personalComparison(target, [...history, ...noise, target])).toBeNull();
    const enough = [...history, game(99)];
    const c = personalComparison(target, [...enough, ...noise, target])!;
    expect(c.role).toBe("MID");
    expect(c.group).toBe("ranked");
    expect(c.figures.every((f) => f.games === BASELINE_MIN)).toBe(true);
  });

  it("says where the game sits among the earlier ones, and its median; ties count half", () => {
    const history = Array.from({ length: 10 }, (_, i) => game(i, { damage: (i + 1) * 3000 }));
    const target = game(50, { damage: 15_000 });
    const dmg = personalComparison(target, history)!.figures.find((f) => f.key === "damagePerMin")!;
    // 4 earlier games below 15,000, one tie: (4 + 0.5) / 10.
    expect(dmg.percentile).toBeCloseTo(0.45);
    expect(dmg.median).toBeCloseTo(16_500 / 30);
    expect(dmg.top).toBeCloseTo(30_000 / 30);
    expect(dmg.best).toBe(false);
  });

  it("uses only the newest BASELINE_GAMES earlier games", () => {
    const old = Array.from({ length: 30 }, (_, i) => game(i, { damage: 90_000 }));
    const recent = Array.from({ length: BASELINE_GAMES }, (_, i) => game(100 + i, { damage: 10_000 }));
    const c = personalComparison(game(1000, { damage: 20_000 }), [...old, ...recent])!;
    const dmg = c.figures.find((f) => f.key === "damagePerMin")!;
    expect(dmg.games).toBe(BASELINE_GAMES);
    expect(dmg.percentile).toBe(1);
  });

  it("calls a figure the best only above every one of at least BEST_MIN earlier games", () => {
    const few = Array.from({ length: BEST_MIN - 1 }, (_, i) => game(i));
    expect(personalComparison(game(100, { damage: 50_000 }), few)!.figures.find((f) => f.key === "damagePerMin")!.best).toBe(false);
    const enough = Array.from({ length: BEST_MIN }, (_, i) => game(i));
    const c = personalComparison(game(100, { damage: 50_000 }), enough)!;
    expect(c.figures.find((f) => f.key === "damagePerMin")!.best).toBe(true);
    // Equal to the earlier best is not above it.
    expect(personalComparison(game(100), enough)!.figures.some((f) => f.best)).toBe(false);
  });

  it("does not compare supports on CS, and counts one game per match", () => {
    const supportHistory = Array.from({ length: 12 }, (_, i) => game(i, { role: "SUPPORT", cs: 30 }));
    const c = personalComparison(game(100, { role: "SUPPORT" }), supportHistory)!;
    expect(c.figures.map((f) => f.key)).not.toContain("csPerMin");
    const twice = Array.from({ length: 6 }, (_, i) => game(i)).flatMap((g) => [g, { ...g, accountId: "a2" }]);
    expect(personalComparison(game(100), twice)).toBeNull();
  });

  it("has nothing to say without a recorded role or for an unsupported queue", () => {
    const history = Array.from({ length: 30 }, (_, i) => game(i));
    expect(personalComparison(game(100, { role: null }), history)).toBeNull();
    expect(personalComparison(game(100, { queueId: 1700 }), history)).toBeNull();
  });
});

describe("standout", () => {
  it("is the best figure with the largest margin over the earlier best, and absent in most games", () => {
    const history = Array.from({ length: 25 }, (_, i) => game(i));
    expect(standoutOf(personalComparison(game(100), history))).toBeNull();
    // Damage 50% above the earlier best, KDA (5+5)/5 → (6+6)/5: 20% above.
    const s = standoutOf(personalComparison(game(100, { damage: 31_500, kills: 6, assists: 6 }), history))!;
    expect(s.key).toBe("damagePerMin");
    expect(standoutOf(null)).toBeNull();
  });
});

describe("lane moments", () => {
  const t = [0, 61_000, 121_000, 600_400, 900_200, 1_000_000];
  const series = (k: number) => ({ g: t.map((ms) => 500 + (ms / 1000) * k), x: t.map((ms) => ms / 100), c: t.map((ms) => Math.floor(ms / 10_000)) });
  it("reads both players at exact minutes between frames, and nothing after the game's end", () => {
    const [ten, fifteen, twenty] = laneMoments(t, series(2), series(1.5), [10, 15, 20]);
    expect(ten!.you!.gold).toBe(500 + 1200);
    expect(ten!.opponent!.gold).toBe(500 + 900);
    expect(fifteen!.you!.cs).toBe(90);
    expect(twenty!.you).toBeNull();
    expect(twenty!.opponent).toBeNull();
  });
});

describe("team gold difference", () => {
  const t = [0, 60_000, 120_000];
  const p = (teamId: number, gold: number) => ({ teamId, g: [500, 500 + gold, 500 + 2 * gold] });
  it("is the player's team minus the other at every frame", () => {
    const series = [...Array.from({ length: 5 }, () => p(100, 400)), ...Array.from({ length: 5 }, () => p(200, 300))];
    expect(teamGoldDifference(t, series, 100)).toEqual([
      { minute: 0, diff: 0 },
      { minute: 1, diff: 500 },
      { minute: 2, diff: 1000 },
    ]);
    expect(teamGoldDifference(t, series, 200)![2]!.diff).toBe(-1000);
  });
  it("is not drawn when a player is missing", () => {
    const series = [...Array.from({ length: 5 }, () => p(100, 400)), ...Array.from({ length: 4 }, () => p(200, 300))];
    expect(teamGoldDifference(t, series, 100)).toBeNull();
  });
});

describe("a timeline against its game's record", () => {
  const ending = (diff: number) => [{ minute: 0, diff: 0 }, { minute: 31, diff }];
  it("agrees when both say the same side was ahead, or the gap is small either way", () => {
    expect(goldContradictsRecord(ending(4_200), 4_150)).toBe(false);
    expect(goldContradictsRecord(ending(-6_800), -6_900)).toBe(false);
    // A close game read a moment apart can flip sign: not a contradiction.
    expect(goldContradictsRecord(ending(350), -120)).toBe(false);
    expect(goldContradictsRecord(ending(CONTRADICTION_MIN - 1), -9_000)).toBe(false);
  });
  it("contradicts when one clearly has the player's team ahead and the other clearly behind", () => {
    // The 26 October demo game before the demo was fixed: +16,830 recorded, −4,342 at the last frame.
    expect(goldContradictsRecord(ending(-4_342), 16_830)).toBe(true);
    expect(goldContradictsRecord(ending(CONTRADICTION_MIN), -CONTRADICTION_MIN)).toBe(true);
  });
  it("cannot be judged without the recorded gold or the curve", () => {
    expect(goldContradictsRecord(ending(-4_342), null)).toBe(false);
    expect(goldContradictsRecord([], 16_830)).toBe(false);
  });
});

describe("place in a group", () => {
  it("is one plus everyone above, ties sharing the place, null without the figure", () => {
    const xs = [{ v: 10 }, { v: 30 }, { v: 30 }, { v: null }];
    expect(placeOf(xs, xs[1]!, (x) => x.v)).toBe(1);
    expect(placeOf(xs, xs[2]!, (x) => x.v)).toBe(1);
    expect(placeOf(xs, xs[0]!, (x) => x.v)).toBe(3);
    expect(placeOf(xs, xs[3]!, (x) => x.v)).toBeNull();
  });
});

describe("gold story", () => {
  const pts = (diffs: number[]) => diffs.map((diff, minute) => ({ minute, diff }));
  it("names the largest lead and deficit, the end, and each time the other team took over a clear lead", () => {
    const s = goldStory(pts([0, 400, 1500, 900, -200, -1200, -2500, -800, 300, 1800, 4200]))!;
    expect(s.lead).toEqual({ minute: 10, diff: 4200 });
    expect(s.deficit).toEqual({ minute: 6, diff: -2500 });
    expect(s.final).toEqual({ minute: 10, diff: 4200 });
    expect(s.changes).toEqual([
      { minute: 5, to: "behind" },
      { minute: 9, to: "ahead" },
    ]);
  });
  it("never counts the first lead, or a gap that stays under LEAD_MIN, as a change", () => {
    expect(goldStory(pts([0, LEAD_MIN - 1, -(LEAD_MIN - 1), 2000]))!.changes).toEqual([]);
    const ahead = goldStory(pts([0, 300, 600]))!;
    expect(ahead.deficit).toBeNull();
    expect(goldStory([])).toBeNull();
  });
});

describe("lane opponent", () => {
  const p = (teamId: number, position: string | null, removed = false) => ({ teamId, position, removed });
  it("is the one enemy in the same position, whatever name the record uses for it", () => {
    expect(laneOpponentOf([p(100, "MIDDLE"), p(200, "TOP"), p(200, "MID")], 0)).toBe(2);
    expect(laneOpponentOf([p(100, "SUPPORT"), p(200, "UTILITY")], 0)).toBe(1);
  });
  it("is nobody when the position is missing or shared, and never a removed player", () => {
    expect(laneOpponentOf([p(100, null), p(200, "MIDDLE")], 0)).toBeNull();
    expect(laneOpponentOf([p(100, "MIDDLE"), p(200, "MIDDLE"), p(200, "MIDDLE")], 0)).toBeNull();
    expect(laneOpponentOf([p(100, "MIDDLE"), p(200, "MIDDLE", true)], 0)).toBeNull();
  });
});

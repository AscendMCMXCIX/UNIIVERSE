import { describe, expect, it } from "vitest";
import type { LeaderboardGame, LeaderboardMastery } from "./leaderboards";
import { buildMultikillBoard, buildRecords, multikillCountsOf, SEASON_RECORDS, seasonGames } from "./leaderboard-records";
import { buildMultikillBaseline } from "./multikill-score";

const NOW = Date.UTC(2026, 10, 2, 12);
const DAY = 86_400_000;
let seq = 0;
function game(playerId: string, daysAgo: number, o: Partial<LeaderboardGame> = {}): LeaderboardGame {
  seq += 1;
  return {
    matchId: `OC1_${seq}`,
    playerId,
    championId: "Ahri",
    role: "MID",
    queueId: 420,
    patch: "16.21",
    win: true,
    gameCreation: NOW - daysAgo * DAY - seq,
    durationS: 1800,
    kills: 5,
    deaths: 5,
    assists: 5,
    cs: 210,
    damage: 21_000,
    vision: 30,
    gold: 12_000,
    wardsPlaced: 10,
    teamKills: 20,
    teamDamage: 84_000,
    extra: null,
    ...o,
  };
}
const SEASON = 16;
const records = (games: LeaderboardGame[], mastery: LeaderboardMastery[] = [], playerIds = [...new Set(games.map((g) => g.playerId))]) => buildRecords({ games, mastery, playerIds, season: SEASON });
const record = (r: ReturnType<typeof records>, id: string) => r.records.find((x) => x.def.id === id)!;

describe("season records", () => {
  it("lists the seven records of the model, in order", () => {
    expect(SEASON_RECORDS.map((r) => r.id)).toEqual(["kills", "assists", "damage-per-minute", "cs-per-minute", "vision-per-minute", "kda", "win-streak"]);
  });

  it("counts one season's supported Summoner's Rift games, remakes left out", () => {
    const games = [game("a", 1), game("a", 2, { patch: "15.20" }), game("a", 3, { queueId: 450 }), game("a", 4, { durationS: 200 }), game("a", 5, { queueId: 400 })];
    expect(seasonGames(games, SEASON).map((g) => g.matchId)).toEqual([games[0]!.matchId, games[4]!.matchId]);
  });

  it("holds the single best game with its champion, role and date; whoever set it first keeps a tie", () => {
    const first = game("a", 10, { kills: 18, championId: "Zed", role: "MID" });
    const later = game("b", 2, { kills: 18 });
    const r = records([game("a", 1, { kills: 9 }), first, later]);
    const kills = record(r, "kills");
    expect(kills.holder).toMatchObject({ playerId: "a", value: 18, game: { matchId: first.matchId, championId: "Zed", role: "MID" } });
    expect(kills.bests.b!.value).toBe(18);
  });

  it("per-minute records need 15 minutes, so a short stomp does not set them", () => {
    const stomp = game("a", 1, { durationS: 14 * 60, damage: 30_000 }); // 2,143 a minute, but 14 minutes
    const real = game("b", 2, { durationS: 20 * 60, damage: 30_000 }); // 1,500 a minute
    expect(record(records([stomp, real]), "damage-per-minute").holder).toMatchObject({ playerId: "b", value: 1500 });
  });

  it("the KDA record needs 10 takedowns, and a deathless game counts as dying once", () => {
    const tiny = game("a", 1, { kills: 3, deaths: 0, assists: 2 }); // KDA 5, 5 takedowns
    const big = game("b", 2, { kills: 8, deaths: 0, assists: 4 }); // KDA 12
    const kda = record(records([tiny, big]), "kda");
    expect(kda.holder).toMatchObject({ playerId: "b", value: 12 });
    expect(kda.bests.a).toBeUndefined();
  });

  it("a game without the figure is left out, never counted as zero", () => {
    const r = records([game("a", 1, { kills: null, deaths: null, assists: null, vision: null })]);
    expect(record(r, "kills").holder).toBeNull();
    expect(record(r, "vision-per-minute").holder).toBeNull();
  });

  it("the longest win streak is in the order games were played, the earlier run keeping a tie", () => {
    // Player a: W W W L (oldest first) → 3; player b: W W W later → 3, set after a's.
    const a = [game("a", 20), game("a", 19), game("a", 18), game("a", 17, { win: false })];
    const b = [game("b", 5), game("b", 4), game("b", 3)];
    const streak = record(records([...a, ...b]), "win-streak");
    expect(streak.holder).toMatchObject({ playerId: "a", value: 3, game: null });
    expect(streak.bests.b!.value).toBe(3);
  });

  it("names nobody who is not on the boards", () => {
    const r = records([game("a", 1, { kills: 4 }), game("outsider", 1, { kills: 30 })], [], ["a"]);
    expect(record(r, "kills").holder!.playerId).toBe("a");
    expect(r.games).toBe(1);
  });
});

const counts = (o: Partial<Record<"doubleKills" | "tripleKills" | "quadraKills" | "pentaKills", number>>) => ({ doubleKills: 0, tripleKills: 0, quadraKills: 0, pentaKills: 0, ...o });

describe("multikills and milestones", () => {
  it("counts the games that carry Riot's multikill counts; a record with extra figures but none of them carries none", () => {
    // Riot sends the four counts together; a record with extra figures but none of them (as the
    // profiles' multikill coverage reads it) carries no counts and is left out, never read as zero.
    const r = records([
      game("a", 1, { extra: counts({ tripleKills: 3 }) }),
      game("b", 1, { extra: counts({ quadraKills: 1, tripleKills: 1 }) }),
      game("c", 1, { extra: counts({ pentaKills: 1 }) }),
      game("d", 1, { extra: counts({ doubleKills: 4 }) }),
      game("e", 1),
      game("f", 1, { extra: { firstBloodKill: true, wardsKilled: 3 } }),
    ]);
    expect(r.multikillGames).toBe(4);
    expect(multikillCountsOf({ extra: { firstBloodKill: true } })).toBeNull();
    expect(multikillCountsOf({ extra: null })).toBeNull();
    expect(multikillCountsOf({ extra: counts({ doubleKills: 2, pentaKills: 1 }) })).toEqual({ double: 2, triple: 0, quadra: 0, penta: 1 });
  });

  describe("the multikill board (domain/multikill-score)", () => {
    /** A member's games with these counts per game (Riot's, nested: a triple also counts a double). */
    const played = (playerId: string, n: number, role: LeaderboardGame["role"], perGame: (i: number) => ReturnType<typeof counts> | null, championId = "Ahri") =>
      Array.from({ length: n }, (_, i) => game(playerId, 1 + i * 0.1, { role, championId, extra: perGame(i) }));
    const board = (games: LeaderboardGame[], baseline: Parameters<typeof buildMultikillBoard>[0]["baseline"] = null) => buildMultikillBoard({ games, playerIds: [...new Set(games.map((g) => g.playerId))], season: SEASON, baseline, nameOf: (id) => id });

    it("scores every member with a game this season: a support with 200 games and no pentakill, a mid with 12 games and one, a member with 3 games, a jungler, and one whose older games have no counts", () => {
      const games = [
        ...played("support", 200, "SUPPORT", (i) => counts({ doubleKills: i < 50 ? 1 : 0, tripleKills: i < 6 ? 1 : 0, quadraKills: i < 1 ? 1 : 0 }), "Leona"),
        ...played("mid", 12, "MID", (i) => counts({ doubleKills: i < 7 ? 1 : 0, tripleKills: i < 1 ? 1 : 0, quadraKills: i < 1 ? 1 : 0, pentaKills: i < 1 ? 1 : 0 })),
        ...played("new", 3, "TOP", () => counts({ doubleKills: 1 })),
        ...played("jungle", 60, "JUNGLE", (i) => counts({ doubleKills: i % 3 === 0 ? 1 : 0, tripleKills: i % 15 === 0 ? 1 : 0 }), "Vi"),
        ...played("older", 36, "ADC", (i) => (i < 18 ? null : counts({ doubleKills: i % 3 ? 0 : 1 })), "Jinx"),
      ];
      // A comparison of the other players in the same games, 1,000 games or more in each role.
      const row = (position: string, d: number, t: number, q: number, p: number) => ({ position, championId: "Other", games: 2000, nested: { double: d, triple: t, quadra: q, penta: p }, separate: { double: d, triple: t, quadra: q, penta: p } });
      const baseline = buildMultikillBaseline([row("UTILITY", 300, 24, 3, 0), row("MIDDLE", 1100, 140, 24, 5), row("TOP", 800, 90, 14, 2), row("JUNGLE", 900, 100, 16, 3), row("BOTTOM", 1200, 160, 30, 6)], { withTriple: 500, outOfOrder: 0 });
      const b = board(games, baseline);
      expect(b.baseline).toBe(baseline);
      expect(b.rows.map((r) => [r.playerId, r.status, r.place])).toEqual([
        ["support", "ranked", 1],
        ["jungle", "ranked", 2],
        ["mid", "provisional", null],
        ["older", "provisional", null],
        ["new", "not-enough", null],
      ]);
      const of = (id: string) => b.rows.find((r) => r.playerId === id)!;
      // Riot's counters (nested) and each multikill once: the mid's pentakill is one event, not four, on the board and in the score.
      expect(of("mid").counts).toEqual({ double: 7, triple: 1, quadra: 1, penta: 1 });
      expect(of("mid").events).toEqual({ double: 6, triple: 0, quadra: 0, penta: 1 });
      expect(of("older")).toMatchObject({ games: 36, counted: 18 });
      expect(of("support").score!).toBeGreaterThan(of("mid").score!);
      expect(b.most.penta).toEqual({ count: 1, holders: ["mid"] });
      // The most of each kind counts each multikill once: the support's 50 double counters hold 44 doubles that stopped there.
      expect(b.most.double).toEqual({ count: 44, holders: ["support"] });
    });

    it("without 1,000 comparison games, compares with the team's own games, every position together", () => {
      const b = board(played("a", 30, "MID", () => counts({ doubleKills: 1 })));
      expect(b.baseline.source).toBe("team");
      expect(b.baseline.all.games).toBe(30);
      // 30 doubles, exactly the team's own rate: 100 × (60 + 20) ÷ (60 + 20).
      expect(b.rows[0]!.score).toBeCloseTo(100, 10);
    });

    it("leaves out anyone not on the board and other seasons' games", () => {
      const b = board([...played("a", 25, "MID", () => counts({ doubleKills: 1 })), game("a", 2, { patch: "15.20", extra: counts({ pentaKills: 3 }) })]);
      expect(b.rows[0]!.counts.penta).toBe(0);
      expect(buildMultikillBoard({ games: played("outsider", 30, "MID", () => counts({ doubleKills: 1 })), playerIds: ["a"], season: SEASON, baseline: null, nameOf: (id) => id }).rows).toEqual([]);
    });
  });

  it("marks the highest milestone reached: games on one champion this season, and all-time mastery on one champion over every linked account", () => {
    const games = [...Array.from({ length: 52 }, (_, i) => game("a", i % 50, { championId: "Ahri" })), ...Array.from({ length: 24 }, (_, i) => game("a", i, { championId: "Zed" }))];
    const mastery: LeaderboardMastery[] = [
      { playerId: "a", championId: "Ahri", points: 300_000 },
      { playerId: "a", championId: "Ahri", points: 250_000 }, // a second account
      { playerId: "a", championId: "Zed", points: 99_999 },
    ];
    const r = records(games, mastery);
    expect(r.championGames).toEqual([{ playerId: "a", championId: "Ahri", value: 52, milestone: 50 }]);
    expect(r.mastery).toEqual([{ playerId: "a", championId: "Ahri", value: 550_000, milestone: 500_000 }]);
  });
});

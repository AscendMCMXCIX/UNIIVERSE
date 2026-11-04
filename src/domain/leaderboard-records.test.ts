import { describe, expect, it } from "vitest";
import type { LeaderboardGame, LeaderboardMastery } from "./leaderboards";
import { buildRecords, SEASON_RECORDS, seasonGames } from "./leaderboard-records";

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

describe("multikills and milestones", () => {
  it("adds up Riot's multikills from the games that carry them, rarest first", () => {
    const r = records([
      game("a", 1, { extra: { tripleKills: 3 } }),
      game("b", 1, { extra: { quadraKills: 1, tripleKills: 1 } }),
      game("c", 1, { extra: { pentaKills: 1 } }),
      game("d", 1, { extra: { doubleKills: 4 } }),
      game("e", 1),
    ]);
    expect(r.multikills.map((m) => m.playerId)).toEqual(["c", "b", "a"]);
    expect(r.multikills[1]).toEqual({ playerId: "b", penta: 0, quadra: 1, triple: 1 });
    expect(r.multikillGames).toBe(4);
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

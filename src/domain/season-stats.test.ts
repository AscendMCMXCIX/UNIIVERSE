import { describe, expect, it } from "vitest";
import { combineMastery, dedupeGames, gamesFor, otherSeasonChampions, performanceOfGames, recordOf, seasonChampionStats, seasonsInGames, type SeasonGame } from "./season-stats";

let n = 0;
const g = (championId: string, queueId: number, win: boolean, patch = "16.18", accountId = "acc-a", matchId?: string): SeasonGame => ({ matchId: matchId ?? `M${++n}`, accountId, queueId, championId, role: "TOP", win, patch, gameCreation: 1_780_000_000_000 + n });

describe("season statistics", () => {
  const games = dedupeGames([
    g("Riven", 420, true),
    g("Riven", 420, false),
    g("Riven", 420, true, "16.2", "acc-b"),
    g("Riven", 440, true),
    g("Riven", 400, false),
    g("Riven", 490, true),
    g("Riven", 420, true, "15.24"), // last season
    g("Gwen", 420, false, "16.20", "acc-b"),
    // The same match seen from two linked accounts counts once.
    g("Jax", 420, true, "16.20", "acc-a", "SHARED"),
    g("Jax", 420, true, "16.20", "acc-b", "SHARED"),
  ]);

  it("counts the whole season from the games themselves, by mode, with no duplicates", () => {
    expect(gamesFor(games, { season: 16, mode: "all" })).toHaveLength(8);
    expect(recordOf(gamesFor(games, { season: 16, mode: "solo", championId: "Riven" }))).toMatchObject({ games: 3, wins: 2, losses: 1 });
    expect(recordOf(gamesFor(games, { season: 16, mode: "flex", championId: "Riven" }))).toMatchObject({ games: 1, wins: 1 });
    expect(recordOf(gamesFor(games, { season: 16, mode: "normal", championId: "Riven" }))).toMatchObject({ games: 2, wins: 1, winRate: 0.5 });
    expect(recordOf(gamesFor(games, { season: 16, mode: "solo", championId: "Jax" })).games).toBe(1);
    expect(recordOf(gamesFor(games, { season: 15, mode: "solo" })).games).toBe(1);
    expect(recordOf([])).toEqual({ games: 0, wins: 0, losses: 0, winRate: null, lastPlayedAt: null });
    expect(seasonsInGames(games)).toEqual([16, 15]);
  });

  it("aggregates several accounts by games, not by averaging their win rates", () => {
    // Account A: 1 win in 2 Solo games on Riven; account B: 1 win in 1. Combined 2/3, not (50% + 100%) / 2.
    const riven = seasonChampionStats(games, ["Riven"], { season: 16, mode: "solo" })[0]!;
    expect(riven.selected.winRate).toBeCloseTo(2 / 3);
    expect(riven.normal.games).toBe(2);
  });

  it("lists champions outside the pool by games played", () => {
    expect(otherSeasonChampions(games, ["Riven"], { season: 16, mode: "all" })).toEqual(["Gwen", "Jax"]);
  });

  it("combines mastery across accounts once each and keeps the breakdown", () => {
    const m = combineMastery([
      { accountId: "a", account: "A#OCE", points: 400_000, level: 7, lastPlayedAt: new Date("2026-09-01") },
      { accountId: "b", account: "B#OCE", points: 250_000, level: 6, lastPlayedAt: new Date("2026-10-01") },
      { accountId: "a", account: "A#OCE", points: 400_000, level: 7, lastPlayedAt: null },
    ])!;
    expect(m.points).toBe(650_000);
    expect(m.level).toBe(7);
    expect(m.accounts.map((a) => a.account)).toEqual(["A#OCE", "B#OCE"]);
    expect(m.lastPlayedAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(combineMastery([])).toBeNull();
  });
});

describe("season statistics by champion, grouped in one pass", () => {
  // The implementation before the one-pass grouping: four scans of every game per champion.
  const reference = (games: readonly SeasonGame[], championIds: readonly string[], options: { season: number; mode: "all" | "solo" | "flex" | "normal" }) =>
    championIds.map((championId) => {
      const selected = gamesFor(games, { ...options, championId });
      return {
        championId,
        selected: recordOf(selected),
        solo: recordOf(gamesFor(games, { season: options.season, mode: "solo", championId })),
        flex: recordOf(gamesFor(games, { season: options.season, mode: "flex", championId })),
        normal: recordOf(gamesFor(games, { season: options.season, mode: "normal", championId })),
        performance: performanceOfGames(selected),
      };
    });

  it("gives the same records and the same games, in the same order, as four scans per champion", () => {
    let seed = 7;
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648;
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
    const champions = ["Riven", "Gwen", "Jax", "Ahri", "Lulu", "Nami"];
    const games: SeasonGame[] = Array.from({ length: 600 }, (_, i) => ({
      matchId: `R${i}`,
      accountId: pick(["acc-a", "acc-b"]),
      queueId: pick([420, 440, 400, 430, 490, 450, null]),
      championId: pick(champions),
      role: "TOP",
      win: pick([true, false, null]),
      patch: pick(["16.18", "26.4", "15.24", "25.3", null, "unknown", " 16.2 "]),
      gameCreation: 1_780_000_000_000 + Math.floor(next() * 1e9),
      kills: Math.floor(next() * 12),
      deaths: Math.floor(next() * 8),
      assists: Math.floor(next() * 15),
    }));
    const asked = [...champions, "Teemo", "Riven"]; // one with no games, one asked twice
    for (const season of [16, 15]) {
      for (const mode of ["all", "solo", "flex", "normal"] as const) {
        const fast = seasonChampionStats(games, asked, { season, mode });
        const slow = reference(games, asked, { season, mode });
        expect(fast).toEqual(slow);
      }
    }
  });
});

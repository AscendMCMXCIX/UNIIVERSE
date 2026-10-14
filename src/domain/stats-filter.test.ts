import { describe, expect, it } from "vitest";
import { championsByGames, filterGames, statsQuery, type GameRole, type SeasonGame, type StatsFilter } from "./season-stats";

let n = 0;
const g = (championId: string, role: string | null, extra: Partial<SeasonGame> = {}): SeasonGame => ({ matchId: `m${++n}`, accountId: "main", queueId: 420, championId, role, win: true, patch: "16.5", gameCreation: 1_000 + n, ...extra });
const pools: Record<GameRole, string[]> = { TOP: ["Gwen", "Ambessa"], JUNGLE: ["Gwen", "Viego"], MID: ["Gwen", "Ahri"], ADC: [], SUPPORT: [] };
const poolOf = (r: GameRole) => pools[r];
const all: StatsFilter = { season: 16, mode: "all", role: null, scope: "all", championId: null, accountId: null };

describe("profile statistics filters", () => {
  const games = [g("Gwen", "TOP"), g("Gwen", "JUNGLE"), g("Gwen", "JUNGLE"), g("Ahri", "MID"), g("Zed", "MID"), g("Gwen", null), g("Viego", "TOP")];

  it("counts every champion and every game by default", () => {
    expect(filterGames(games, all, poolOf).games).toHaveLength(7);
  });

  it("uses the role actually played: jungle Gwen never counts as Top Gwen", () => {
    const top = filterGames(games, { ...all, role: "TOP", scope: "champion", championId: "Gwen" }, poolOf);
    expect(top.games).toHaveLength(1);
    // The Gwen game without a recorded position is left out of the role figure, and reported.
    expect(top.unknownRole).toBe(1);
    expect(filterGames(games, { ...all, role: "JUNGLE", scope: "champion", championId: "Gwen" }, poolOf).games).toHaveLength(2);
  });

  it("configured pool = champion configured for the role it was played in", () => {
    // Every role: Gwen top/jungle/jungle, Ahri mid, unknown-role Gwen (in a pool) count; Zed mid and Viego top do not.
    const pool = filterGames(games, { ...all, scope: "pool" }, poolOf);
    expect(pool.games.map((x) => `${x.championId}:${x.role}`).sort()).toEqual(["Ahri:MID", "Gwen:JUNGLE", "Gwen:JUNGLE", "Gwen:TOP", "Gwen:null"]);
    expect(pool.unknownRole).toBe(1);
    // Top pool only: just the top Gwen game (Viego is a jungle champion for this player).
    expect(filterGames(games, { ...all, scope: "pool", role: "TOP" }, poolOf).games).toHaveLength(1);
  });

  it("counts a match once even when two linked accounts were in it, and can show one account", () => {
    const shared = [g("Ahri", "MID", { matchId: "same", accountId: "main" }), g("Ahri", "MID", { matchId: "same", accountId: "alt" }), g("Lux", "MID", { accountId: "alt" })];
    expect(filterGames(shared, all, poolOf).games).toHaveLength(2);
    // The alt alone still finds the shared match (account filter comes before de-duplication).
    expect(filterGames(shared, { ...all, accountId: "alt" }, poolOf).games).toHaveLength(2);
    expect(filterGames(shared, { ...all, accountId: "main" }, poolOf).games).toHaveLength(1);
  });

  it("respects season and game mode", () => {
    const mixed = [g("Ahri", "MID", { queueId: 440 }), g("Ahri", "MID", { patch: "15.20" }), g("Ahri", "MID")];
    expect(filterGames(mixed, { ...all, mode: "solo" }, poolOf).games).toHaveLength(1);
    expect(filterGames(mixed, all, poolOf).games).toHaveLength(2);
  });

  it("lists champions most played first and builds plain URLs", () => {
    expect(championsByGames(games)[0]).toEqual({ championId: "Gwen", games: 4 });
    expect(statsQuery({ season: 16, mode: "all" })).toBe("season=16&mode=all");
    expect(statsQuery({ season: 16, mode: "solo", role: "TOP", scope: "champion", championId: "Gwen", accountId: "a1" })).toBe("season=16&mode=solo&role=TOP&scope=champion&champion=Gwen&account=a1");
  });
});

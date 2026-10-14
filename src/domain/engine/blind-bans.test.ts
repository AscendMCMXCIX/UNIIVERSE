import { describe, expect, it } from "vitest";
import { recommendBlindBans } from "./blind-bans";
import { mergeEngineConfig } from "./config";
import { enemyTeamProfile } from "./evaluate";
import { MemoryStatsProvider, type MemoryStatsData } from "./memory-stats";
import type { SearchContext } from "./search";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, LINEUP, PLAYER_A } from "../../../tests/fixtures/players";

const champions = buildChampionMap();

function ctxWith(data: Partial<MemoryStatsData>): SearchContext {
  const stats = new MemoryStatsProvider({ patch: "15.19", sources: ["demo"], totalGames: 10_000, proGames: 0, roleStats: [], bans: [], matchups: [], synergies: [], pro: [], ...data });
  return { players: new Map(LINEUP.map((p) => [p.id, p])), champions, stats, config: mergeEngineConfig(), enemy: [], enemyProfile: enemyTeamProfile([], champions), memo: new Map(), unavailable: new Set() };
}

describe("team-specific blind bans", () => {
  it("works with no opponent information and returns reasons", () => {
    const ctx = ctxWith({ roleStats: [{ championId: "Darius", role: "TOP", games: 2500, wins: 1350 }], bans: [{ championId: "Darius", bans: 1500 }] });
    const r = recommendBlindBans(LINEUP, DEFAULT_ASSIGNMENT, ctx);
    expect(r.bans.length).toBeGreaterThan(0);
    expect(r.bans[0]!.reasons.length).toBeGreaterThan(0);
    expect(r.routes.length).toBeGreaterThan(0);
    expect(r.routes[0]!.members).toHaveLength(5);
  });

  it("raises a champion that is awkward for most of a player's pool above a generic meta pick", () => {
    // Fiora: top meta champion that is awkward into all three of Player A's top champions.
    // Darius: equally popular/strong but our top pool handles it fine.
    // Samples well above the matchup prior weight (400), so the lane evidence is clear.
    const matchups = ["Riven", "Gwen", "Ambessa"].flatMap((c) => [
      { championId: c, role: "TOP" as const, enemyChampionId: "Fiora", enemyRole: "TOP" as const, games: 1600, wins: 640 },
      { championId: c, role: "TOP" as const, enemyChampionId: "Darius", enemyRole: "TOP" as const, games: 1600, wins: 880 },
    ]);
    const ctx = ctxWith({
      roleStats: [
        { championId: "Fiora", role: "TOP", games: 2000, wins: 1040 },
        { championId: "Darius", role: "TOP", games: 2000, wins: 1040 },
      ],
      bans: [
        { championId: "Fiora", bans: 800 },
        { championId: "Darius", bans: 800 },
      ],
      matchups,
    });
    const r = recommendBlindBans(LINEUP, DEFAULT_ASSIGNMENT, ctx, { count: 10 });
    const fiora = r.bans.find((b) => b.championId === "Fiora");
    const darius = r.bans.find((b) => b.championId === "Darius");
    expect(fiora).toBeDefined();
    expect(fiora!.score).toBeGreaterThan(darius?.score ?? -1);
    expect(fiora!.threatens.some((t) => t.playerId === PLAYER_A.id && t.hurtChampions.length === 3)).toBe(true);
    expect(fiora!.reasons.join(" ")).toMatch(/Awkward for 3 of Player A's 3 Top champions/);
    expect(darius!.reasons.join(" ")).toMatch(/answer it/);
  });

  it("does not just copy the highest win rates", () => {
    // Kog'Maw: highest win rate but nobody on our side is pinched by it and we answer it.
    // Lane samples well above the matchup prior weight (400), so "we answer it" is clear.
    const ctx = ctxWith({
      roleStats: [
        { championId: "KogMaw", role: "ADC", games: 3000, wins: 1800 },
        { championId: "Camille", role: "TOP", games: 2500, wins: 1300 },
      ],
      bans: [{ championId: "Camille", bans: 1200 }],
      matchups: [
        ...["Jinx", "Kaisa", "Ezreal", "Sivir", "Xayah"].map((c) => ({ championId: c, role: "ADC" as const, enemyChampionId: "KogMaw", enemyRole: "ADC" as const, games: 2400, wins: 1360 })),
        ...["Riven", "Gwen", "Ambessa"].map((c) => ({ championId: c, role: "TOP" as const, enemyChampionId: "Camille", enemyRole: "TOP" as const, games: 1200, wins: 480 })),
      ],
    });
    const r = recommendBlindBans(LINEUP, DEFAULT_ASSIGNMENT, ctx, { count: 10 });
    const camille = r.bans.findIndex((b) => b.championId === "Camille");
    const kog = r.bans.findIndex((b) => b.championId === "KogMaw");
    expect(camille).toBeGreaterThanOrEqual(0);
    expect(kog === -1 || kog > camille).toBe(true);
  });

  it("reports pool depth risks per role", () => {
    const ctx = ctxWith({});
    const r = recommendBlindBans(LINEUP, DEFAULT_ASSIGNMENT, ctx);
    expect(r.poolDepth).toHaveLength(5);
    expect(r.poolDepth.find((d) => d.role === "TOP")?.options).toBe(3);
  });
});

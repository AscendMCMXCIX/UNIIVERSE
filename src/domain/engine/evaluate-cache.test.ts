import { describe, expect, it } from "vitest";
import { compositionIdentity, IDENTITIES, type Identity } from "../composition/identity";
import { teamProfile } from "../composition";
import { estimateEnemyRoles } from "./enemy";
import { enemyTeamProfile, evaluateTeam, type EvalContext } from "./evaluate";
import { mergeEngineConfig } from "./config";
import { MemoryStatsProvider } from "./memory-stats";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { LINEUP } from "../../../tests/fixtures/players";

/*
  The evaluation caches (member parts, pair parts, completions) live per evaluation memo. A
  hypothetical enemy draft (what-if) uses a new memo, so it must never see lane values computed
  against the real enemy.
*/

const champions = buildChampionMap();
const stats = new MemoryStatsProvider({
  patch: "16.20",
  sources: ["ranked"],
  totalGames: 5000,
  proGames: 0,
  roleStats: [
    { championId: "Orianna", role: "MID", games: 800, wins: 400 },
    { championId: "Syndra", role: "MID", games: 800, wins: 400 },
    { championId: "Zed", role: "MID", games: 800, wins: 400 },
  ],
  bans: [],
  // Orianna crushes Syndra and loses badly to Zed.
  matchups: [
    { championId: "Orianna", role: "MID", enemyChampionId: "Syndra", enemyRole: "MID", games: 2000, wins: 1300 },
    { championId: "Orianna", role: "MID", enemyChampionId: "Zed", enemyRole: "MID", games: 2000, wins: 700 },
  ],
  synergies: [],
  pro: [],
});

function ctxAgainst(enemy: string[], memo = new Map()): EvalContext {
  return {
    players: new Map(LINEUP.map((p) => [p.id, p])),
    champions,
    stats,
    config: mergeEngineConfig(),
    enemy: estimateEnemyRoles(enemy, champions, stats),
    enemyProfile: enemyTeamProfile(enemy, champions),
    memo,
  };
}

describe("evaluation caches", () => {
  it("a new memo (a hypothetical enemy) never reuses lane values from another enemy", () => {
    const team = [{ playerId: "player-b", role: "MID" as const, championId: "Orianna" }];
    const real = ctxAgainst(["Syndra"]);
    const intoSyndra = evaluateTeam(team, real).components.lane;
    const hypothetical = { ...real, enemy: estimateEnemyRoles(["Zed"], champions, stats), enemyProfile: enemyTeamProfile(["Zed"], champions), memo: new Map() };
    const intoZed = evaluateTeam(team, hypothetical).components.lane;
    expect(intoSyndra).toBeGreaterThan(0);
    expect(intoZed).toBeLessThan(0);
    // Same answers as a context that never saw the other enemy.
    expect(intoZed).toBe(evaluateTeam(team, ctxAgainst(["Zed"])).components.lane);
    expect(evaluateTeam(team, real).components.lane).toBe(intoSyndra);
  });

  it("scores a team the same whatever order its members are given in", () => {
    const ctx = ctxAgainst(["Syndra", "Zed"]);
    const a = [
      { playerId: "player-b", role: "MID" as const, championId: "Orianna" },
      { playerId: "player-a", role: "TOP" as const, championId: "Riven" },
      { playerId: "player-e", role: "SUPPORT" as const, championId: "Nautilus" },
    ];
    const first = evaluateTeam(a, ctx);
    const fresh = evaluateTeam([a[2]!, a[0]!, a[1]!], ctxAgainst(["Syndra", "Zed"]));
    expect(fresh.total).toBeCloseTo(first.total, 12);
  });
});

describe("composition identity", () => {
  it("picks the same primary and secondary as a stable sort, ties included", () => {
    const reference = (scores: Record<Identity, number>) => {
      const ranked = (Object.entries(scores) as Array<[Identity, number]>).sort((x, y) => y[1] - x[1]);
      return { primary: ranked[0]![0], secondary: ranked[1]![1] >= ranked[0]![1] * 0.8 ? ranked[1]![0] : null };
    };
    const all = [...champions.keys()];
    // Real teams, plus profiles with deliberate ties (empty team: every score 0).
    const teams = [[], ["Orianna"], ["Malphite", "Orianna", "MissFortune"], ["Zed", "Talon", "Qiyana", "Nidalee", "Pyke"], ["Ornn", "Sejuani", "Orianna", "Jinx", "Lulu"]];
    for (let i = 0; i < 40; i++) teams.push(all.slice(i * 3, i * 3 + 5));
    for (const team of teams) {
      const profile = teamProfile(team.map((id) => champions.get(id)?.profile.traits).filter((t): t is NonNullable<typeof t> => !!t));
      const got = compositionIdentity(profile);
      const want = reference(got.scores);
      expect({ primary: got.primary, secondary: got.secondary }).toEqual(want);
    }
    expect(IDENTITIES.length).toBe(8);
  });
});

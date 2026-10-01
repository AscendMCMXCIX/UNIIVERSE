import { describe, expect, it } from "vitest";
import { assessScouting, banDamage, likelyPicks, performanceAnomaly, type ScoutedPlayer } from "./index";
import { buildPreDraftPlan } from "../predraft";
import { mergeEngineConfig } from "../engine/config";
import { enemyTeamProfile } from "../engine/evaluate";
import { MemoryStatsProvider } from "../engine/memory-stats";
import type { SearchContext } from "../engine/search";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, LINEUP } from "../../../tests/fixtures/players";

const champions = buildChampionMap();
const now = new Date("2026-10-01T00:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

function scouted(partial: Partial<ScoutedPlayer> & { id: string; label: string }): ScoutedPlayer {
  return { likelyRole: null, altRole: null, identityConfidence: "unknown", accountsTotal: 0, accountsResolved: 0, lastSyncAt: null, history: [], mastery: [], rank: null, notes: "", ...partial };
}

const stats = new MemoryStatsProvider({
  patch: "15.19",
  sources: ["demo"],
  totalGames: 10_000,
  proGames: 0,
  roleStats: [
    { championId: "Camille", role: "TOP", games: 2000, wins: 1060 },
    { championId: "Darius", role: "TOP", games: 2000, wins: 1000 },
    { championId: "Gnar", role: "TOP", games: 1500, wins: 740 },
  ],
  bans: [],
  matchups: [],
  synergies: [],
  pro: [],
});
const ctx: SearchContext = { players: new Map(LINEUP.map((p) => [p.id, p])), champions, stats, config: mergeEngineConfig(), enemy: [], enemyProfile: enemyTeamProfile([], champions), memo: new Map(), unavailable: new Set() };

describe("scouting", () => {
  const strongTop = scouted({
    id: "o1",
    label: "敵のトップ",
    likelyRole: "TOP",
    identityConfidence: "high",
    accountsTotal: 1,
    accountsResolved: 1,
    lastSyncAt: daysAgo(1),
    history: [
      { championId: "Camille", role: "TOP", games: 40, wins: 27, lastPlayedAt: daysAgo(2), patchDistance: 0 },
      { championId: "Darius", role: "TOP", games: 10, wins: 5, lastPlayedAt: daysAgo(20), patchDistance: 0 },
    ],
    mastery: [{ championId: "Camille", points: 400_000, level: 7, lastPlayedAt: daysAgo(2) }],
    rank: { tier: "GOLD", division: "I", lp: 60, wins: 70, losses: 40 },
  });

  it("assesses confidence and flags performance cautiously", () => {
    const a = assessScouting(strongTop, { now });
    expect(a.confidence).toBe("high");
    expect(a.anomaly.level).not.toBe("none");
    expect(a.anomaly.notes[0]).toMatch(/appears stronger than visible rank/);
    const unknown = assessScouting(scouted({ id: "o2", label: "Enemy Jungle" }), { now });
    expect(unknown.confidence).toBe("unknown");
    expect(unknown.weight).toBeLessThan(0.2);
    expect(performanceAnomaly(scouted({ id: "x", label: "x" })).level).toBe("none");
  });

  it("derives likely picks from proficiency, recency and meta", () => {
    const picks = likelyPicks(strongTop, stats, champions);
    expect(picks[0]?.championId).toBe("Camille");
    expect(picks[0]?.role).toBe("TOP");
  });

  it("ban damage prefers the pick that hurts their pool, and downweights low-confidence scouting", () => {
    const high = { player: strongTop, assessment: { ...assessScouting(strongTop, { now }), likelyPicks: likelyPicks(strongTop, stats, champions) } };
    const lowPlayer = scouted({ ...strongTop, id: "o3", label: "Maybe Top", identityConfidence: "low", history: strongTop.history.map((h) => ({ ...h, games: 4, wins: 2 })) });
    const low = { player: lowPlayer, assessment: { ...assessScouting(lowPlayer, { now }), likelyPicks: likelyPicks(lowPlayer, stats, champions) } };
    const dHigh = banDamage([high], stats, champions, () => []);
    const dLow = banDamage([low], stats, champions, () => []);
    expect(dHigh[0]?.championId).toBe("Camille");
    expect(dHigh[0]!.score).toBeGreaterThan(dLow[0]?.score ?? 0);
    // If we can simply answer it, the ban loses value.
    const answered = banDamage([high], stats, champions, (c) => (c === "Camille" ? ["Gwen", "Ambessa"] : []));
    expect(answered[0]!.score).toBeLessThan(dHigh[0]!.score);
    expect(answered[0]!.reasons.join(" ")).toMatch(/answer it/);
  });

  it("pre-draft plan works with zero, partial and full opponent information", () => {
    const none = buildPreDraftPlan({ mode: "clash", players: LINEUP, assignment: DEFAULT_ASSIGNMENT, ctx, opponents: [], now });
    expect(none.bans.length).toBeGreaterThan(0);
    expect(none.scouting.available).toBe(false);
    expect(none.routes.length).toBeGreaterThan(0);
    expect(none.poolRisks).toHaveLength(5);

    const partial = buildPreDraftPlan({ mode: "clash", players: LINEUP, assignment: DEFAULT_ASSIGNMENT, ctx, opponents: [strongTop, scouted({ id: "o2", label: "Enemy Jungle" })], now });
    expect(partial.scouting.available).toBe(true);
    expect(partial.scouting.players).toHaveLength(2);
    expect(partial.bans.some((b) => b.championId === "Camille" && (b.source === "scouting" || b.source === "both"))).toBe(true);
    expect(partial.expectedPriorities[0]?.label).toBe("敵のトップ");
    expect(partial.scouting.summary).toMatch(/1 of 2/);
  });
});

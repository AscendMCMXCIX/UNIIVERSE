import { describe, expect, it } from "vitest";
import { applyAction, type DraftState } from "../draft";
import { recommend, type PickRecommendation } from "./index";
import { MemoryStatsProvider } from "./memory-stats";
import type { ProficiencyEstimate, ProficiencyLookup } from "../proficiency";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, LINEUP, PLAYER_A } from "../../../tests/fixtures/players";

const champions = buildChampionMap();

function afterBans(side: "blue" | "red", bans: Array<string | null>): DraftState {
  let state: DraftState = { side, actions: [], assignments: { ...DEFAULT_ASSIGNMENT } };
  for (const b of bans) {
    const r = applyAction(state, { championId: b });
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

const est = (championId: string, score: number, tier: ProficiencyEstimate["tier"]): ProficiencyEstimate => ({ championId, role: "TOP", score, confidence: 0.9, tier, games: 80, recentGames: 10, roleShare: 1, performance: 0.55, lastPlayedAt: new Date(), notes: [] });

describe("proficiency in the engine", () => {
  // Make Top the obvious first pick by giving top champions strong current-patch evidence.
  const stats = new MemoryStatsProvider({
    patch: "15.19",
    sources: ["demo"],
    totalGames: 10_000,
    proGames: 0,
    roleStats: [
      { championId: "Riven", role: "TOP", games: 2000, wins: 1040 },
      { championId: "Gwen", role: "TOP", games: 2000, wins: 1040 },
      { championId: "Ambessa", role: "TOP", games: 2000, wins: 1040 },
    ],
    bans: [],
    matchups: [],
    synergies: [],
    pro: [],
  });

  it("breaks a close decision towards the player's stronger real champion", () => {
    const draft = afterBans("blue", [null, null, null, null, null, null]);
    const baseline = recommend({ players: LINEUP, draft, champions, stats });
    const topPicks = baseline.bestFit.filter((m) => m.role === "TOP");
    expect(topPicks).toHaveLength(1);
    const prof: ProficiencyLookup = (playerId, championId) => (playerId === PLAYER_A.id && championId === "Gwen" ? est("Gwen", 0.9, "core") : playerId === PLAYER_A.id ? est(championId, 0.35, "rusty") : null);
    const withProf = recommend({ players: LINEUP, draft, champions, stats, proficiency: prof });
    expect(withProf.bestFit.find((m) => m.role === "TOP")?.championId).toBe("Gwen");
    const pick = withProf.primary as PickRecommendation;
    if (pick.role === "TOP") expect(pick.why.join(" ")).toMatch(/core comfort/);
  });

  it("does not override a severe strategic problem", () => {
    // Riven is the player's core comfort, but the revealed enemy Top crushes Riven in lane.
    const badLane = new MemoryStatsProvider({
      patch: "15.19",
      sources: ["demo"],
      totalGames: 10_000,
      proGames: 0,
      roleStats: [
        { championId: "Riven", role: "TOP", games: 2000, wins: 1040 },
        { championId: "Gwen", role: "TOP", games: 2000, wins: 1040 },
        { championId: "Malphite", role: "TOP", games: 2000, wins: 1000 },
      ],
      bans: [],
      matchups: [{ championId: "Riven", role: "TOP", enemyChampionId: "Malphite", enemyRole: "TOP", games: 600, wins: 180 }],
      synergies: [],
      pro: [],
    });
    let draft = afterBans("red", [null, null, null, null, null, null]);
    const r = applyAction(draft, { championId: "Malphite" }); // blue first pick
    if (!r.ok) throw new Error(r.error);
    draft = r.state;
    const prof: ProficiencyLookup = (playerId, championId) => (playerId === PLAYER_A.id && championId === "Riven" ? est("Riven", 0.95, "core") : null);
    const result = recommend({ players: LINEUP, draft, champions, stats: badLane, proficiency: prof });
    expect(result.bestFit.find((m) => m.role === "TOP")?.championId).not.toBe("Riven");
  });

  it("never makes a wrong-role pool champion legal, whatever the proficiency", () => {
    const draft = afterBans("blue", [null, null, null, null, null, null]);
    const prof: ProficiencyLookup = (playerId, championId) => (playerId === PLAYER_A.id && championId === "Ahri" ? est("Ahri", 1, "core") : null);
    const result = recommend({ players: LINEUP, draft, champions, stats, proficiency: prof });
    for (const m of result.bestFit) {
      if (m.playerId === PLAYER_A.id && m.role === "TOP") expect(["Riven", "Gwen", "Ambessa"]).toContain(m.championId);
    }
  });
});

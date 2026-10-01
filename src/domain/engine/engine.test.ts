import { describe, expect, it } from "vitest";
import { applyAction, type DraftState } from "../draft";
import type { Role } from "../roles";
import { EMPTY_STATS, MemoryStatsProvider } from "./memory-stats";
import { recommend, type PickRecommendation, type PairRecommendation, type RecommendationResult } from "./index";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, LINEUP, PLAYER_A, PLAYER_B, PLAYER_C, PLAYER_D, PLAYER_E, PLAYER_SUB } from "../../../tests/fixtures/players";
import { poolFor } from "../roster/eligibility";

const champions = buildChampionMap();

function draftAfter(side: "blue" | "red", actions: Array<{ championId: string | null; role?: Role }>, assignments = DEFAULT_ASSIGNMENT): DraftState {
  let state: DraftState = { side, actions: [], assignments: { ...assignments } };
  for (const a of actions) {
    const res = applyAction(state, a);
    if (!res.ok) throw new Error(res.error);
    state = res.state;
  }
  return state;
}

function allPicks(result: RecommendationResult): PickRecommendation[] {
  const out: PickRecommendation[] = [];
  const push = (r: PickRecommendation | PairRecommendation | { kind: "ban" } | null) => {
    if (!r) return;
    if (r.kind === "pick") out.push(r);
    if (r.kind === "pair") out.push(...r.picks);
  };
  push(result.primary);
  for (const a of result.alternatives) push(a);
  return out;
}

const bans = (ids: Array<string | null>) => ids.map((championId) => ({ championId }));

describe("recommendation engine — hard player constraint", () => {
  it("never recommends a champion outside the assigned player's eligible pool", () => {
    const draft = draftAfter("blue", bans([null, null, null, null, null, null]));
    const result = recommend({ players: LINEUP, draft, champions, stats: EMPTY_STATS });
    expect(result.kind).toBe("pick");
    for (const pick of allPicks(result)) {
      const player = LINEUP.find((p) => p.id === pick.playerId)!;
      expect(poolFor(player, pick.role)).toContain(pick.championId);
    }
    for (const m of result.bestFit) {
      const player = LINEUP.find((p) => p.id === m.playerId)!;
      expect(poolFor(player, m.role)).toContain(m.championId);
    }
  });

  it("never recommends a banned champion", () => {
    const draft = draftAfter("blue", bans(["Jinx", "Orianna", "Viego", "Nautilus", "Riven", "Kaisa"]));
    const result = recommend({ players: LINEUP, draft, champions, stats: EMPTY_STATS });
    const banned = new Set(["Jinx", "Orianna", "Viego", "Nautilus", "Riven", "Kaisa"]);
    for (const pick of allPicks(result)) expect(banned.has(pick.championId)).toBe(false);
    for (const m of result.bestFit) expect(banned.has(m.championId)).toBe(false);
  });

  it("never recommends a champion already picked by either side", () => {
    const draft = draftAfter("blue", [
      ...bans([null, null, null, null, null, null]),
      { championId: "Jinx", role: "ADC" }, // B1 (ours)
      { championId: "Orianna" }, // R1 — enemy takes Player B's first choice
      { championId: "Viego" }, // R2 — enemy takes Player C's first choice
    ]);
    const result = recommend({ players: LINEUP, draft, champions, stats: EMPTY_STATS });
    expect(result.kind).toBe("pair");
    const taken = new Set(["Jinx", "Orianna", "Viego"]);
    for (const pick of allPicks(result)) expect(taken.has(pick.championId)).toBe(false);
    for (const m of result.bestFit) {
      if (!m.locked) expect(taken.has(m.championId)).toBe(false);
    }
    // ADC is already filled by our Jinx; recommendations must not touch it again.
    for (const pick of allPicks(result)) expect(pick.role).not.toBe("ADC");
  });

  it("only exposes a secondary pool when the player is actually assigned the secondary role", () => {
    const draft = draftAfter("blue", bans([null, null, null, null, null, null]));
    const result = recommend({ players: LINEUP, draft, champions, stats: EMPTY_STATS });
    // Player A is Top under the default assignment: Ahri/Lissandra (secondary mid pool) are not options for them.
    for (const pick of allPicks(result)) {
      if (pick.playerId === PLAYER_A.id) expect(["Riven", "Gwen", "Ambessa"]).toContain(pick.championId);
      if (pick.playerId === PLAYER_B.id) expect(["Orianna", "Syndra", "Azir", "Galio"]).toContain(pick.championId);
    }
  });

  it("is controlled by the active lineup: swapping a player changes the available options", () => {
    const draft = draftAfter("blue", bans([null, null, null, null, null, null]));
    const withSub = [PLAYER_SUB, PLAYER_B, PLAYER_C, PLAYER_D, PLAYER_E];
    const result = recommend({ players: withSub, draft: { ...draft, assignments: { ...DEFAULT_ASSIGNMENT, TOP: PLAYER_SUB.id } }, champions, stats: EMPTY_STATS });
    const top = result.bestFit.find((m) => m.role === "TOP")!;
    expect(top.playerId).toBe(PLAYER_SUB.id);
    expect(["Ornn", "Sion", "Malphite"]).toContain(top.championId);
    expect(result.bestFit.some((m) => ["Riven", "Gwen", "Ambessa"].includes(m.championId))).toBe(false);
  });
});

describe("recommendation engine — role flexing", () => {
  it("recommends a legal role swap when bans wipe out a player's primary pool", () => {
    // All of Player A's Top champions are banned; A still has Ahri/Lissandra mid, B has Jax/K'Sante top.
    const draft = draftAfter("blue", bans(["Riven", "Gwen", "Ambessa", null, null, null]));
    const result = recommend({ players: LINEUP, draft, champions, stats: EMPTY_STATS });
    expect(result.roleSwap).not.toBeNull();
    expect(result.assignment.TOP).toBe(PLAYER_B.id);
    expect(result.assignment.MID).toBe(PLAYER_A.id);
    expect(result.roleSwap!.moves.map((m) => `${m.displayName}:${m.from}->${m.to}`).sort()).toEqual(["Player A:TOP->MID", "Player B:MID->TOP"]);
    // After the swap, recommendations draw from the secondary pools.
    for (const m of result.bestFit) {
      if (m.playerId === PLAYER_A.id) expect(["Ahri", "Lissandra"]).toContain(m.championId);
      if (m.playerId === PLAYER_B.id) expect(["Jax", "KSante"]).toContain(m.championId);
    }
    expect(result.roleSwap!.why.join(" ")).toMatch(/pool is down to 0/);
  });

  it("does not force a swap when the primary roles are perfectly fine", () => {
    const draft = draftAfter("blue", bans([null, null, null, null, null, null]));
    const result = recommend({ players: LINEUP, draft, champions, stats: EMPTY_STATS });
    expect(result.roleSwap).toBeNull();
    expect(result.assignment).toEqual(DEFAULT_ASSIGNMENT);
  });

  it("never assigns a player outside their configured roles even under heavy bans", () => {
    // Jungle-only Player C: banning all junglers cannot move anyone into jungle.
    const draft = draftAfter("blue", bans(["Viego", "LeeSin", "Vi", "JarvanIV", "Sejuani", null]));
    const result = recommend({ players: LINEUP, draft, champions, stats: EMPTY_STATS });
    expect(result.assignment.JUNGLE).toBe(PLAYER_C.id);
    expect(result.bestFit.find((m) => m.role === "JUNGLE")).toBeUndefined();
  });
});

describe("recommendation engine — draft timing", () => {
  it("evaluates consecutive pick windows as a pair with distinct roles", () => {
    const stats = new MemoryStatsProvider({
      patch: "15.19",
      sources: ["demo"],
      totalGames: 10_000,
      proGames: 0,
      roleStats: [
        { championId: "Jinx", role: "ADC", games: 2000, wins: 1120 },
        { championId: "Kaisa", role: "ADC", games: 2000, wins: 1100 },
        { championId: "Ezreal", role: "ADC", games: 1500, wins: 760 },
      ],
      bans: [],
      matchups: [],
      synergies: [],
      pro: [],
    });
    // Red side: blue picks B1, then we have R1/R2.
    const draft = draftAfter("red", [...bans([null, null, null, null, null, null]), { championId: "Aatrox" }]);
    const result = recommend({ players: LINEUP, draft, champions, stats });
    expect(result.kind).toBe("pair");
    const pair = result.primary as PairRecommendation;
    expect(pair.picks[0].role).not.toBe(pair.picks[1].role);
    expect(pair.picks[0].championId).not.toBe(pair.picks[1].championId);
    // Even though the two best singles are both ADCs, the pair must cover two roles.
    expect(pair.why.length).toBeGreaterThan(0);
  });

  it("returns ban recommendations with reasons during ban phases", () => {
    const stats = new MemoryStatsProvider({
      patch: "15.19",
      sources: ["demo"],
      totalGames: 10_000,
      proGames: 100,
      roleStats: [
        { championId: "Darius", role: "TOP", games: 3000, wins: 1620 },
        { championId: "Riven", role: "TOP", games: 2000, wins: 1000 },
      ],
      bans: [{ championId: "Darius", bans: 3000 }],
      matchups: [{ championId: "Riven", role: "TOP", enemyChampionId: "Darius", enemyRole: "TOP", games: 400, wins: 150 }],
      synergies: [],
      pro: [{ championId: "Darius", picks: 30, bans: 40 }],
    });
    const draft = draftAfter("blue", []);
    const result = recommend({ players: LINEUP, draft, champions, stats });
    expect(result.kind).toBe("ban");
    expect(result.primary?.kind).toBe("ban");
    const ban = result.primary as { championId: string; why: string[] };
    expect(ban.championId).toBe("Darius");
    expect(ban.why.join(" ")).toMatch(/pick|ban|Strong into/);
  });

  it("flags value at risk when a contested champion is likely to be denied", () => {
    const stats = new MemoryStatsProvider({
      patch: "15.19",
      sources: ["demo"],
      totalGames: 10_000,
      proGames: 0,
      roleStats: [{ championId: "Jinx", role: "ADC", games: 3000, wins: 1700 }],
      bans: [{ championId: "Jinx", bans: 4000 }],
      matchups: [],
      synergies: [],
      pro: [],
    });
    const draft = draftAfter("blue", bans([null, null, null, null, null, null]));
    const result = recommend({ players: LINEUP, draft, champions, stats });
    const pick = result.primary as PickRecommendation;
    expect(pick.championId).toBe("Jinx");
    expect(pick.candidate.timing.denialProbability).toBeGreaterThan(0.3);
    expect(pick.why.join(" ")).toMatch(/Likely gone|Contested/);
  });

  it("completes a first pick within a sensible time budget", () => {
    const draft = draftAfter("blue", bans([null, null, null, null, null, null]));
    const started = Date.now();
    const result = recommend({ players: LINEUP, draft, champions, stats: EMPTY_STATS });
    expect(result.primary).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(2500);
  });
});

describe("recommendation engine — explanations", () => {
  it("explains picks in plain language and reports a projected best fit", () => {
    const draft = draftAfter("blue", [
      ...bans([null, null, null, null, null, null]),
      { championId: "Jinx", role: "ADC" },
      { championId: "Xerath" },
      { championId: "Jayce" },
    ]);
    const result = recommend({ players: LINEUP, draft, champions, stats: EMPTY_STATS });
    expect(result.bestFit).toHaveLength(5);
    expect(result.bestFit.filter((m) => m.locked)).toHaveLength(1);
    const picks = allPicks(result);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks[0]!.why.length).toBeGreaterThan(0);
    expect(result.enemy.roles.map((r) => r.championId).sort()).toEqual(["Jayce", "Xerath"]);
    expect(result.confidence).toBe("none");
    expect(result.needs.length).toBeGreaterThanOrEqual(0);
  });
});

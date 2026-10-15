import { describe, expect, it } from "vitest";
import { applyAction, deriveDraft, type DraftState } from "../draft";
import type { Role } from "../roles";
import { MemoryStatsProvider, type MemoryStatsData } from "./memory-stats";
import { recommend } from "./index";
import { assessTiming, enemyActionShares } from "./timing";
import { estimateEnemyRoles } from "./enemy";
import { enemyTeamProfile, type EvalContext } from "./evaluate";
import { mergeEngineConfig } from "./config";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, LINEUP } from "../../../tests/fixtures/players";

/*
  Denial risk ("likely gone before our next pick") from per-game rates. A game holds ten bans and
  ten picks, so a 30% ban rate is not a 30% chance per enemy ban: each enemy action is one choice
  among the champions still available, in proportion to how often each is banned or played.
*/

const champions = buildChampionMap();

function stats(extra: Partial<MemoryStatsData> = {}): MemoryStatsProvider {
  return new MemoryStatsProvider({
    patch: "16.20",
    sources: ["ranked"],
    totalGames: 10_000,
    proGames: 0,
    // ADC: Jinx 10%, Kaisa 30%, Ezreal 60% of the role's games. MID: Orianna 50%, Syndra 50%.
    roleStats: [
      { championId: "Jinx", role: "ADC", games: 1000, wins: 520 },
      { championId: "Kaisa", role: "ADC", games: 3000, wins: 1500 },
      { championId: "Ezreal", role: "ADC", games: 6000, wins: 3000 },
      { championId: "Orianna", role: "MID", games: 5000, wins: 2500 },
      { championId: "Syndra", role: "MID", games: 5000, wins: 2500 },
    ],
    // Ban counts (games where banned): Jinx 3000, Zed 5000, Kaisa 2000. Total 10,000.
    bans: [
      { championId: "Jinx", bans: 3000 },
      { championId: "Zed", bans: 5000 },
      { championId: "Kaisa", bans: 2000 },
    ],
    matchups: [],
    synergies: [],
    pro: [],
    ...extra,
  });
}

function ctx(s: MemoryStatsProvider, enemy: string[] = []): EvalContext {
  return {
    players: new Map(LINEUP.map((p) => [p.id, p])),
    champions,
    stats: s,
    config: mergeEngineConfig(),
    enemy: estimateEnemyRoles(enemy, champions, s),
    enemyProfile: enemyTeamProfile(enemy, champions),
    memo: new Map(),
  };
}

describe("enemy action shares", () => {
  it("a ban takes a champion in proportion to its ban count among available champions", () => {
    const shares = enemyActionShares(ctx(stats()), new Set());
    expect(shares.ban("Jinx")).toBeCloseTo(0.3, 6);
    expect(shares.ban("Zed")).toBeCloseTo(0.5, 6);
    // Zed banned: the rest of the ban share is redistributed.
    const after = enemyActionShares(ctx(stats()), new Set(["Zed"]));
    expect(after.ban("Zed")).toBe(0);
    expect(after.ban("Jinx")).toBeCloseTo(0.6, 6);
  });

  it("a pick fills one of the enemy's open roles, then takes the champion with its share of that role", () => {
    const shares = enemyActionShares(ctx(stats()), new Set());
    // Five open roles, Jinx is 10% of ADC games: 1/5 × 0.1.
    expect(shares.pick("Jinx")).toBeCloseTo(0.02, 6);
    expect(shares.pick("Ezreal")).toBeCloseTo(0.12, 6);
    // Ezreal gone: Jinx is now 1,000 of the 4,000 available ADC games.
    expect(enemyActionShares(ctx(stats()), new Set(["Ezreal"])).pick("Jinx")).toBeCloseTo(0.05, 6);
  });

  it("a role the enemy has already filled is not picked again", () => {
    const shares = enemyActionShares(ctx(stats(), ["Kaisa"]), new Set(["Kaisa"]));
    expect(shares.pick("Jinx")).toBeLessThan(0.005);
    expect(shares.pick("Orianna")).toBeGreaterThan(0.1);
  });
});

function draftAfter(actions: Array<{ championId: string | null; role?: Role; playerId?: string }>): DraftState {
  let state: DraftState = { side: "blue", formatId: "tournament", actions: [], assignments: { ...DEFAULT_ASSIGNMENT } };
  for (const a of actions) {
    const r = applyAction(state, a);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

describe("denial risk in recommendations", () => {
  it("is a probability over the enemy's actual next actions, not a per-game rate", () => {
    // Blue B1 after six bans: the enemy picks R1 and R2 before our next pick (no bans ahead).
    const derived = deriveDraft(draftAfter([null, null, null, null, null, null].map((championId) => ({ championId }))));
    const c = ctx(stats());
    const timing = assessTiming({ championId: "Jinx", role: "ADC", playerId: "player-d", fitScore: 0.1, fallbackScore: 0.05, derived, ctx: c, players: LINEUP, roleHold: { voi: 0, variance: new Map(), evidence: new Map() } });
    // Per pick: 1/5 open roles × 10% of ADC games × 1.4 priority; two picks. The 30% ban rate does not apply: no bans ahead.
    expect(timing.denialProbability).toBeCloseTo(1 - Math.pow(1 - 0.02 * 1.4, 2), 6);
    expect(timing.denialProbability).toBeLessThan(0.06);
    // Before the first ban (blue B1 ban): three enemy bans and no picks before our first pick.
    const atStart = deriveDraft(draftAfter([]));
    const early = assessTiming({ championId: "Jinx", role: "ADC", playerId: "player-d", fitScore: 0.1, fallbackScore: 0.05, derived: { ...atStart, nextStep: atStart.steps.find((s) => s.type === "pick" && s.side === "blue")! }, ctx: c, players: LINEUP, roleHold: { voi: 0, variance: new Map(), evidence: new Map() } });
    expect(early.denialProbability).toBeGreaterThan(0);
    expect(early.denialProbability).toBeLessThan(0.8);
  });

  it("never calls a champion blind-safe when its matchups have no evidence behind them", () => {
    // No matchup rows at all: every lane estimate is the prior, so the spread is zero.
    const draft = draftAfter([null, null, null, null, null, null].map((championId) => ({ championId })));
    const result = recommend({ players: LINEUP, draft, champions, stats: stats() });
    for (const p of [result.primary, ...result.alternatives]) {
      const picks = p?.kind === "pick" ? [p] : p?.kind === "pair" ? p.picks : [];
      for (const x of picks) expect(x.candidate.timing.reasons.join(" ")).not.toMatch(/Safe blind pick/);
    }
  });
});

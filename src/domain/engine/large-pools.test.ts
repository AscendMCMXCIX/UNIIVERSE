import { describe, expect, it } from "vitest";
import { applyAction, type DraftState } from "../draft";
import { ROLES, type Role } from "../roles";
import { poolFor } from "../roster/eligibility";
import type { PlayerProfile } from "../roster/types";
import { EMPTY_STATS } from "./memory-stats";
import { recommend, type PickRecommendation } from "./index";
import { buildChampionMap } from "../../../tests/fixtures/champions";
import { DEFAULT_ASSIGNMENT, LINEUP } from "../../../tests/fixtures/players";

const champions = buildChampionMap();
const all = [...champions.keys()];

/** Every champion whose curated profile lists the role, so pools are large but realistic. */
function roleChampions(role: Role): string[] {
  return all.filter((id) => (champions.get(id)?.profile.rolePrior[role] ?? 0) >= 0.2);
}

// Uncapped pools: each player lists every plausible champion for their roles, plus a third role.
const BIG: PlayerProfile[] = LINEUP.map((p) => {
  const extra = ROLES.find((r) => r !== p.primaryRole && r !== p.secondaryRole)!;
  return { ...p, primaryPool: roleChampions(p.primaryRole), secondaryPool: p.secondaryRole ? roleChampions(p.secondaryRole).slice(0, 25) : [], additionalRoles: [{ role: extra, pool: roleChampions(extra).slice(0, 15) }] };
});

function draftAfter(actions: Array<{ championId: string | null; role?: Role }>): DraftState {
  let state: DraftState = { side: "blue", actions: [], assignments: { ...DEFAULT_ASSIGNMENT } };
  for (const a of actions) {
    const r = applyAction(state, a);
    if (!r.ok) throw new Error(r.error);
    state = r.state;
  }
  return state;
}

describe("recommendations with large, uncapped pools", () => {
  it("stays legal and fast", () => {
    expect(BIG[0]!.primaryPool.length).toBeGreaterThan(20);
    const draft = draftAfter([{ championId: null }, { championId: null }, { championId: null }, { championId: null }, { championId: null }, { championId: null }]);
    const started = performance.now();
    const result = recommend({ players: BIG, draft, champions, stats: EMPTY_STATS });
    const ms = performance.now() - started;
    expect(result.kind === "pick" || result.kind === "pair").toBe(true);
    const picks: PickRecommendation[] = [];
    for (const r of [result.primary, ...result.alternatives]) {
      if (r?.kind === "pick") picks.push(r);
      if (r?.kind === "pair") picks.push(...r.picks);
    }
    for (const pick of picks) {
      const player = BIG.find((p) => p.id === pick.playerId)!;
      expect(poolFor(player, pick.role)).toContain(pick.championId);
    }
    // Generous bound for slow CI machines; locally this is well under a second.
    expect(ms).toBeLessThan(4000);
  });
});

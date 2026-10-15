/**
 * Development only: deterministic draft situations for the engine benchmark. Each builds an
 * EngineInput from the shared simulated statistics; champion choices for bans and enemy picks are
 * taken from the simulated meta (most played / most banned), never random.
 */
import { applyAction, type DraftState } from "@/domain/draft";
import { ROLES, type Role } from "@/domain/roles";
import { legalRolesFor, poolFor } from "@/domain/roster/eligibility";
import type { PlayerProfile } from "@/domain/roster/types";
import type { ChampionInfo, EngineInput, StatsProvider } from "@/domain/engine";
import type { ProficiencyEstimate, ProficiencyLookup } from "@/domain/proficiency";
import type { EnemyTendencies } from "@/domain/engine/tendencies";
import { DEFAULT_ASSIGNMENT, LINEUP } from "../../tests/fixtures/players";

export interface Scenario {
  name: string;
  input: EngineInput;
}

type Action = { championId: string | null; role?: Role; playerId?: string };

function play(base: Omit<DraftState, "actions">, actions: Action[]): DraftState {
  let state: DraftState = { ...base, actions: [] };
  for (const a of actions) {
    const r = applyAction(state, a);
    if (!r.ok) throw new Error(`scenario action failed: ${r.error}`);
    state = r.state;
  }
  return state;
}

/** A synthetic but stable proficiency lookup: earlier pool champions are better known. */
export function syntheticProficiency(players: PlayerProfile[]): ProficiencyLookup {
  const table = new Map<string, ProficiencyEstimate>();
  for (const p of players) {
    for (const role of legalRolesFor(p)) {
      const pool = poolFor(p, role);
      pool.forEach((championId, i) => {
        const main = role === p.primaryRole;
        const games = Math.max(0, Math.round((main ? 120 : 30) / (1 + i)));
        const score = Math.min(0.92, 0.5 + games / 300);
        table.set(`${p.id}|${championId}|${role}`, {
          championId,
          role,
          score,
          confidence: Math.min(0.9, games / (games + 15)),
          tier: games >= 40 ? "core" : games >= 15 ? "strong" : games >= 5 ? "comfortable" : "moderate",
          games,
          recentGames: Math.round(games / 4),
          patchGames: Math.round(games / 6),
          roleGames: games,
          rankedGames: games,
          normalGames: 0,
          roleShare: 1,
          mastery: null,
        } as unknown as ProficiencyEstimate);
      });
    }
  }
  const lookup = ((playerId: string, championId: string, role: Role) => table.get(`${playerId}|${championId}|${role}`) ?? null) as ProficiencyLookup;
  return lookup;
}

/** Large pools: every champion the curated model lists for the role. */
function bigLineup(champions: Map<string, ChampionInfo>): PlayerProfile[] {
  const all = [...champions.keys()].sort();
  const roleChampions = (role: Role) => all.filter((id) => (champions.get(id)?.profile.rolePrior[role] ?? 0) >= 0.2);
  return LINEUP.map((p) => {
    const extra = ROLES.find((r) => r !== p.primaryRole && r !== p.secondaryRole)!;
    return { ...p, primaryPool: roleChampions(p.primaryRole), secondaryPool: p.secondaryRole ? roleChampions(p.secondaryRole).slice(0, 25) : [], additionalRoles: [{ role: extra, pool: roleChampions(extra).slice(0, 15) }] };
  });
}

export function buildScenarios(champions: Map<string, ChampionInfo>, stats: StatsProvider): Scenario[] {
  const lineup = LINEUP;
  const proficiency = syntheticProficiency(lineup);
  const inPools = new Set(lineup.flatMap((p) => legalRolesFor(p).flatMap((r) => poolFor(p, r))));
  // Meta champions outside our pools (the enemy's likely picks) by role, most played first.
  const meta = (role: Role, n: number, skip: Set<string> = new Set()) => stats.topChampionsInRole(role, 80).filter((c) => !inPools.has(c) && !skip.has(c)).slice(0, n);
  const bansOf = (ids: Array<string | null>) => ids.map((championId) => ({ championId }));
  const metaBans = [meta("JUNGLE", 1)[0]!, meta("MID", 1)[0]!, meta("ADC", 1)[0]!, meta("TOP", 1)[0]!, meta("SUPPORT", 1)[0]!, meta("JUNGLE", 2)[1]!];
  const tour = (side: "blue" | "red") => ({ side, formatId: "tournament", assignments: { ...DEFAULT_ASSIGNMENT } });
  const base = { players: lineup, champions, stats, proficiency } satisfies Omit<EngineInput, "draft">;
  const out: Scenario[] = [];
  const add = (name: string, input: EngineInput) => out.push({ name, input });

  // 1. Blind first pick (B1) after a standard first ban phase.
  add("blind-B1", { ...base, draft: play(tour("blue"), bansOf(metaBans)) });
  // 2. First ban of the draft.
  add("ban-B1", { ...base, draft: play(tour("blue"), []) });
  // 3. Red R1/R2 two-pick window after the enemy's B1.
  const e1 = meta("JUNGLE", 1, new Set(metaBans))[0]!;
  add("pair-R1R2", { ...base, draft: play(tour("red"), [...bansOf(metaBans), { championId: e1 }]) });
  // A fresh allocator per scenario: the next meta champion of a role not used yet in that draft.
  const allocator = (taken: Iterable<string> = []) => {
    const used = new Set<string>(taken);
    return (role: Role) => {
      const c = stats.topChampionsInRole(role, 120).find((x) => !inPools.has(x) && !used.has(x))!;
      used.add(c);
      return c;
    };
  };
  // 4. Counterpick situation: blue B4/B5 after phase-2 bans with three enemy champions revealed.
  {
    const next = allocator(metaBans);
    const ours = (championId: string, role: Role, playerId: string): Action => ({ championId, role, playerId });
    const actions: Action[] = [
      ...bansOf(metaBans),
      ours("Orianna", "MID", "player-b"),
      { championId: next("TOP") },
      { championId: next("ADC") },
      ours("Viego", "JUNGLE", "player-c"),
      ours("Nautilus", "SUPPORT", "player-e"),
      { championId: next("JUNGLE") },
      ...bansOf([next("TOP"), next("ADC"), next("MID"), next("SUPPORT")]),
      { championId: next("MID") },
    ];
    add("counter-B4B5", { ...base, draft: play(tour("blue"), actions) });
  }
  // 5. Last pick (red R5) with all five enemy champions revealed.
  {
    const next = allocator();
    const ours = (championId: string, role: Role, playerId: string): Action => ({ championId, role, playerId });
    const actions: Action[] = [
      ...bansOf([next("TOP"), next("JUNGLE"), next("MID"), next("ADC"), next("SUPPORT"), next("TOP")]),
      { championId: next("JUNGLE") },
      ours("Orianna", "MID", "player-b"),
      ours("Viego", "JUNGLE", "player-c"),
      { championId: next("MID") },
      { championId: next("ADC") },
      ours("Jinx", "ADC", "player-d"),
      ...bansOf([next("JUNGLE"), next("MID"), next("ADC"), next("SUPPORT")]),
      ours("Nautilus", "SUPPORT", "player-e"),
      { championId: next("SUPPORT") },
      { championId: next("TOP") },
    ];
    add("last-pick-R5", { ...base, draft: play(tour("red"), actions) });
  }
  // 6. Heavy bans on our pools: the mid player loses three of four, the top player two of three.
  add("pool-partially-banned", { ...base, draft: play(tour("blue"), bansOf(["Orianna", "Riven", "Syndra", "Gwen", "Azir", metaBans[0]!])) });
  // 7. Support pool exhausted: every support champion banned (role swap / emergency territory).
  const supportPool = poolFor(lineup.find((p) => p.id === "player-e")!, "SUPPORT");
  add("support-pool-exhausted", { ...base, draft: { ...play(tour("blue"), bansOf(supportPool.slice(0, 6))), unavailableChampionIds: [] } });
  // 8. Fearless BO3 game 2: ten champions from game 1 locked, four of them ours.
  const g1 = ["Orianna", "Viego", "Jinx", "Nautilus", ...meta("TOP", 2), ...meta("MID", 2), ...meta("SUPPORT", 2)];
  add("fearless-bo3-g2", { ...base, draft: { ...play(tour("blue"), bansOf(metaBans)), unavailableChampionIds: g1 } });
  // 9. Fearless BO5 game 4: thirty champions locked.
  const locked30 = [...g1, "Syndra", "LeeSin", "Kaisa", "Rakan", "Riven", ...meta("TOP", 6).slice(2), ...meta("JUNGLE", 4), ...meta("ADC", 4), ...meta("MID", 4).slice(2)].slice(0, 30);
  add("fearless-bo5-g4", { ...base, draft: { ...play(tour("blue"), bansOf(metaBans)), unavailableChampionIds: locked30 } });
  // 10. Large pools, blind first pick.
  const big = bigLineup(champions);
  add("large-pools-B1", { ...base, players: big, proficiency: syntheticProficiency(big), draft: play(tour("blue"), bansOf(metaBans)) });
  // 11. Ranked Flex: simultaneous bans, B1.
  add("ranked-flex-B1", { ...base, draft: play({ side: "blue", formatId: "ranked-flex", assignments: { ...DEFAULT_ASSIGNMENT } }, bansOf([...metaBans, ...meta("MID", 4).slice(1, 4), meta("TOP", 2)[1]!])) });
  // 12. Known enemy players (scouting): their mid and ADC mostly play two champions each.
  const tendencies: EnemyTendencies = {
    MID: { role: "MID", label: "enemy-mid", confidence: 0.8, confidenceLabel: "high", factors: [], picks: meta("MID", 2, new Set(metaBans)).map((championId, i) => ({ championId, probability: i === 0 ? 0.6 : 0.3 })) as never, gamesAnalysed: 60, rank: null },
    ADC: { role: "ADC", label: "enemy-adc", confidence: 0.6, confidenceLabel: "medium", factors: [], picks: meta("ADC", 2, new Set(metaBans)).map((championId, i) => ({ championId, probability: i === 0 ? 0.5 : 0.3 })) as never, gamesAnalysed: 40, rank: null },
  };
  add("scouted-enemies-B1", { ...base, tendencies, draft: play(tour("blue"), bansOf(metaBans)) });
  // 13. Small pools: two champions per player, no secondary role.
  const small = lineup.map((p) => ({ ...p, primaryPool: p.primaryPool.slice(0, 2), secondaryRole: null, secondaryPool: [] }));
  add("small-pools-B1", { ...base, players: small, proficiency: syntheticProficiency(small), draft: play(tour("blue"), bansOf(metaBans)) });
  // 14. Role-swapped team: the top player plays mid and the mid player plays top.
  add("role-swapped-B1", { ...base, draft: play({ ...tour("blue"), assignments: { ...DEFAULT_ASSIGNMENT, TOP: "player-b", MID: "player-a" } }, bansOf(metaBans)) });
  // 15. No player data at all (proficiency off).
  add("no-player-data-B1", { ...base, proficiency: null, draft: play(tour("blue"), bansOf(metaBans)) });
  return out;
}

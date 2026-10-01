import { compositionIdentity, teamProfile, type Identity } from "../composition";
import { ROLES, ROLE_LABELS, type Role } from "../roles";
import type { Assignment } from "../roster/assignments";
import { eligibleChampions, legalRolesFor, poolFor } from "../roster/eligibility";
import type { PlayerProfile } from "../roster/types";
import { estimateEnemyRoles } from "./enemy";
import { bestCompletion, type SearchContext } from "./search";
import type { TeamMember } from "./types";
import { formatPercent } from "./util";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface BlindBanCandidate {
  championId: string;
  score: number;
  likelyRole: Role;
  reasons: string[];
  /** Our (player, role) pools this champion is awkward for. */
  threatens: Array<{ playerId: string; role: Role; hurtChampions: string[] }>;
  /** Champions in our pools that handle it comfortably. */
  answers: string[];
  pickRate: number;
  banRate: number;
  proPresence: number;
  /** True when we also want it ourselves (ban only if we would not pick it). */
  contestedByUs: boolean;
}

export interface OpeningRoute {
  members: TeamMember[];
  identity: Identity | null;
  score: number;
  notes: string[];
}

export interface BlindBanResult {
  bans: BlindBanCandidate[];
  routes: OpeningRoute[];
  /** Pool depth summary per role for the pinch warning. */
  poolDepth: Array<{ role: Role; playerId: string; options: number; threatenedByBans: number }>;
}

/**
 * Team-specific blind bans for modes with no opponent information (Ranked Flex).
 *
 * Value of banning champion B =
 *   P(an enemy would pick B)                         (meta priority, pro presence, flex breadth)
 *   × how much it hurts THESE players                (lane damage across whole pools, carry threat,
 *                                                     structural invalidation of our likely teams)
 *   − how well our pools already answer it
 *   − how much we wanted it ourselves.
 * Nothing here is "top five win rates": a champion nobody on our side struggles with scores low
 * even when it is globally strong.
 */
export function recommendBlindBans(players: PlayerProfile[], assignment: Assignment, ctx: SearchContext, options: { count?: number; routes?: number } = {}): BlindBanResult {
  const count = options.count ?? 5;
  const locked: TeamMember[] = [];
  const routes = openingRoutes(assignment, ctx, options.routes ?? 3);
  const projected = routes[0]?.members ?? bestCompletion(assignment, locked, ctx).team;
  const ourStructures = routes.map((r) => teamProfile(r.members.map((m) => ctx.champions.get(m.championId)?.profile.traits).filter((t): t is NonNullable<typeof t> => !!t)));
  const carries = projected
    .map((m) => ({ m, t: ctx.champions.get(m.championId)?.profile.traits }))
    .filter((x) => x.t && (x.t.sustainedDps >= 3 || x.t.scaling >= 3))
    .map((x) => x.m);

  // Our pools per (player, role) under the current assignment, plus secondary-role escapes.
  const pools: Array<{ playerId: string; role: Role; champions: string[]; isAssigned: boolean }> = [];
  for (const p of players) {
    for (const role of legalRolesFor(p)) {
      const champs = eligibleChampions(p, role, { unavailableChampionIds: ctx.unavailable });
      if (champs.length) pools.push({ playerId: p.id, role, champions: champs, isAssigned: assignment[role] === p.id });
    }
  }
  const ourPoolSet = new Set(pools.flatMap((p) => p.champions));

  const candidates: BlindBanCandidate[] = [];
  for (const [championId, info] of ctx.champions) {
    if (ctx.unavailable.has(championId)) continue;
    const presence = ctx.stats.presence(championId);
    const roleEstimate = estimateEnemyRoles([championId], ctx.champions, ctx.stats)[0];
    if (!roleEstimate) continue;
    const likelyRole = roleEstimate.mostLikely;
    const roleWeights = (Object.entries(roleEstimate.probabilities) as Array<[Role, number]>).filter(([, p]) => p >= 0.15);
    const flexBreadth = roleWeights.length;
    const strength = ctx.stats.strength(championId, likelyRole);

    const perPick = clamp(presence.pickRate * ctx.config.timing.pickRateMultiplier + presence.proPresence * 0.25, 0, 0.5);
    const priority = 1 - Math.pow(1 - perPick, 5);
    if (priority < 0.05 && presence.banRate < 0.05) continue;

    const reasons: string[] = [];
    let threat = Math.max(0, strength.estimate - 0.5) * 2;
    const threatens: BlindBanCandidate["threatens"] = [];
    let poolsHurt = 0;

    // Lane damage into each of our pools in the roles this champion plausibly plays.
    for (const [role, prob] of roleWeights) {
      for (const pool of pools.filter((p) => p.role === role)) {
        const hurt: string[] = [];
        let total = 0;
        for (const c of pool.champions) {
          const ours = ctx.stats.strength(c, role).estimate;
          const theirs = ctx.stats.strength(championId, role).estimate;
          const expected = clamp(0.5 + (ours - 0.5) - (theirs - 0.5), 0.3, 0.7);
          const mu = ctx.stats.matchup(c, role, championId, role, expected);
          const delta = mu.estimate - 0.5;
          total += delta;
          if (delta <= -0.03) hurt.push(c);
        }
        const avg = pool.champions.length ? total / pool.champions.length : 0;
        if (hurt.length >= Math.max(2, Math.ceil(pool.champions.length / 2))) {
          threat += prob * (0.03 + Math.max(0, -avg) * 1.5) * (pool.isAssigned ? 1 : 0.5);
          poolsHurt += 1;
          threatens.push({ playerId: pool.playerId, role, hurtChampions: hurt });
          const player = players.find((p) => p.id === pool.playerId);
          reasons.push(`Awkward for ${hurt.length} of ${player?.displayName ?? "our"}'s ${pool.champions.length} ${ROLE_LABELS[role]} champions`);
        }
      }
    }

    // Threat to our likely carries (cross-role evidence).
    for (const carry of carries) {
      let worst = 0;
      for (const [role, prob] of roleWeights) {
        if (role === carry.role) continue;
        const ours = ctx.stats.strength(carry.championId, carry.role).estimate;
        const theirs = ctx.stats.strength(championId, role).estimate;
        const expected = clamp(0.5 + (ours - 0.5) - (theirs - 0.5), 0.3, 0.7);
        const mu = ctx.stats.matchup(carry.championId, carry.role, championId, role, expected);
        worst = Math.min(worst, (mu.estimate - expected) * prob);
      }
      if (worst < -0.015) {
        threat += -worst * 1.2;
        reasons.push(`Problematic for our likely carry ${ctx.champions.get(carry.championId)?.name}`);
      }
    }

    // Structural invalidation: does the champion's kit break what our likely teams rely on?
    const traits = info.profile.traits;
    let structural = 0;
    for (const s of ourStructures) {
      const id = compositionIdentity(s).primary;
      if ((id === "Teamfight engage" || id === "Dive") && traits.counterEngage >= 2) structural += 0.012;
      if ((id === "Poke / Siege" || id === "Scaling") && traits.engage >= 3) structural += 0.012;
      if (id === "Front-to-back" && traits.dive >= 3) structural += 0.01;
      if (id === "Split pressure" && traits.sideLane >= 3) structural += 0.008;
    }
    if (structural > 0) {
      threat += structural / Math.max(1, ourStructures.length) * 2;
      reasons.push("Breaks the structure of our likely compositions");
    }

    // Flex breadth makes it harder to answer by role.
    if (flexBreadth >= 2) {
      threat += 0.006 * (flexBreadth - 1);
      reasons.push(`Flexible across ${flexBreadth} roles (${roleWeights.map(([r]) => ROLE_LABELS[r]).join(", ")})`);
    }

    // Answerability: if the pools facing it already have comfortable answers, the whole threat
    // shrinks (a globally strong champion we handle well is not a priority ban for us).
    const answers: string[] = [];
    let relevantPool = 0;
    for (const [role] of roleWeights) {
      for (const pool of pools.filter((p) => p.role === role && p.isAssigned)) {
        relevantPool += pool.champions.length;
        for (const c of pool.champions) {
          const ours = ctx.stats.strength(c, role).estimate;
          const theirs = ctx.stats.strength(championId, role).estimate;
          const expected = clamp(0.5 + (ours - 0.5) - (theirs - 0.5), 0.3, 0.7);
          const mu = ctx.stats.matchup(c, role, championId, role, expected);
          if (mu.estimate - 0.5 >= 0.03 && mu.confidence >= 0.2 && !answers.includes(c)) answers.push(c);
        }
      }
    }
    const answerFraction = relevantPool > 0 ? Math.min(1, answers.length / relevantPool) : 0;
    if (answers.length >= 2) reasons.push(`We already answer it with ${answers.slice(0, 3).map((c) => ctx.champions.get(c)?.name ?? c).join(", ")}`);
    threat *= 1 - 0.65 * answerFraction;

    const contestedByUs = ourPoolSet.has(championId);
    const ourDesire = contestedByUs ? 0.015 + Math.max(0, strength.estimate - 0.5) : 0;
    const score = priority * (0.03 + threat) - ourDesire * 0.6;

    const bits: string[] = [];
    if (presence.pickRate > 0) bits.push(`${formatPercent(presence.pickRate, 0)} pick`);
    if (presence.banRate > 0) bits.push(`${formatPercent(presence.banRate, 0)} ban`);
    if (presence.proPresence > 0.2) bits.push(`${formatPercent(presence.proPresence, 0)} pro presence`);
    if (bits.length) reasons.unshift(`High current priority (${bits.join(", ")})`);
    if (contestedByUs) reasons.push("Also in our pools: only ban if we would not pick it");
    if (poolsHurt === 0 && reasons.length <= 1) reasons.push("Generic meta threat; nobody on our side is specifically pinched");

    candidates.push({ championId, score, likelyRole, reasons: reasons.slice(0, 5), threatens, answers, pickRate: presence.pickRate, banRate: presence.banRate, proPresence: presence.proPresence, contestedByUs });
  }
  candidates.sort((a, b) => b.score - a.score);

  const bans = candidates.slice(0, count);
  const banSet = new Set(candidates.slice(0, 15).map((c) => c.championId));
  const poolDepth = ROLES.map((role) => {
    const playerId = assignment[role];
    const player = players.find((p) => p.id === playerId);
    const pool = player ? poolFor(player, role).filter((c) => !ctx.unavailable.has(c)) : [];
    const threatenedByBans = pool.filter((c) => banSet.has(c) || ctx.stats.presence(c).banRate >= 0.15).length;
    return { role, playerId, options: pool.length, threatenedByBans };
  });
  return { bans, routes, poolDepth };
}

/** Three distinct strong complete teams reachable from an empty board, for "opening routes". */
export function openingRoutes(assignment: Assignment, ctx: SearchContext, count = 3): OpeningRoute[] {
  const routes: OpeningRoute[] = [];
  const excluded = new Set<string>();
  for (let i = 0; i < count; i++) {
    const c = bestCompletion(assignment, [], ctx, excluded);
    if (c.team.length < 5) break;
    const identity = c.evaluation.identity;
    const notes: string[] = [];
    if (identity) notes.push(`${identity} structure`);
    for (const n of c.evaluation.needs.filter((x) => x.severity >= 0.5)) notes.push(n.message);
    for (const s of c.evaluation.synergyPairs.filter((p) => p.delta > 0.01).slice(0, 2)) notes.push(`${ctx.champions.get(s.a)?.name} + ${ctx.champions.get(s.b)?.name} pair well`);
    routes.push({ members: c.team, identity, score: c.evaluation.total, notes });
    // Diversify: drop the most "central" champion of this route (highest individual strength).
    const central = [...c.team].sort((a, b) => ctx.stats.strength(b.championId, b.role).estimate - ctx.stats.strength(a.championId, a.role).estimate)[0];
    if (central) excluded.add(central.championId);
  }
  return routes;
}

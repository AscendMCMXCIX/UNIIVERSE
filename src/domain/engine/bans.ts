import { compositionNeeds } from "../composition";
import type { DerivedDraft } from "../draft";
import { ROLES, ROLE_LABELS, type Role } from "../roles";
import type { Assignment } from "../roster/assignments";
import { eligibleChampions } from "../roster/eligibility";
import type { PlayerProfile } from "../roster/types";
import { enemyRoleOpenProbability } from "./timing";
import { estimateEnemyRoles } from "./enemy";
import { bestCompletion, type SearchContext } from "./search";
import { lockedMembers } from "./picks";
import type { BanRecommendation, TeamMember } from "./types";
import { adjustForKnownPlayer, describeTendency } from "./tendencies";
import { formatPercent } from "./util";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Ban recommendations.
 *
 * A ban is valued by how likely the enemy is to take the champion × how much it would hurt us
 * (raw strength, matchups into our likely picks, and whether it plugs a hole in their draft),
 * minus how much we wanted it ourselves. Phase 2 bans naturally lean on the revealed enemy
 * composition and on counters to our locked champions.
 */
export function recommendBans(players: PlayerProfile[], assignment: Assignment, derived: DerivedDraft, ctx: SearchContext, limit = 5): BanRecommendation[] {
  const locked = lockedMembers(derived);
  const projected = bestCompletion(assignment, locked, ctx).team;
  const projectedByRole = new Map<Role, TeamMember>();
  for (const m of projected) projectedByRole.set(m.role, m);

  const enemyNeeds = ctx.enemy.length >= 2 ? compositionNeeds(ctx.enemyProfile) : [];
  const ourOpenPools = new Map<string, Array<{ playerId: string; role: Role }>>();
  for (const role of ROLES) {
    if (locked.some((m) => m.role === role)) continue;
    const player = ctx.players.get(assignment[role]);
    if (!player) continue;
    for (const c of eligibleChampions(player, role, { unavailableChampionIds: ctx.unavailable })) {
      ourOpenPools.set(c, [...(ourOpenPools.get(c) ?? []), { playerId: player.id, role }]);
    }
  }

  const results: BanRecommendation[] = [];
  for (const [championId, info] of ctx.champions) {
    if (ctx.unavailable.has(championId)) continue;
    const presence = ctx.stats.presence(championId);
    const roleEstimate = estimateEnemyRoles([championId], ctx.champions, ctx.stats)[0];
    const likelyRole = roleEstimate?.mostLikely ?? null;
    if (!likelyRole) continue;
    const roleOpen = enemyRoleOpenProbability(ctx, likelyRole);
    const strength = ctx.stats.strength(championId, likelyRole);

    // Probability the enemy picks it at some point in their remaining picks: global priority,
    // replaced in proportion to scouting confidence by what the KNOWN enemy player actually plays.
    const perPick = clamp(presence.pickRate * ctx.config.timing.pickRateMultiplier + presence.proPresence * 0.25, 0, 0.5);
    const generic = 1 - Math.pow(1 - perPick, Math.max(1, derived.enemyRemainingPicks));
    const adjusted = adjustForKnownPlayer(ctx.tendencies, championId, likelyRole, roleEstimate?.probabilities, generic, presence.pickRate);
    const known = adjusted.known;
    const openForRole = known ? enemyRoleOpenProbability(ctx, known.role) : roleOpen;
    const pEnemyWants = adjusted.probability * Math.max(0.15, openForRole);
    if (pEnemyWants < 0.03) continue;

    // Damage: general strength, lane damage into our projected pick in that role, cross-role effects.
    let threat = Math.max(0, strength.estimate - 0.5);
    const protects: Array<{ playerId: string; role: Role }> = [];
    const why: string[] = [];
    const ourInRole = projectedByRole.get(likelyRole);
    if (ourInRole) {
      const ours = ctx.stats.strength(ourInRole.championId, likelyRole).estimate;
      const expected = clamp(0.5 + (ours - 0.5) - (strength.estimate - 0.5), 0.3, 0.7);
      const mu = ctx.stats.matchup(ourInRole.championId, likelyRole, championId, likelyRole, expected);
      const laneHurt = -(mu.estimate - 0.5);
      if (laneHurt > 0.015) {
        threat += laneHurt * 1.2;
        protects.push({ playerId: ourInRole.playerId, role: likelyRole });
        why.push(`Strong into our likely ${ROLE_LABELS[likelyRole]} (${info.name} beats ${ctx.champions.get(ourInRole.championId)?.name ?? ourInRole.championId})`);
      }
    }
    // Counter-risk against our whole pool in that role (deeper protection, not only the projected pick).
    const player = ctx.players.get(assignment[likelyRole]);
    if (player && !locked.some((m) => m.role === likelyRole)) {
      const pool = eligibleChampions(player, likelyRole, { unavailableChampionIds: ctx.unavailable });
      let poolHurt = 0;
      for (const c of pool) {
        const ours = ctx.stats.strength(c, likelyRole).estimate;
        const expected = clamp(0.5 + (ours - 0.5) - (strength.estimate - 0.5), 0.3, 0.7);
        poolHurt += Math.max(0, -(ctx.stats.matchup(c, likelyRole, championId, likelyRole, expected).estimate - 0.5));
      }
      if (pool.length > 0 && poolHurt / pool.length > 0.015) {
        threat += (poolHurt / pool.length) * 0.8;
        if (!protects.some((p) => p.role === likelyRole)) protects.push({ playerId: player.id, role: likelyRole });
        why.push(`Awkward for most of ${player.displayName}'s ${ROLE_LABELS[likelyRole]} pool`);
      }
    }
    // Structural: would it fix a hole in their draft?
    for (const need of enemyNeeds) {
      if (info.profile.traits[need.trait] >= 2 && need.severity >= 0.4) {
        threat += need.severity * 0.025;
        why.push(`Would give them the ${need.trait === "engage" ? "engage" : need.trait === "frontline" ? "frontline" : need.key.replace(/([A-Z])/g, " $1").toLowerCase()} they lack`);
        break;
      }
    }
    // Cross-role threat to our locked champions.
    for (const m of locked) {
      if (m.role === likelyRole) continue;
      const ours = ctx.stats.strength(m.championId, m.role).estimate;
      const expected = clamp(0.5 + (ours - 0.5) - (strength.estimate - 0.5), 0.3, 0.7);
      const mu = ctx.stats.matchup(m.championId, m.role, championId, likelyRole, expected);
      const hurt = -(mu.estimate - expected);
      if (hurt > 0.02) {
        threat += hurt * 0.5;
        why.push(`Problematic for our ${ctx.champions.get(m.championId)?.name}`);
      }
    }

    // Our own interest in the champion.
    let ourDesire = 0;
    const owners = ourOpenPools.get(championId);
    if (owners) {
      const best = Math.max(...owners.map((o) => ctx.stats.strength(championId, o.role).estimate - 0.5));
      ourDesire = 0.02 + Math.max(0, best);
    }

    const score = pEnemyWants * (0.03 + threat) - ourDesire * 0.8;
    if (presence.games > 0 || presence.proGames > 0) {
      const bits: string[] = [];
      if (presence.pickRate > 0) bits.push(`${formatPercent(presence.pickRate, 0)} pick`);
      if (presence.banRate > 0) bits.push(`${formatPercent(presence.banRate, 0)} ban`);
      if (presence.proPresence > 0.2) bits.push(`${formatPercent(presence.proPresence, 0)} pro presence`);
      if (bits.length) why.unshift(`High priority this patch (${bits.join(", ")})`);
    }
    if (strength.confidence >= 0.5 && strength.estimate >= 0.52) why.push(`Winning ${formatPercent(strength.estimate)} in ${ROLE_LABELS[likelyRole]}`);
    if (known && known.pick.likelihood !== "low") why.unshift(describeTendency(known.tendency, known.pick, info.name));
    if (owners && ourDesire > 0.02) why.push("Note: also in our pool; only ban if we would not pick it");

    results.push({ kind: "ban", championId, score, why: why.slice(0, 5), protects, likelyRole });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

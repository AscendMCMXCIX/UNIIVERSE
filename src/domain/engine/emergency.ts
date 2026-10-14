import type { DerivedDraft } from "../draft";
import { ROLE_LABELS, type Role } from "../roles";
import type { Assignment } from "../roster/assignments";
import { eligibleChampions } from "../roster/eligibility";
import type { PlayerProfile } from "../roster/types";
import { TIER_LABELS, type ProficiencyTier } from "../proficiency";
import { TRAIT_LABELS } from "../champion-model/traits";
import { executionProfile } from "../champion-model/derived";
import { bestCompletion, type SearchContext } from "./search";
import type { TeamMember } from "./types";

/*
  Emergency champion suggestions.

  Configured pools are the normal eligibility boundary: the engine never recommends a champion
  outside them. The one deliberate exception is a player with NO legal pool champion left in the
  role they are about to play (all banned or taken). Rather than an empty list, UNIIVERSE then
  proposes about three champions outside the pool, chosen with the same team evaluation as normal
  picks (our composition, the enemy's, lane matchups, global and professional evidence) plus what
  the player's own Riot history says about them. They are labelled as outside the pool, are never
  added to a profile, and the controller decides whether to lock one.
*/

export interface EmergencySuggestion {
  championId: string;
  role: Role;
  playerId: string;
  /** Projected team score with this champion (the same scale as normal candidates). */
  score: number;
  /** What the player's linked accounts say about them on this champion; null when nothing. */
  familiarity: { tier: ProficiencyTier; label: string; games: number; masteryPoints: number | null } | null;
  /** One short sentence. */
  reason: string;
}

export interface EmergencyAlert {
  role: Role;
  playerId: string;
  playerName: string;
  /** "Top has no champion left in Ascend's pool" */
  message: string;
  suggestions: EmergencySuggestion[];
}

/**
 * A champion counts as playable in a role when the curated role list says so, or when a real
 * ranked sample shows it there often (an odd handful of games never makes Annie a jungler).
 */
const ROLE_PRIOR_MIN = 0.15;
const MEASURED_SHARE_MIN = 0.25;
const MEASURED_GAMES_MIN = 300;

export function emergencyPicks(players: PlayerProfile[], assignment: Assignment, locked: TeamMember[], derived: DerivedDraft, ctx: SearchContext, options: { limit?: number; shortlist?: number } = {}): EmergencyAlert[] {
  const limit = options.limit ?? 3;
  const shortlist = options.shortlist ?? 20;
  const lockedRoles = new Set(locked.map((m) => m.role));
  const taken = new Set<string>([...ctx.unavailable, ...locked.map((m) => m.championId)]);
  const alerts: EmergencyAlert[] = [];
  for (const role of derived.openRoles) {
    if (lockedRoles.has(role)) continue;
    const player = players.find((p) => p.id === assignment[role]);
    if (!player) continue;
    if (eligibleChampions(player, role, { unavailableChampionIds: taken }).length > 0) continue;

    // Everyone else's best completion without this role decides what the team still needs.
    const base = bestCompletion(assignment, locked, ctx);
    const needs = base.evaluation.needs;
    const pre: Array<{ championId: string; pre: number }> = [];
    for (const [championId, info] of ctx.champions) {
      if (taken.has(championId)) continue;
      const measured = ctx.stats.roleShare(championId, role);
      const prior = info.profile.rolePrior[role] ?? 0;
      if (prior < ROLE_PRIOR_MIN && !(measured.games >= MEASURED_GAMES_MIN && measured.share >= MEASURED_SHARE_MIN)) continue;
      const share = Math.max(prior, measured.share);
      const strength = ctx.stats.strength(championId, role);
      const prof = ctx.proficiency?.(player.id, championId, role) ?? null;
      const familiarity = prof && prof.confidence > 0 ? (prof.score - 0.5) * prof.confidence : 0;
      const fitsNeeds = needs.reduce((s, n) => s + (info.profile.traits[n.trait] ?? 0) * n.severity, 0);
      pre.push({ championId, pre: (strength.estimate - 0.5) * strength.confidence + familiarity * 0.3 + fitsNeeds * 0.01 + share * 0.01 });
    }
    pre.sort((a, b) => b.pre - a.pre);

    const scored: EmergencySuggestion[] = [];
    for (const { championId } of pre.slice(0, shortlist)) {
      const member: TeamMember = { playerId: player.id, role, championId };
      const completion = bestCompletion(assignment, [...locked, member], ctx);
      const prof = ctx.proficiency?.(player.id, championId, role) ?? null;
      const known = !!prof && prof.confidence > 0;
      const traits = ctx.champions.get(championId)?.profile.traits;
      // Unknown to the player: a demanding champion is a bigger risk than a simple one.
      const unfamiliarRisk = !known && traits ? executionProfile(traits).total * 0.02 : 0;
      const score = completion.evaluation.total - completion.unfillable.length * 0.2 - unfamiliarRisk;
      scored.push({
        championId,
        role,
        playerId: player.id,
        score,
        familiarity: known ? { tier: prof!.tier, label: TIER_LABELS[prof!.tier], games: prof!.games, masteryPoints: prof!.mastery?.points ?? null } : null,
        reason: reasonFor(championId, role, needs, ctx, known ? prof! : null),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    alerts.push({ role, playerId: player.id, playerName: player.displayName, message: `${ROLE_LABELS[role]} has no champion left in ${player.displayName}'s configured pool`, suggestions: scored.slice(0, limit) });
  }
  return alerts;
}

function reasonFor(championId: string, role: Role, needs: ReturnType<typeof bestCompletion>["evaluation"]["needs"], ctx: SearchContext, prof: { tier: ProficiencyTier; games: number; mastery: { points: number } | null } | null): string {
  const traits = ctx.champions.get(championId)?.profile.traits;
  const parts: string[] = [];
  const covered = traits ? needs.filter((n) => (traits[n.trait] ?? 0) >= 2).slice(0, 2) : [];
  if (covered.length) parts.push(`Provides ${covered.map((n) => TRAIT_LABELS[n.trait].toLowerCase()).join(" and ")} the composition lacks`);
  else {
    const s = ctx.stats.strength(championId, role);
    const signature = traits ? (Object.entries(traits) as Array<[keyof typeof TRAIT_LABELS, number]>).filter(([, v]) => v >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => TRAIT_LABELS[k].toLowerCase()) : [];
    if (s.confidence >= 0.3 && s.estimate - 0.5 >= 0.01) parts.push(`Strong in current ranked data as ${ROLE_LABELS[role]}${signature.length ? `, brings ${signature.join(" and ")}` : ""}`);
    else parts.push(signature.length ? `Brings ${signature.join(" and ")} as ${ROLE_LABELS[role]}` : `Fits the team as ${ROLE_LABELS[role]}`);
  }
  if (prof && prof.games > 0) parts.push(`${prof.games} game${prof.games === 1 ? "" : "s"} on record for this player`);
  else if (prof && prof.mastery) parts.push("some mastery, little recent play");
  else parts.push("no recorded experience for this player");
  return `${parts.join("; ")}.`;
}

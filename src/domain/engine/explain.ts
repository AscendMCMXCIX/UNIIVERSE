import { compositionNeeds, teamProfile } from "../composition";
import { ROLE_LABELS, type Role } from "../roles";
import { poolFor } from "../roster/eligibility";
import { TRAIT_LABELS } from "../champion-model/traits";
import type { EvalContext } from "./evaluate";
import type { Candidate, TeamMember } from "./types";
import { formatDelta, formatPercent } from "./util";

const NEED_PHRASES: Record<string, string> = {
  engage: "Adds reliable engage",
  frontline: "Gives us a frontline",
  damageBalance: "Balances our damage profile",
  waveclear: "Adds waveclear",
  reliableCC: "Adds reliable crowd control",
  carryProtection: "Protects our carry",
  sustainedDamage: "Adds sustained damage",
  disengage: "Adds disengage",
};

function name(ctx: EvalContext, championId: string): string {
  return ctx.champions.get(championId)?.name ?? championId;
}

function playerName(ctx: EvalContext, playerId: string): string {
  return ctx.players.get(playerId)?.displayName ?? "player";
}

/** Plain-language reasons for a pick candidate, most important first. */
export function explainCandidate(candidate: Candidate, locked: TeamMember[], ctx: EvalContext): string[] {
  const why: string[] = [];
  const { championId, role, playerId, evaluation } = candidate;
  const profile = ctx.champions.get(championId)?.profile;

  // Structure: which holes in the locked team does this champion fill?
  if (profile && locked.length > 0) {
    const before = compositionNeeds(teamProfile(locked.map((m) => ctx.champions.get(m.championId)?.profile.traits).filter((t): t is NonNullable<typeof t> => !!t)));
    for (const need of before) {
      if (profile.traits[need.trait] >= 2 && need.severity >= 0.3) {
        why.push(NEED_PHRASES[need.key] ?? `Adds ${TRAIT_LABELS[need.trait].toLowerCase()}`);
      }
    }
  }

  // Lane matchup for this role.
  const lane = evaluation.lanes.find((l) => l.role === role && l.championId === championId);
  if (lane && lane.likelyOpponent) {
    const opp = name(ctx, lane.likelyOpponent);
    switch (lane.severity) {
      case "favourable":
        why.push(`Favourable into ${opp} (${formatDelta(lane.expectedDelta)})`);
        break;
      case "even":
        why.push(`Playable lane into ${opp}`);
        break;
      case "slightly-unfavourable":
        why.push(`Slightly behind into ${opp}, accepted for team fit`);
        break;
      case "significantly-unfavourable":
        why.push(`Warning: hard lane into ${opp}`);
        break;
      case "near-unplayable":
        why.push(`Warning: near-unplayable lane into ${opp}`);
        break;
    }
  }

  // Evidence-backed synergy with locked allies.
  for (const pair of evaluation.synergyPairs) {
    const other = pair.a === championId ? pair.b : pair.b === championId ? pair.a : null;
    if (!other || !locked.some((m) => m.championId === other)) continue;
    why.push(pair.delta > 0 ? `Strong pairing with ${name(ctx, other)} (${formatDelta(pair.delta)} together)` : `Awkward pairing with ${name(ctx, other)}`);
  }

  // Interaction with the enemy composition.
  for (const note of evaluation.interactionNotes.filter((n) => n.value > 0.15).slice(0, 2)) why.push(note.text);

  // Current-patch evidence.
  const s = ctx.stats.strength(championId, role);
  if (s.confidence >= 0.6 && s.estimate >= 0.515) why.push(`Strong current-patch evidence (${formatPercent(s.estimate)} over ${Math.round(s.games).toLocaleString()} games)`);
  else if (s.confidence >= 0.6 && s.estimate <= 0.485) why.push(`Below-average current-patch results (${formatPercent(s.estimate)}), carried by fit`);
  else if (s.confidence < 0.25) why.push("Low-data champion this patch: fit matters more than numbers");
  if (profile?.curation === "derived") why.push("New champion: characteristics not yet curated");

  // Player comfort.
  const player = ctx.players.get(playerId);
  if (player) {
    const pool = poolFor(player, role);
    const idx = pool.indexOf(championId);
    if (idx === 0) why.push(`${player.displayName}'s first-choice ${ROLE_LABELS[role]}`);
    if (role !== player.primaryRole) why.push(`${player.displayName} would be on their secondary role`);
  }

  // Timing.
  why.push(...candidate.timing.reasons);

  return dedupe(why).slice(0, 7);
}

export function describeTradeoff(primary: Candidate, alternative: Candidate, ctx: EvalContext): string {
  const p = primary.evaluation;
  const a = alternative.evaluation;
  const parts: string[] = [];
  const synergyDiff = p.synergyPart - a.synergyPart;
  const enemyDiff = p.enemyPart - a.enemyPart;
  const strengthDiff = p.components.strength - a.components.strength;
  if (Math.abs(synergyDiff) > 0.004) parts.push(synergyDiff > 0 ? "better team synergy" : "weaker team fit");
  if (Math.abs(enemyDiff) > 0.004) parts.push(enemyDiff > 0 ? "stronger into their draft" : "weaker into their draft");
  if (Math.abs(strengthDiff) > 0.006) parts.push(strengthDiff > 0 ? "stronger champion right now" : "lower raw priority");
  if (primary.timing.adjustment - alternative.timing.adjustment > 0.006) parts.push("more urgent to secure");
  const vs = `${name(ctx, alternative.championId)} (${playerName(ctx, alternative.playerId)}, ${ROLE_LABELS[alternative.role]})`;
  return parts.length ? `Versus ${vs}: ${parts.join(", ")}.` : `Versus ${vs}: very close call.`;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i) ? false : (seen.add(i), true)));
}

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

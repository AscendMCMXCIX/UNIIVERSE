import type { DerivedDraft } from "../draft";
import { ROLE_LABELS, type Role } from "../roles";
import type { Assignment } from "../roster/assignments";
import { eligibleChampions, legalRolesFor, poolFor } from "../roster/eligibility";
import type { PlayerProfile } from "../roster/types";
import type { SearchContext } from "./search";

export interface PinchWarning {
  role: Role;
  playerId: string;
  options: number;
  /** Options likely to be banned by the enemy in the next ban phase. */
  atRisk: string[];
  remainingIfBanned: number;
  message: string;
  escape: string | null;
  severity: "info" | "warn" | "danger";
}

/**
 * Before a later ban phase: for each open role, how many comfortable options remain, how many
 * the enemy would plausibly ban next, and whether a role swap offers an escape. Used to advise
 * "secure this role now" versus "it can wait".
 */
export function poolPinch(players: PlayerProfile[], assignment: Assignment, derived: DerivedDraft, ctx: SearchContext): PinchWarning[] {
  const out: PinchWarning[] = [];
  const upcomingEnemyBans = derived.remaining.filter((s) => s.type === "ban" && s.side === derived.enemySide).length;
  if (upcomingEnemyBans === 0) return out;
  for (const role of derived.openRoles) {
    const player = players.find((p) => p.id === assignment[role]);
    if (!player) continue;
    const options = eligibleChampions(player, role, { unavailableChampionIds: ctx.unavailable });
    // Enemy ban likelihood: contested champions (ban rate, pro presence) and counters to their revealed picks.
    const ranked = options
      .map((c) => {
        const p = ctx.stats.presence(c);
        let risk = Math.min(0.6, p.banRate * 1.6 + p.proPresence * 0.25);
        for (const e of ctx.enemy) {
          const theirs = ctx.stats.strength(e.championId, e.mostLikely).estimate;
          const ours = ctx.stats.strength(c, role).estimate;
          const expected = Math.max(0.3, Math.min(0.7, 0.5 + (ours - 0.5) - (theirs - 0.5)));
          const mu = ctx.stats.matchup(c, role, e.championId, e.mostLikely, expected);
          if (mu.estimate - 0.5 >= 0.04) risk += 0.15; // we counter them → they may ban it
        }
        return { c, risk };
      })
      .sort((a, b) => b.risk - a.risk);
    const atRisk = ranked.filter((r) => r.risk >= 0.25).slice(0, upcomingEnemyBans).map((r) => r.c);
    const remaining = options.length - atRisk.length;
    const escapeRole = legalRolesFor(player).find((r) => r !== role && !derived.filledRoles.has(r));
    const escape = escapeRole ? `${player.displayName} could move to ${ROLE_LABELS[escapeRole]} (${poolFor(player, escapeRole).filter((c) => !ctx.unavailable.has(c)).length} options)` : null;
    const severity: PinchWarning["severity"] = options.length === 0 ? "danger" : remaining <= 1 ? "danger" : remaining <= 2 && atRisk.length > 0 ? "warn" : "info";
    const message =
      options.length === 0
        ? `${ROLE_LABELS[role]} has no eligible champion left`
        : atRisk.length === 0
          ? `${ROLE_LABELS[role]} is safe to leave for later (${options.length} options, none ban-prone)`
          : `If we leave ${ROLE_LABELS[role]} until later, ${atRisk.length} ban${atRisk.length === 1 ? "" : "s"} (${atRisk.map((c) => ctx.champions.get(c)?.name ?? c).join(", ")}) could leave ${player.displayName} with ${remaining} comfortable option${remaining === 1 ? "" : "s"}`;
    out.push({ role, playerId: player.id, options: options.length, atRisk, remainingIfBanned: remaining, message, escape, severity });
  }
  return out.sort((a, b) => a.remainingIfBanned - b.remainingIfBanned);
}

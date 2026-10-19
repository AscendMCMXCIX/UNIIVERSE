import type { Role } from "../roles";
import type { PlayerGroup, RosterPlayer } from "./types";
import { roleRank } from "./eligibility";

/**
 * The substitutes for one lineup role: team members on the bench (not in the lineup) who list the
 * role, best fit first (primary role, then secondary, then additional roles), main players before
 * other players, then in the team's own order. Members without a chosen role list no role, so they
 * are never offered. The same rule the lineup picker uses, limited to the bench.
 */
export function substitutesFor<T extends RosterPlayer & { group: PlayerGroup }>(role: Role, members: readonly T[], inLineup: ReadonlySet<string>): T[] {
  return members
    .map((player, order) => ({ player, order, rank: roleRank(player, role) }))
    .filter((m) => m.rank >= 0 && !inLineup.has(m.player.id))
    .sort((a, b) => a.rank - b.rank || Number(a.player.group === "other") - Number(b.player.group === "other") || a.order - b.order)
    .map((m) => m.player);
}

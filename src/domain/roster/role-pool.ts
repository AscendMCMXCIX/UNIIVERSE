import type { Role } from "../roles";
import type { PoolSlot, RosterPlayer } from "./types";

/*
  Which roles a member plays and which champions a list shows for them. The Players directory's
  role filter lists everyone who plays the chosen role, as their main role or as an off role; each
  row then shows the champions they play there, so "who plays Mid, and on what?" is answered
  without opening every profile. Nothing is loaded for it: every pool is already on the record.
*/

/** Whether the member plays `role`: as their main (primary) role, their secondary role or one of their further roles. */
export function playsRole(player: Pick<RosterPlayer, "primaryRole" | "secondaryRole" | "additionalRoles">, role: Role): boolean {
  return player.primaryRole === role || player.secondaryRole === role || (player.additionalRoles ?? []).some((r) => r.role === role);
}

/** The member's roles after the main one, in their order (secondary, then further roles), without repeats. */
export function offRoles(player: Pick<RosterPlayer, "primaryRole" | "secondaryRole" | "additionalRoles">): Role[] {
  const out: Role[] = [];
  for (const role of [player.secondaryRole, ...(player.additionalRoles ?? []).map((r) => r.role)]) if (role && role !== player.primaryRole && !out.includes(role)) out.push(role);
  return out;
}

/** The pool a list shows, the role it is for and its slot (primary, secondary or a further role). */
export interface ShownPool {
  role: Role | null;
  pool: string[];
  slot: PoolSlot;
}

/**
 * The champions to show for a member in a list narrowed to `role`: that role's own pool, in the
 * member's order. Without a role, or for a role the member does not play, their main role's pool:
 * the list's default.
 */
export function poolForRole(player: Pick<RosterPlayer, "primaryRole" | "secondaryRole" | "primaryPool" | "secondaryPool" | "additionalRoles">, role: Role | null): ShownPool {
  if (role && role !== player.primaryRole) {
    if (player.secondaryRole === role) return { role, pool: player.secondaryPool, slot: "secondary" };
    const further = (player.additionalRoles ?? []).find((r) => r.role === role);
    if (further) return { role, pool: further.pool, slot: "additional" };
  }
  return { role: player.primaryRole, pool: player.primaryPool, slot: "primary" };
}

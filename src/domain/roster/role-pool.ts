import type { Role } from "../roles";
import { canPlayRole, legalRolesFor, poolFor, poolSlotFor } from "./eligibility";
import type { PoolSlot, RosterPlayer } from "./types";

/*
  Which roles a member plays and which champions a list shows for them. The Players directory's
  role filter lists everyone who plays the chosen role, as their main role or as an off role; each
  row then shows the champions they play there, so "who plays Mid, and on what?" is answered
  without opening every profile. Nothing is loaded for it: every pool is already on the record.
  Built on the lineup's own rules (eligibility.ts), so a list and the lineup never disagree on which
  roles a member plays or which pool belongs to a role: before a main role is chosen, none.
*/

/** Whether the member plays `role`: as their main (primary) role, their secondary role or one of their further roles (canPlayRole). */
export function playsRole(player: RosterPlayer, role: Role): boolean {
  return canPlayRole(player, role);
}

/** The member's roles after the main one, in their order (secondary, then further roles), without repeats: their legal roles after the first. */
export function offRoles(player: RosterPlayer): Role[] {
  return legalRolesFor(player).slice(1);
}

/** The pool a list shows, the role it is for and its slot (primary, secondary or a further role). */
export interface ShownPool {
  role: Role | null;
  pool: string[];
  slot: PoolSlot;
}

/**
 * The champions to show for a member in a list narrowed to `role`: that role's own pool, in the
 * member's order (poolSlotFor, poolFor). Without a role, or for a role the member does not play,
 * their main role's pool: the list's default.
 */
export function poolForRole(player: RosterPlayer, role: Role | null): ShownPool {
  const slot = role ? poolSlotFor(player, role) : null;
  if (role && slot && slot !== "primary") return { role, pool: poolFor(player, role), slot };
  return { role: player.primaryRole, pool: player.primaryPool, slot: "primary" };
}

import type { Role } from "../roles";
import type { PlayerProfile, PoolSlot } from "./types";

/** The roles a player may legally be assigned: configured primary and (optional) secondary only. */
export function legalRolesFor(player: PlayerProfile): Role[] {
  const roles: Role[] = [player.primaryRole];
  if (player.secondaryRole && player.secondaryRole !== player.primaryRole) roles.push(player.secondaryRole);
  return roles;
}

export function canPlayRole(player: PlayerProfile, role: Role): boolean {
  return legalRolesFor(player).includes(role);
}

/** Which pool slot applies when the player is assigned the given role, or null if the role is illegal. */
export function poolSlotFor(player: PlayerProfile, role: Role): PoolSlot | null {
  if (role === player.primaryRole) return "primary";
  if (player.secondaryRole && role === player.secondaryRole) return "secondary";
  return null;
}

/**
 * The champions this player can play in the given role.
 * Primary role → primary pool. Secondary role → secondary pool. Any other role → nothing.
 * Player configuration always overrides generic champion role flexibility.
 */
export function poolFor(player: PlayerProfile, role: Role): string[] {
  const slot = poolSlotFor(player, role);
  if (slot === "primary") return player.primaryPool;
  if (slot === "secondary") return player.secondaryPool;
  return [];
}

export interface AvailabilityContext {
  unavailableChampionIds: ReadonlySet<string>;
}

/** Champions the player can still legally be recommended for in this role right now. */
export function eligibleChampions(player: PlayerProfile, role: Role, ctx: AvailabilityContext): string[] {
  return poolFor(player, role).filter((c) => !ctx.unavailableChampionIds.has(c));
}

export function isEligible(player: PlayerProfile, role: Role, championId: string, ctx: AvailabilityContext): boolean {
  return eligibleChampions(player, role, ctx).includes(championId);
}

/**
 * A champion is a genuine UNIIVERSE flex only when more than one (player, role) assignment in the
 * active lineup can legitimately play it. Pro-play flexibility is irrelevant here.
 */
export function flexOwners(players: PlayerProfile[], championId: string): Array<{ playerId: string; role: Role }> {
  const owners: Array<{ playerId: string; role: Role }> = [];
  for (const p of players) {
    for (const role of legalRolesFor(p)) {
      if (poolFor(p, role).includes(championId)) owners.push({ playerId: p.id, role });
    }
  }
  return owners;
}

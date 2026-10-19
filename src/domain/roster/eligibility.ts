import type { Role } from "../roles";
import type { PlayerProfile, PoolSlot, RosterPlayer } from "./types";

/**
 * The roles a player may legally be assigned, in preference order: primary, the optional
 * secondary, then any additional roles. Duplicates are ignored.
 */
export function legalRolesFor(player: RosterPlayer): Role[] {
  // No primary role yet (setup unfinished): no role is legal, whatever else is stored.
  if (!player.primaryRole) return [];
  const roles: Role[] = [player.primaryRole];
  if (player.secondaryRole && !roles.includes(player.secondaryRole)) roles.push(player.secondaryRole);
  for (const extra of player.additionalRoles ?? []) if (!roles.includes(extra.role)) roles.push(extra.role);
  return roles;
}

/** 0 = primary, 1 = secondary, 2+ = additional roles in order; -1 = not a configured role. */
export function roleRank(player: RosterPlayer, role: Role): number {
  return legalRolesFor(player).indexOf(role);
}

export type RoleFit = "primary" | "secondary" | "additional" | "other";

/** How a role relates to the player's configuration. */
export function roleFit(player: RosterPlayer, role: Role): RoleFit {
  const rank = roleRank(player, role);
  return rank === 0 ? "primary" : rank === 1 ? "secondary" : rank >= 2 ? "additional" : "other";
}

/**
 * Main Role or Off Role: whether the position a player is assigned is their configured Primary
 * Role. The one rule behind the role-status badge on the Team page.
 */
export type AssignmentStatus = "main" | "off";

export function assignmentStatus(player: Pick<RosterPlayer, "primaryRole">, role: Role): AssignmentStatus {
  return player.primaryRole === role ? "main" : "off";
}

/**
 * How far a role is from the player's preference, as a multiple of one role-swap cost: primary 0,
 * secondary 1, third role 2, fourth 2.5, fifth 3. Additional roles cost clearly more than the
 * secondary so they only win with a real reason (pool, proficiency or composition).
 */
export function roleDistance(player: RosterPlayer, role: Role): number {
  const rank = roleRank(player, role);
  if (rank <= 0) return rank === 0 ? 0 : 4;
  if (rank === 1) return 1;
  return 2 + (rank - 2) * 0.5;
}

export function canPlayRole(player: RosterPlayer, role: Role): boolean {
  return legalRolesFor(player).includes(role);
}

/** Which pool slot applies when the player is assigned the given role, or null if the role is illegal. */
export function poolSlotFor(player: RosterPlayer, role: Role): PoolSlot | null {
  if (!player.primaryRole) return null;
  if (role === player.primaryRole) return "primary";
  if (player.secondaryRole && role === player.secondaryRole) return "secondary";
  if ((player.additionalRoles ?? []).some((r) => r.role === role)) return "additional";
  return null;
}

/**
 * The champions this player can play in the given role: that role's own pool (primary,
 * secondary or additional), in the player's order. Any other role → nothing. Player
 * configuration always overrides generic champion role flexibility.
 */
export function poolFor(player: RosterPlayer, role: Role): string[] {
  const slot = poolSlotFor(player, role);
  if (slot === "primary") return player.primaryPool;
  if (slot === "secondary") return player.secondaryPool;
  if (slot === "additional") return player.additionalRoles?.find((r) => r.role === role)?.pool ?? [];
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

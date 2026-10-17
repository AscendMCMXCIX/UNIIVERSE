import type { Role } from "../roles";

export type PlayerGroup = "main" | "other";
export type PoolSlot = "primary" | "secondary" | "additional";

/** A further role after the secondary one, with its own champion pool. */
export interface RolePool {
  role: Role;
  pool: string[];
}

/**
 * The minimal player model the draft engine needs. The database holds more (notes, Riot ID,
 * timestamps) but recommendations only depend on roles and configured pools.
 */
export interface PlayerProfile {
  id: string;
  displayName: string;
  group: PlayerGroup;
  primaryRole: Role;
  /** A player may have no secondary role, in which case they can only be assigned their primary role. */
  secondaryRole: Role | null;
  /** Champion ids (Data Dragon ids) the player plays in their primary role, in preference order. */
  primaryPool: string[];
  /** Champion ids the player plays in their secondary role, in preference order. */
  secondaryPool: string[];
  /**
   * Optional further roles in preference order (third, fourth...), each with its own pool. Never
   * repeats the primary or secondary role. Absent on older snapshots, which means none.
   */
  additionalRoles?: RolePool[];
}

/**
 * Pools have no size limit (Phase 5). The only bound is a sanity cap against malformed input:
 * every champion in the game, so a player can list all of them for a role if they want to.
 */
export const MAX_POOL_SIZE = 250;

/**
 * A team member as the roster knows them: the engine's model, except that the primary role may
 * not be chosen yet (a member who has not finished setup). Such a member has no legal role and no
 * pool, so they are listed and shown but never drafted or assigned. Use `hasPrimaryRole` before
 * handing members to the draft engine.
 */
export interface RosterPlayer extends Omit<PlayerProfile, "primaryRole"> {
  primaryRole: Role | null;
}

/** A member whose primary role is chosen: a full PlayerProfile the engine can use. */
export function hasPrimaryRole<T extends RosterPlayer>(player: T): player is T & { primaryRole: Role } {
  return player.primaryRole !== null;
}

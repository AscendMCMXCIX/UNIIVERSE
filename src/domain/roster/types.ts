import type { Role } from "../roles";

export type PlayerGroup = "main" | "other";
export type PoolSlot = "primary" | "secondary";

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
}

export interface PoolLimits {
  primary: number;
  secondary: number;
}

/** Product defaults: up to six champions in the primary role, three in the secondary (off) role. Stored per team so they can change later. */
export const DEFAULT_POOL_LIMITS: PoolLimits = { primary: 6, secondary: 3 };

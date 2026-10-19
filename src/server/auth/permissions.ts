/** Stored account roles. "owner" is the Admin role; "coach" is retired (migration 0007) and treated as a player. */
export type AccessRole = "owner" | "coach" | "player";

export interface Session {
  userId: string | null;
  role: AccessRole;
  label: string;
  playerId: string | null;
  username: string | null;
  hasPassword: boolean;
  /** Signed in with an admin-issued temporary password: must choose a permanent one before anything else. */
  mustChangePassword: boolean;
  /** False until the player finished first-time setup (roles and champion pools). */
  setupComplete: boolean;
  /** Effective capabilities for a non-owner (preset or custom); undefined means Standard Player. Owners hold every capability. */
  capabilities?: readonly Capability[];
  /** Profile picture version (null/undefined = none). */
  avatarVersion?: number | null;
  /** The automatic local owner of a development machine without accounts (never set on a deployment). */
  localDev?: boolean;
  /**
   * Member of the competitive team (players.team_member). False = personal use only: their own
   * profile, statistics and Solo Queue Blocks, but nothing of the team workspace.
   * Undefined (no player profile, or a session from before Phase 10) counts as a member.
   */
  teamMember?: boolean;
}

/*
  Two kinds of account, plus configurable capabilities:

    Owner / Admin   the one administrative account (identified by its account id and the stored
                    "owner" role, never by its username). It works only in Admin Mode and holds
                    every capability, including the owner-only ones that are never delegated:
                    accounts, passwords, permissions, site settings (branding, Riot data and
                    system health).
    Player          the capabilities of their permission preset (Standard Player by default) or
                    of a custom set an admin chose for them in Admin → People & Access, plus any
                    additional groups (Team Lineup Manager…). None of these opens Admin Mode:
                    delegated work happens on the ordinary pages (Team, Matches, profiles).

  Every server action checks capabilities on the server; hidden buttons are only a convenience.
*/

/** Capabilities an admin can grant to or remove from a player (Admin → People & Access). */
export const CAPABILITIES = [
  { key: "view-team", group: "View", label: "View the Team page", description: "The current main lineup and its champions." },
  { key: "view-players", group: "View", label: "View the Players directory", description: "Everyone's roles, champion pools and linked Riot accounts." },
  { key: "view-teammate-stats", group: "View", label: "View teammates' statistics", description: "Season records, champion statistics and proficiency on other players' profiles." },
  { key: "view-matches", group: "View", label: "View team matches", description: "Riot games the team played together, and the players met repeatedly (Team → Matches)." },
  { key: "edit-own-profile", group: "Own profile", label: "Edit own roles and champion pools", description: "Their own primary role, off roles and pools." },
  { key: "manage-own-riot-accounts", group: "Own profile", label: "Manage own Riot accounts", description: "Add, remove and refresh their own linked Riot accounts." },
  { key: "manage-lineup", group: "Team management", label: "Manage the official lineup", description: "Choose who plays each role in the main lineup." },
  { key: "manage-players", group: "Team management", label: "Manage other players", description: "Edit other players' roles, champion pools and Riot accounts, and archive profiles." },
  { key: "manage-matches", group: "Team management", label: "Manage team bookmarks", description: "Remove any bookmarked game from Team → Matches, whoever added it." },
] as const;

export type Capability = (typeof CAPABILITIES)[number]["key"];

/**
 * Owner-only: never part of a preset, a custom set or a group, so no other account can reach
 * accounts, passwords, permissions, permanent deletion or the site settings of Admin Mode.
 * (Stored sets from before Phase 10 that still name the site-setting keys are ignored: see
 * sanitiseCapabilities.)
 */
export type OwnerOnlyPermission = "manage-users" | "manage-branding" | "manage-data";
const OWNER_ONLY: ReadonlySet<string> = new Set<OwnerOnlyPermission>(["manage-users", "manage-branding", "manage-data"]);

export type Permission = Capability | OwnerOnlyPermission;

export const CAPABILITY_KEYS: readonly Capability[] = CAPABILITIES.map((c) => c.key);

/** The built-in default (Standard Player): ordinary team and player features plus their own information. */
export const STANDARD_PLAYER: readonly Capability[] = ["view-team", "view-players", "view-teammate-stats", "view-matches", "edit-own-profile", "manage-own-riot-accounts"];

/**
 * Additional access groups: ready-made bundles a player can hold on top of their base access
 * level, so someone can, say, run the lineup without becoming an Administrator. Groups only add
 * capabilities (never take any away) and never include the Owner-only ones: accounts,
 * passwords and permissions stay with Owners.
 */
export const ACCESS_GROUPS = [
  { key: "lineup-manager", label: "Team Lineup Manager", description: "Assign, swap and clear players in the official five-person lineup, directly on Team Overview.", capabilities: ["manage-lineup"] },
  { key: "match-manager", label: "Match Manager", description: "Remove any bookmarked game from Team → Matches, whoever added it.", capabilities: ["manage-matches"] },
  { key: "player-manager", label: "Player Manager", description: "Edit other players' roles, champion pools and Riot accounts, on their profiles.", capabilities: ["manage-players"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; description: string; capabilities: readonly Capability[] }>;

export type AccessGroupKey = (typeof ACCESS_GROUPS)[number]["key"];

/** Keeps only known group keys (stored JSON may be stale or hand-edited), each once. */
export function sanitiseAccessGroups(value: unknown): AccessGroupKey[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(ACCESS_GROUPS.map((g) => g.key));
  return [...new Set(value.filter((v): v is AccessGroupKey => typeof v === "string" && known.has(v)))];
}

/** Base capabilities plus those of the additional groups: what the account may actually do. */
export function withAccessGroups(base: readonly Capability[], groups: readonly string[]): Capability[] {
  const extra = ACCESS_GROUPS.filter((g) => groups.includes(g.key)).flatMap((g) => g.capabilities as readonly Capability[]);
  return [...new Set([...base, ...extra])];
}

/**
 * What an account can do, exactly as hasPermission decides it: the base capabilities plus the
 * additional groups, minus the team workspace for a personal-use account (the Owner has
 * everything). The Admin access dialog shows this list, so it cannot drift from the server.
 */
export function effectiveCapabilities(input: { owner: boolean; base: readonly Capability[]; groups: readonly string[]; teamMember: boolean }): Set<Capability> {
  if (input.owner) return new Set(CAPABILITY_KEYS);
  return new Set(withAccessGroups(input.base, input.groups).filter((c) => input.teamMember || !TEAM_CAPABILITIES_LIST.includes(c)));
}

/** Always available to every signed-in account, whatever its level (enforced by ownership checks, not capabilities). */
export const ALWAYS_AVAILABLE = ["Their own profile: Overview, All Champions, Match History", "Their private Solo Queue Blocks", "Their own Settings: username, picture, password"] as const;

/** Keeps only known capability keys (stored JSON may be stale or hand-edited). */
export function sanitiseCapabilities(value: unknown): Capability[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(CAPABILITY_KEYS);
  return [...new Set(value.filter((v): v is Capability => typeof v === "string" && known.has(v)))];
}

/**
 * The team workspace: Team Overview, Players and teammates' profiles, team matches and lineup
 * management. A personal-use account holds none of these, whatever its level or groups say.
 */
const TEAM_CAPABILITIES_LIST: readonly Capability[] = ["view-team", "view-players", "view-teammate-stats", "view-matches", "manage-lineup", "manage-players", "manage-matches"];
export const TEAM_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(TEAM_CAPABILITIES_LIST);

/** In the team workspace: the Owner, and every player whose profile is a team member. */
export function isTeamMember(session: Pick<Session, "role" | "teamMember"> | null): boolean {
  if (!session) return false;
  return session.role === "owner" || session.teamMember !== false;
}

export function isOwner(session: Pick<Session, "role"> | null): boolean {
  return session?.role === "owner";
}

/** Owner / Admin. */
export const isAdmin = isOwner;

/** The capabilities a session holds (an owner holds every capability). */
export function capabilitiesOf(session: Session | null): ReadonlySet<Capability> {
  if (!session) return new Set();
  if (session.role === "owner") return new Set(CAPABILITY_KEYS);
  return new Set(session.capabilities ?? STANDARD_PLAYER);
}

export function hasPermission(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  if (session.role === "owner") return true;
  if (OWNER_ONLY.has(permission)) return false;
  if (!isTeamMember(session) && TEAM_CAPABILITIES.has(permission as Capability)) return false;
  return capabilitiesOf(session).has(permission as Capability);
}

/**
 * May open Admin Mode: the Owner account only. No capability, preset or group opens it, so a
 * Team Lineup Manager (or anyone else) stays in the ordinary app; every admin page and action
 * also checks an owner-only permission on the server.
 */
export function canUseAdminArea(session: Session | null): boolean {
  return isOwner(session);
}

/** A user may edit a player profile (roles, pools, notes) when it is their own (with the capability) or they manage players. */
export function canEditPlayer(session: Session | null, playerId: string): boolean {
  if (!session) return false;
  if (hasPermission(session, "manage-players")) return true;
  return !!session.playerId && session.playerId === playerId && hasPermission(session, "edit-own-profile");
}

/** A user may add, remove or refresh a player's Riot accounts: their own (with the capability) or as a player manager. */
export function canManageRiotAccounts(session: Session | null, playerId: string): boolean {
  if (!session) return false;
  if (hasPermission(session, "manage-players")) return true;
  return !!session.playerId && session.playerId === playerId && hasPermission(session, "manage-own-riot-accounts");
}

export const ROLE_LABELS_USER: Record<AccessRole, string> = { owner: "Owner", coach: "Player", player: "Player" };

/** Badge text for an account. */
export function describeAccess(user: { role: AccessRole }): string {
  return ROLE_LABELS_USER[user.role];
}

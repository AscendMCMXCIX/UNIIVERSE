import type { FreshnessScope } from "@/domain/freshness";

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
   * profile and statistics, but nothing of the team workspace.
   * Undefined (no player profile, or a session from before Phase 10) counts as a member.
   */
  teamMember?: boolean;
  /**
   * Administrator (users.is_admin), read from the database on every request like everything
   * else here: revoking it takes effect on the next request. The Owner is one whatever this says.
   */
  admin?: boolean;
}

/*
  Accounts and what they may do:

    Owner           the account set up first (identified by its account id and the stored
                    "owner" role, never by its username). It holds every permission, is always an
                    administrator, and is the only account that can change the Owner account.
    Administrator   any account with users.is_admin, granted by another administrator. Usually a
                    player: their profile, Riot accounts and statistics stay theirs, and Admin Mode
                    is open to them on top. They hold every permission, like the Owner, except
                    over the Owner account itself (auth/account-admin.ts). Revoking it returns
                    them to exactly the player access they had (their level and groups are kept).
    Player          the capabilities of their permission preset (Standard Player by default) or
                    of a custom set an admin chose for them in Admin → Users & Permissions, plus
                    any additional groups (Team Lineup Manager…). None of these opens Admin Mode:
                    delegated work happens on the ordinary pages (Team, Matches, profiles).

  Every page, server action and API route checks permissions on the server; hidden buttons and
  the mode an account is shown are only a convenience, never a permission.
*/

/** Capabilities an admin can grant to or remove from a player (Admin Mode → Users & Permissions). */
export const CAPABILITIES = [
  { key: "view-team", group: "View", label: "View the Team page", description: "The current main lineup and its champions." },
  { key: "view-players", group: "View", label: "View the Players directory", description: "Everyone's roles, champion pools and linked Riot accounts." },
  { key: "view-teammate-stats", group: "View", label: "View teammates' statistics", description: "Rank, season records, match histories, champion statistics and proficiency on other players' profiles." },
  { key: "view-matches", group: "View", label: "View team matches", description: "Riot games the team played together, and the players met repeatedly (Team → Matches)." },
  { key: "edit-own-profile", group: "Own profile", label: "Edit own roles and champion pools", description: "Their own primary role, off roles and pools." },
  { key: "manage-own-riot-accounts", group: "Own profile", label: "Manage own Riot accounts", description: "Add, remove and refresh their own linked Riot accounts." },
  { key: "manage-lineup", group: "Team management", label: "Manage the official lineup", description: "Choose who plays each role in the main lineup." },
  { key: "manage-players", group: "Team management", label: "Manage other players", description: "Edit other players' roles, champion pools and Riot accounts, and archive profiles." },
  { key: "manage-matches", group: "Team management", label: "Manage team bookmarks", description: "Remove any bookmarked game from Team → Matches, whoever added it." },
] as const;

export type Capability = (typeof CAPABILITIES)[number]["key"];

/**
 * Administrators only: never part of a preset, a custom set or a group, so no player reaches
 * accounts, passwords, permissions, permanent deletion or the settings of Admin Mode through
 * their level. (Stored sets from before Phase 10 that still name the site-setting keys are
 * ignored: see sanitiseCapabilities.)
 */
export type AdminPermission = "manage-users" | "manage-branding" | "manage-data";
/** @deprecated The same permissions, from when only the Owner held them. */
export type OwnerOnlyPermission = AdminPermission;
const ADMIN_ONLY: ReadonlySet<string> = new Set<AdminPermission>(["manage-users", "manage-branding", "manage-data"]);

export type Permission = Capability | AdminPermission;

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
export const ALWAYS_AVAILABLE = ["Their own profile: Overview, All Champions, Match History, Riot Accounts", "Their own Settings: username, picture, password"] as const;

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

/** An administrator: the Owner, or an account granted administrator access (users.is_admin). */
export function isAdmin(session: Pick<Session, "role" | "admin"> | null): boolean {
  return session?.role === "owner" || session?.admin === true;
}

/** The capabilities a session holds (administrators, the Owner included, hold every capability). */
export function capabilitiesOf(session: Session | null): ReadonlySet<Capability> {
  if (!session) return new Set();
  if (isAdmin(session)) return new Set(CAPABILITY_KEYS);
  return new Set(session.capabilities ?? STANDARD_PLAYER);
}

export function hasPermission(session: Session | null, permission: Permission): boolean {
  if (!session) return false;
  if (isAdmin(session)) return true;
  if (ADMIN_ONLY.has(permission)) return false;
  if (!isTeamMember(session) && TEAM_CAPABILITIES.has(permission as Capability)) return false;
  return capabilitiesOf(session).has(permission as Capability);
}

/**
 * May open Admin Mode: administrators only (the Owner included). No capability, preset or group
 * opens it, so a Team Lineup Manager (or anyone else) stays in the ordinary app; every admin page,
 * action and API route also checks an administrator permission on the server.
 */
export function canUseAdminArea(session: Session | null): boolean {
  return isAdmin(session);
}

/**
 * May ask for the version of a page's data (/api/freshness) with the access that page needs: their
 * own profile, someone else's with the Players directory, the team's pages with any of their view
 * rights, the jobs with the data settings of Admin Mode.
 */
export function canWatchFreshness(session: Session | null, scope: FreshnessScope): boolean {
  if (!session) return false;
  if (scope.kind === "jobs") return hasPermission(session, "manage-data");
  if (scope.kind === "player") return session.playerId === scope.playerId || hasPermission(session, "view-players");
  return (["view-team", "view-players", "view-teammate-stats", "view-matches"] as const).some((p) => hasPermission(session, p));
}

/**
 * May see this player's statistics, their rank included (tier, division, LP, queue, ranked wins
 * and losses): their own always, anyone else's with "view teammates' statistics". The Team page
 * (team/roster.ts), the profile header and a teammate's Riot Accounts tab all decide by this.
 */
export function canViewPlayerStats(session: Session | null, playerId: string): boolean {
  if (!session) return false;
  return (!!session.playerId && session.playerId === playerId) || hasPermission(session, "view-teammate-stats");
}

/**
 * May open this player's profile at all: a team member's for any signed-in account (each page,
 * tab and action then checks its own capability), a personal-use profile (players.team_member
 * false) only for its own player and administrators (the Owner, users.is_admin). Anyone else is
 * told it does not exist, whatever their capabilities: a personal-use player is not part of the
 * team workspace, so no teammate, Player Manager or Team Manager reads or changes their data.
 */
export function canOpenProfile(session: Session | null, target: { id: string; teamMember: boolean }): boolean {
  if (!session) return false;
  if (target.teamMember) return true;
  return (!!session.playerId && session.playerId === target.id) || isAdmin(session);
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

/** Badge text for an account: Owner, Administrator or Player. */
export function describeAccess(user: { role: AccessRole; isAdmin?: boolean }): string {
  if (user.role !== "owner" && user.isAdmin) return "Administrator";
  return ROLE_LABELS_USER[user.role];
}

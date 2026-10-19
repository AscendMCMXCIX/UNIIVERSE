import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { cachedFor, invalidateCache } from "@/server/observability/cache";
import { lineupSlots, lineupSubstitutes, lineups, playerChampionPools, playerRolePools, players, teams, users } from "@/server/db/schema";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import type { PlayerGroup, PlayerProfile, RolePool, RosterPlayer } from "@/domain/roster";
import { MAX_POOL_SIZE, hasPrimaryRole, legalRolesFor } from "@/domain/roster";

/**
 * A team member's profile. Membership and setup are separate: a member whose account has not
 * finished first-time setup is still a member (listed, shown, openable), marked `setupPending`.
 * `primaryRole` is null until a role is chosen; such a member has no legal role or pool, so they
 * are never assigned to a lineup role (see `hasPrimaryRole`).
 */
export interface PlayerRecord extends RosterPlayer {
  /** Their account has not finished first-time setup. */
  setupPending: boolean;
  additionalRoles: RolePool[];
  featuredChampionId: string | null;
  /** Skin art of the featured champion (0 / null = default skin). */
  featuredSkinNum: number | null;
  cardAccent: string | null;
  /** Saved Player Card Studio settings, unvalidated (read through resolveCardStyle); null = never customised. */
  cardStyle: Record<string, unknown> | null;
  /** Version of the uploaded card banner; null = none. */
  cardBannerVersion: number | null;
  riotId: string | null;
  notes: string;
  archivedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamRecord {
  id: string;
  name: string;
}

/** UNIIVERSE is single-team today; the schema allows more later. Read on most pages: cached per process, invalidated on update. */
export async function getOrCreateTeam(db: Db): Promise<TeamRecord> {
  return cachedFor("team:current", 60_000, async () => {
    const [existing] = await db.select().from(teams).orderBy(asc(teams.createdAt)).limit(1);
    const row = existing ?? (await db.insert(teams).values({ name: "UNIIVERSE" }).returning())[0]!;
    return { id: row.id, name: row.name };
  }, db);
}

export async function updateTeam(db: Db, teamId: string, patch: Partial<{ name: string }>) {
  await db.update(teams).set({ ...patch, updatedAt: new Date() }).where(eq(teams.id, teamId));
  invalidateCache("team");
}

interface LoadedPools {
  primary: string[];
  secondary: string[];
  /** Additional-role pools keyed by role. */
  byRole: Map<Role, string[]>;
}

const emptyPools = (): LoadedPools => ({ primary: [], secondary: [], byRole: new Map() });

async function loadPools(db: Db, playerIds: string[]): Promise<Map<string, LoadedPools>> {
  const map = new Map<string, LoadedPools>();
  if (playerIds.length === 0) return map;
  const [rows, extra] = await Promise.all([
    db.select().from(playerChampionPools).where(inArray(playerChampionPools.playerId, playerIds)).orderBy(asc(playerChampionPools.position), asc(playerChampionPools.createdAt)),
    db.select().from(playerRolePools).where(inArray(playerRolePools.playerId, playerIds)).orderBy(asc(playerRolePools.position), asc(playerRolePools.createdAt)),
  ]);
  for (const r of rows) {
    const entry = map.get(r.playerId) ?? emptyPools();
    entry[r.slot].push(r.championId);
    map.set(r.playerId, entry);
  }
  for (const r of extra) {
    const entry = map.get(r.playerId) ?? emptyPools();
    entry.byRole.set(r.role, [...(entry.byRole.get(r.role) ?? []), r.championId]);
    map.set(r.playerId, entry);
  }
  return map;
}

/** Additional roles as stored (order kept), minus anything that repeats the primary or secondary role. */
function cleanAdditionalRoles(roles: unknown, primary: Role | null, secondary: Role | null): Role[] {
  const out: Role[] = [];
  for (const r of Array.isArray(roles) ? roles : []) {
    if (!ROLES.includes(r as Role) || r === primary || r === secondary || out.includes(r as Role)) continue;
    out.push(r as Role);
  }
  return out;
}

/** Every stored profile is a PlayerRecord, with or without a chosen primary role. */
function toRecord(row: typeof players.$inferSelect, pools: LoadedPools, setupPending = false): PlayerRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    group: row.group,
    primaryRole: row.primaryRole,
    secondaryRole: row.secondaryRole,
    setupPending,
    primaryPool: pools.primary,
    secondaryPool: pools.secondary,
    additionalRoles: cleanAdditionalRoles(row.additionalRoles, row.primaryRole, row.secondaryRole).map((role) => ({ role, pool: pools.byRole.get(role) ?? [] })),
    featuredChampionId: row.featuredChampionId,
    featuredSkinNum: row.featuredSkinNum ?? null,
    cardAccent: row.cardAccent,
    cardStyle: row.cardStyle ?? null,
    cardBannerVersion: row.cardBannerVersion ?? null,
    riotId: row.riotId,
    notes: row.notes,
    archivedAt: row.archivedAt,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Profiles whose account has not finished its first-time setup. */
export async function setupPendingPlayerIds(db: Db): Promise<Set<string>> {
  const rows = await db.select({ id: users.playerId }).from(users).where(and(isNull(users.setupCompletedAt), isNotNull(users.playerId)));
  return new Set(rows.map((r) => r.id!));
}

/**
 * The team's members: every profile on the team that is not archived and is a member of the team
 * (personal-use profiles are not members), whether or not their account has finished setup. This
 * is the one membership rule; setup only adds the `setupPending` mark. `includePersonal` adds
 * personal-use profiles (Admin), `includeArchived` archived ones, `keep` specific profiles
 * regardless (someone already in the lineup stays visible there). Statistics read their own data; a member without data simply has none.
 */
export async function listPlayers(db: Db, teamId: string, options: { includeArchived?: boolean; includePersonal?: boolean; keep?: readonly string[] } = {}): Promise<PlayerRecord[]> {
  const [rows, pending] = await Promise.all([
    db
      .select()
      .from(players)
      .where(options.includeArchived ? eq(players.teamId, teamId) : and(eq(players.teamId, teamId), isNull(players.archivedAt)))
      .orderBy(asc(players.sortOrder), asc(players.createdAt)),
    setupPendingPlayerIds(db),
  ]);
  const visible = rows.filter((r) => options.keep?.includes(r.id) || options.includePersonal || r.teamMember);
  const pools = await loadPools(
    db,
    visible.map((r) => r.id),
  );
  return visible.map((r) => toRecord(r, pools.get(r.id) ?? emptyPools(), pending.has(r.id)));
}

/** Members whose primary role is chosen: the ones the lineup can use. */
export async function listRolePlayers(db: Db, teamId: string, options: { includeArchived?: boolean; keep?: readonly string[] } = {}): Promise<Array<PlayerRecord & PlayerProfile>> {
  return (await listPlayers(db, teamId, options)).filter(hasPrimaryRole);
}

/** One profile (with or without a chosen role), or null when missing. */
export async function getPlayer(db: Db, playerId: string): Promise<PlayerRecord | null> {
  const [row] = await db.select().from(players).where(eq(players.id, playerId));
  if (!row) return null;
  const [pools, pending] = await Promise.all([loadPools(db, [row.id]), setupPendingPlayerIds(db)]);
  return toRecord(row, pools.get(row.id) ?? emptyPools(), pending.has(row.id));
}

/** The stored profile row as it is, whether or not setup has chosen its role yet. */
export async function getPlayerRow(db: Db, playerId: string): Promise<typeof players.$inferSelect | null> {
  const [row] = await db.select().from(players).where(eq(players.id, playerId));
  return row ?? null;
}

export interface PlayerInput {
  displayName: string;
  riotId?: string | null;
  primaryRole: Role;
  secondaryRole?: Role | null;
  notes?: string;
  group?: PlayerGroup;
  primaryPool?: string[];
  secondaryPool?: string[];
  /** Further roles in order, each with its own pool. Omitted = keep none (create) / unchanged is not supported here. */
  additionalRoles?: RolePool[];
}

export class PlayerValidationError extends Error {
  override name = "PlayerValidationError";
}

interface ValidPools {
  primary: string[];
  secondary: string[];
  additional: RolePool[];
}

function validatePlayerInput(input: PlayerInput): ValidPools {
  if (!input.displayName.trim()) throw new PlayerValidationError("Display name is required.");
  if (!ROLES.includes(input.primaryRole)) throw new PlayerValidationError("Primary role is invalid.");
  if (input.secondaryRole && !ROLES.includes(input.secondaryRole)) throw new PlayerValidationError("Off role is invalid.");
  if (input.secondaryRole && input.secondaryRole === input.primaryRole) throw new PlayerValidationError("An off role must differ from the primary role.");
  const primary = dedupe(input.primaryPool ?? []);
  const secondary = dedupe(input.secondaryPool ?? []);
  if (!input.secondaryRole && secondary.length > 0) throw new PlayerValidationError("Choose an off role before adding its pool.");
  const additional: RolePool[] = [];
  for (const extra of input.additionalRoles ?? []) {
    if (!ROLES.includes(extra.role)) throw new PlayerValidationError("Additional role is invalid.");
    if (extra.role === input.primaryRole || extra.role === input.secondaryRole || additional.some((a) => a.role === extra.role)) throw new PlayerValidationError(`${extra.role} is already one of this player's roles.`);
    additional.push({ role: extra.role, pool: dedupe(extra.pool) });
  }
  for (const pool of [primary, secondary, ...additional.map((a) => a.pool)]) if (pool.length > MAX_POOL_SIZE) throw new PlayerValidationError("That pool has more champions than exist in the game.");
  return { primary, secondary, additional };
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
}

async function replacePools(db: Db, playerId: string, pools: ValidPools) {
  await db.delete(playerChampionPools).where(eq(playerChampionPools.playerId, playerId));
  await db.delete(playerRolePools).where(eq(playerRolePools.playerId, playerId));
  const values = [
    ...pools.primary.map((championId, position) => ({ playerId, slot: "primary" as const, championId, position })),
    ...pools.secondary.map((championId, position) => ({ playerId, slot: "secondary" as const, championId, position })),
  ];
  if (values.length) await db.insert(playerChampionPools).values(values);
  const extra = pools.additional.flatMap((a) => a.pool.map((championId, position) => ({ playerId, role: a.role, championId, position })));
  if (extra.length) await db.insert(playerRolePools).values(extra);
}

export async function createPlayer(db: Db, teamId: string, input: PlayerInput): Promise<PlayerRecord> {
  const pools = validatePlayerInput(input);
  const [countRow] = await db.select({ n: sql<number>`count(*)` }).from(players).where(eq(players.teamId, teamId));
  const n = countRow?.n ?? 0;
  const [row] = await db
    .insert(players)
    .values({
      teamId,
      displayName: input.displayName.trim(),
      riotId: input.riotId?.trim() || null,
      primaryRole: input.primaryRole,
      secondaryRole: input.secondaryRole ?? null,
      additionalRoles: pools.additional.map((a) => a.role),
      notes: input.notes ?? "",
      group: "main",
      sortOrder: Number(n ?? 0),
    })
    .returning();
  await replacePools(db, row!.id, pools);
  return (await getPlayer(db, row!.id))!;
}

/** Full update. Additional roles not given are kept as they are (forms that only know primary/secondary never drop them). */
export async function updatePlayer(db: Db, playerId: string, input: PlayerInput): Promise<PlayerRecord> {
  const existing = input.additionalRoles ? null : await getPlayer(db, playerId);
  const additionalRoles = input.additionalRoles ?? (existing?.additionalRoles ?? []).filter((a) => a.role !== input.primaryRole && a.role !== input.secondaryRole);
  const pools = validatePlayerInput({ ...input, additionalRoles });
  await db.transaction(async (tx) => {
    await tx
      .update(players)
      .set({
        displayName: input.displayName.trim(),
        riotId: input.riotId?.trim() || null,
        primaryRole: input.primaryRole,
        secondaryRole: input.secondaryRole ?? null,
        additionalRoles: pools.additional.map((a) => a.role),
        notes: input.notes ?? "",
        group: "main",
        updatedAt: new Date(),
      })
      .where(eq(players.id, playerId));
    await replacePools(tx, playerId, pools);
  });
  return (await getPlayer(db, playerId))!;
}

/**
 * Team card preferences (featured champion, skin, accent and the Studio's style); does not touch
 * the profile version used by autosave. `cardStyle` undefined leaves the saved style as it is.
 */
export async function setCardStyle(db: Db, playerId: string, style: { featuredChampionId: string | null; featuredSkinNum?: number | null; cardAccent: string | null; cardStyle?: Record<string, unknown> | null }) {
  await db
    .update(players)
    .set({
      featuredChampionId: style.featuredChampionId,
      featuredSkinNum: style.featuredChampionId && style.featuredSkinNum ? style.featuredSkinNum : null,
      cardAccent: style.cardAccent,
      ...(style.cardStyle !== undefined ? { cardStyle: style.cardStyle } : {}),
    })
    .where(eq(players.id, playerId));
}


export async function archivePlayer(db: Db, playerId: string, archived: boolean) {
  await db.update(players).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(players.id, playerId));
  if (archived) await db.delete(lineupSlots).where(eq(lineupSlots.playerId, playerId));
}

export async function deletePlayer(db: Db, playerId: string) {
  await db.delete(players).where(eq(players.id, playerId));
}

export interface LineupView {
  id: string;
  name: string;
  /** role → playerId for filled slots. */
  slots: Partial<Record<Role, string>>;
  /** role → the designated substitute (at most one per role), as stored; getTeamRoster drops any no longer eligible. */
  substitutes: Partial<Record<Role, string>>;
  isComplete: boolean;
}

export async function getCurrentLineup(db: Db, teamId: string): Promise<LineupView> {
  let [row] = await db.select().from(lineups).where(and(eq(lineups.teamId, teamId), eq(lineups.isCurrent, true))).limit(1);
  if (!row) {
    [row] = await db.insert(lineups).values({ teamId, name: "Active lineup", isCurrent: true }).returning();
  }
  const [slotRows, subRows] = await Promise.all([db.select().from(lineupSlots).where(eq(lineupSlots.lineupId, row!.id)), db.select().from(lineupSubstitutes).where(eq(lineupSubstitutes.lineupId, row!.id))]);
  const slots: Partial<Record<Role, string>> = {};
  for (const s of slotRows) slots[s.role] = s.playerId;
  const substitutes: Partial<Record<Role, string>> = {};
  for (const s of subRows) substitutes[s.role] = s.playerId;
  return { id: row!.id, name: row!.name, slots, substitutes, isComplete: ROLES.every((r) => !!slots[r]) };
}

/** Assigns a player to a role in the current lineup, removing them from any other slot first. */
/** Every player profile of the team as stored, for Admin: setup in progress, personal use and archived included. */
export interface AdminProfileRow {
  id: string;
  displayName: string;
  riotId: string | null;
  primaryRole: Role | null;
  secondaryRole: Role | null;
  group: PlayerGroup;
  teamMember: boolean;
  archived: boolean;
}

export async function listProfilesForAdmin(db: Db, teamId: string): Promise<AdminProfileRow[]> {
  const rows = await db.select().from(players).where(eq(players.teamId, teamId)).orderBy(asc(players.sortOrder), asc(players.createdAt));
  return rows.map((r) => ({ id: r.id, displayName: r.displayName, riotId: r.riotId, primaryRole: r.primaryRole, secondaryRole: r.secondaryRole, group: r.group, teamMember: r.teamMember, archived: !!r.archivedAt }));
}

/**
 * Team membership (Admin only): a member uses the team workspace, appears in Players once set up
 * and can join the lineup; a personal-use profile keeps its own profile, statistics and journal
 * but none of that. Removing someone who holds a lineup place is refused until the place is
 * given to someone else, so the lineup never points at a non-member.
 */
export async function setTeamMember(db: Db, teamId: string, playerId: string, member: boolean): Promise<void> {
  const row = await getPlayerRow(db, playerId);
  if (!row || row.teamId !== teamId) throw new PlayerValidationError("That player no longer exists.");
  if (row.teamMember === member) return;
  if (!member) {
    const lineup = await getCurrentLineup(db, teamId);
    const role = ROLES.find((r) => lineup.slots[r] === playerId);
    if (role) throw new PlayerValidationError(`${row.displayName} holds the lineup's ${role === "ADC" ? "Bottom" : role.charAt(0) + role.slice(1).toLowerCase()} place. Give it to someone else first.`);
  }
  await db.update(players).set({ teamMember: member, updatedAt: new Date() }).where(eq(players.id, playerId));
}

/**
 * Puts a player in a lineup role (or clears it). Someone already holding another role leaves it.
 *
 * `bench` is a substitution from the bench (the back of a Team card): it is saved only if the lineup
 * is still what the manager saw (`replacing` still holds the role, the substitute holds none) and the
 * substitute lists the role, so a lineup someone else changed meanwhile is never overwritten.
 */
export async function setLineupSlot(db: Db, teamId: string, role: Role, playerId: string | null, bench?: { replacing: string }) {
  const lineup = await getCurrentLineup(db, teamId);
  let formerStarterSubstitutes = false;
  if (bench) {
    const stale = "The lineup changed since this page was loaded. It has been refreshed: check it and try again.";
    if (!playerId || lineup.slots[role] !== bench.replacing || Object.values(lineup.slots).includes(playerId)) throw new PlayerValidationError(stale);
    const sub = await getPlayer(db, playerId);
    if (sub && !legalRolesFor(sub).includes(role)) throw new PlayerValidationError(`${sub.displayName} does not list ${ROLE_LABELS[role]} as a role, so they cannot substitute there.`);
    // The swap: the former starter takes the substitute's place for this role when they list it.
    const former = await getPlayer(db, bench.replacing);
    formerStarterSubstitutes = !!former && legalRolesFor(former).includes(role);
  }
  if (playerId && lineup.slots[role] !== playerId) await assertLineupEligible(db, [playerId]);
  await db.transaction(async (tx) => {
    await tx.delete(lineupSlots).where(and(eq(lineupSlots.lineupId, lineup.id), eq(lineupSlots.role, role)));
    if (playerId) {
      await tx.delete(lineupSlots).where(and(eq(lineupSlots.lineupId, lineup.id), eq(lineupSlots.playerId, playerId)));
      await tx.insert(lineupSlots).values({ lineupId: lineup.id, role, playerId });
      // A starter is no longer on the bench: they stop substituting anywhere.
      await tx.delete(lineupSubstitutes).where(and(eq(lineupSubstitutes.lineupId, lineup.id), eq(lineupSubstitutes.playerId, playerId)));
    }
    if (bench) {
      await tx.delete(lineupSubstitutes).where(and(eq(lineupSubstitutes.lineupId, lineup.id), eq(lineupSubstitutes.role, role)));
      if (formerStarterSubstitutes) await tx.insert(lineupSubstitutes).values({ lineupId: lineup.id, role, playerId: bench.replacing });
    }
    await tx.update(lineups).set({ updatedAt: new Date() }).where(eq(lineups.id, lineup.id));
  });
}

/**
 * The designated substitute for one role of the current lineup (null removes it). One per role:
 * a new choice replaces the old one. The substitute must be a team member on the bench (not one of
 * the five) who lists the role; the same player may cover several roles.
 */
export async function setLineupSubstitute(db: Db, teamId: string, role: Role, playerId: string | null) {
  const lineup = await getCurrentLineup(db, teamId);
  if (playerId) {
    if (Object.values(lineup.slots).includes(playerId)) throw new PlayerValidationError("That player is in the starting lineup, so they cannot also be a substitute.");
    await assertLineupEligible(db, [playerId]);
    const sub = await getPlayer(db, playerId);
    if (!sub || !legalRolesFor(sub).includes(role)) throw new PlayerValidationError(`${sub?.displayName ?? "That player"} does not list ${ROLE_LABELS[role]} as a role, so they cannot substitute there.`);
  }
  await db.transaction(async (tx) => {
    await tx.delete(lineupSubstitutes).where(and(eq(lineupSubstitutes.lineupId, lineup.id), eq(lineupSubstitutes.role, role)));
    if (playerId) await tx.insert(lineupSubstitutes).values({ lineupId: lineup.id, role, playerId });
    await tx.update(lineups).set({ updatedAt: new Date() }).where(eq(lineups.id, lineup.id));
  });
}

export async function setLineup(db: Db, teamId: string, slots: Partial<Record<Role, string>>) {
  const lineup = await getCurrentLineup(db, teamId);
  const current = new Set(Object.values(lineup.slots));
  await assertLineupEligible(db, Object.values(slots).filter((id): id is string => !!id && !current.has(id)));
  await db.transaction(async (tx) => {
    await tx.delete(lineupSlots).where(eq(lineupSlots.lineupId, lineup.id));
    const values = ROLES.filter((r) => slots[r]).map((r) => ({ lineupId: lineup.id, role: r, playerId: slots[r]! }));
    if (values.length) {
      await tx.insert(lineupSlots).values(values);
      // Starters stop substituting.
      await tx.delete(lineupSubstitutes).where(and(eq(lineupSubstitutes.lineupId, lineup.id), inArray(lineupSubstitutes.playerId, values.map((v) => v.playerId))));
    }
    await tx.update(lineups).set({ updatedAt: new Date() }).where(eq(lineups.id, lineup.id));
  });
}

/**
 * Who can join a lineup: team members with a chosen role (the slot's role is checked against their
 * roles by the caller, as before). Unfinished setup alone no longer keeps anyone out.
 */
async function assertLineupEligible(db: Db, ids: string[]) {
  if (ids.length === 0) return;
  for (const id of ids) {
    const row = await getPlayerRow(db, id);
    if (!row) throw new PlayerValidationError("That player no longer exists.");
    if (row.archivedAt) throw new PlayerValidationError(`${row.displayName} is archived, so they cannot join the lineup.`);
    if (!row.primaryRole) throw new PlayerValidationError(`${row.displayName} has not chosen their roles yet, so there is no role to put them in.`);
    if (!row.teamMember) throw new PlayerValidationError(`${row.displayName} is not a member of the team, so they cannot join the lineup.`);
  }
}

export interface ActiveLineupProfiles {
  players: PlayerProfile[];
  assignment: Record<Role, string>;
}

/** The five active players and their role assignment, or null when the lineup is incomplete. */
export async function getActiveLineupProfiles(db: Db, teamId: string): Promise<ActiveLineupProfiles | null> {
  const lineup = await getCurrentLineup(db, teamId);
  if (!lineup.isComplete) return null;
  const ids = ROLES.map((r) => lineup.slots[r]!);
  const all = await listRolePlayers(db, teamId, { includeArchived: true, keep: ids });
  const byId = new Map(all.map((p) => [p.id, p]));
  const selected = ids.map((id) => byId.get(id)).filter((p): p is PlayerRecord & PlayerProfile => !!p);
  if (selected.length !== 5) return null;
  return { players: selected, assignment: lineup.slots as Record<Role, string> };
}

export interface LineupPreset {
  id: string;
  name: string;
  slots: Partial<Record<Role, string>>;
  isSaved: boolean;
  lastUsedAt: Date | null;
  updatedAt: Date;
}

async function presetsFor(db: Db, teamId: string): Promise<LineupPreset[]> {
  const rows = await db.select().from(lineups).where(and(eq(lineups.teamId, teamId), eq(lineups.isCurrent, false)));
  if (rows.length === 0) return [];
  const slotRows = await db.select().from(lineupSlots).where(inArray(lineupSlots.lineupId, rows.map((r) => r.id)));
  return rows.map((r) => {
    const slots: Partial<Record<Role, string>> = {};
    for (const s of slotRows) if (s.lineupId === r.id) slots[s.role] = s.playerId;
    return { id: r.id, name: r.name, slots, isSaved: r.isSaved, lastUsedAt: r.lastUsedAt, updatedAt: r.updatedAt };
  });
}

/** Named presets (saved) and automatically remembered recent lineups, most recent first. */
export async function listLineupPresets(db: Db, teamId: string): Promise<{ saved: LineupPreset[]; recent: LineupPreset[] }> {
  const all = await presetsFor(db, teamId);
  const byTime = (a: LineupPreset, b: LineupPreset) => (b.lastUsedAt?.getTime() ?? b.updatedAt.getTime()) - (a.lastUsedAt?.getTime() ?? a.updatedAt.getTime());
  // Recent includes saved presets that were used: "what we ran last time" is the question.
  return { saved: all.filter((p) => p.isSaved).sort((a, b) => a.name.localeCompare(b.name)), recent: all.filter((p) => p.lastUsedAt).sort(byTime).slice(0, 6) };
}

/** Saves the current five-player assignment under a name (replacing a preset with the same name). */
export async function saveCurrentLineupAs(db: Db, teamId: string, name: string): Promise<LineupPreset> {
  const current = await getCurrentLineup(db, teamId);
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) throw new PlayerValidationError("Give the lineup a name.");
  if (!current.isComplete) throw new PlayerValidationError("Fill all five roles before saving the lineup.");
  const existing = (await presetsFor(db, teamId)).find((p) => p.isSaved && p.name.toLowerCase() === trimmed.toLowerCase());
  const id = await db.transaction(async (tx) => {
    let lineupId = existing?.id;
    if (!lineupId) {
      const [row] = await tx.insert(lineups).values({ teamId, name: trimmed, isCurrent: false, isSaved: true }).returning({ id: lineups.id });
      lineupId = row!.id;
    } else {
      await tx.delete(lineupSlots).where(eq(lineupSlots.lineupId, lineupId));
      await tx.update(lineups).set({ updatedAt: new Date() }).where(eq(lineups.id, lineupId));
    }
    await tx.insert(lineupSlots).values(ROLES.map((r) => ({ lineupId: lineupId!, role: r, playerId: current.slots[r]! })));
    return lineupId;
  });
  return (await presetsFor(db, teamId)).find((p) => p.id === id)!;
}

/** Makes a preset the active lineup (players that were archived or deleted are skipped). */
export async function applyLineupPreset(db: Db, teamId: string, presetId: string): Promise<void> {
  const preset = (await presetsFor(db, teamId)).find((p) => p.id === presetId);
  if (!preset) throw new PlayerValidationError("Lineup preset not found.");
  const valid = new Set((await listPlayers(db, teamId)).map((p) => p.id));
  const slots: Partial<Record<Role, string>> = {};
  for (const r of ROLES) if (preset.slots[r] && valid.has(preset.slots[r]!)) slots[r] = preset.slots[r];
  await setLineup(db, teamId, slots);
  await db.update(lineups).set({ lastUsedAt: new Date() }).where(eq(lineups.id, presetId));
}

export async function deleteLineupPreset(db: Db, teamId: string, presetId: string): Promise<void> {
  await db.delete(lineups).where(and(eq(lineups.id, presetId), eq(lineups.teamId, teamId), eq(lineups.isCurrent, false)));
}

export interface ProfilePatch {
  primaryRole?: Role;
  secondaryRole?: Role | null;
  primaryPool?: string[];
  secondaryPool?: string[];
  /** The whole list of additional roles (order = preference) with their pools. */
  additionalRoles?: RolePool[];
}

export type ProfilePatchResult = { ok: true; version: string; player: PlayerRecord } | { ok: false; conflict: true; version: string; player: PlayerRecord };

/** A profile's edit version: its last update time (what autosave sends back to detect concurrent edits). */
export function profileVersion(player: Pick<PlayerRecord, "updatedAt">): string {
  return player.updatedAt.toISOString();
}

/**
 * Autosave for roles and champion pools: applies only the fields given. With `expectedVersion`,
 * a change made elsewhere since (another tab, an admin) is reported as a conflict instead of
 * being overwritten; the caller then shows the current state. Rows are locked for the update so
 * two saves of the same profile never interleave.
 */
export async function patchPlayerProfile(db: Db, playerId: string, patch: ProfilePatch, expectedVersion?: string | null): Promise<ProfilePatchResult> {
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select({ id: players.id, updatedAt: players.updatedAt }).from(players).where(eq(players.id, playerId)).for("update");
    if (!locked) throw new PlayerValidationError("Player not found.");
    const current = (await getPlayer(tx as unknown as Db, playerId))!;
    if (expectedVersion && profileVersion(current) !== expectedVersion) return { ok: false as const, conflict: true as const, version: profileVersion(current), player: current };
    const primaryRole = patch.primaryRole ?? current.primaryRole;
    // A member who has not chosen a role yet gets one first; nothing is assumed for them.
    if (!primaryRole) throw new PlayerValidationError("Choose a primary role first.");
    let secondaryRole = patch.secondaryRole === undefined ? current.secondaryRole : patch.secondaryRole;
    if (secondaryRole === primaryRole) secondaryRole = patch.primaryRole ? null : secondaryRole;
    const secondaryPool = secondaryRole ? (patch.secondaryPool ?? current.secondaryPool) : [];
    // A role that became primary or secondary leaves the additional list (its pool goes with it).
    const additionalRoles = (patch.additionalRoles ?? current.additionalRoles).filter((a) => a.role !== primaryRole && a.role !== secondaryRole);
    const pools = validatePlayerInput({ displayName: current.displayName, primaryRole, secondaryRole, primaryPool: patch.primaryPool ?? current.primaryPool, secondaryPool, additionalRoles });
    const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
    await tx.update(players).set({ primaryRole, secondaryRole, additionalRoles: pools.additional.map((a) => a.role), updatedAt }).where(eq(players.id, playerId));
    await replacePools(tx as unknown as Db, playerId, pools);
    return null;
  });
  if (result) return result;
  const fresh = (await getPlayer(db, playerId))!;
  return { ok: true, version: profileVersion(fresh), player: fresh };
}

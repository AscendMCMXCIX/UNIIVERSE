import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { lineupSlots, lineups, playerChampionPools, players, teams } from "@/server/db/schema";
import { ROLES, type Role } from "@/domain/roles";
import type { PlayerGroup, PlayerProfile, PoolLimits } from "@/domain/roster";
import { DEFAULT_POOL_LIMITS } from "@/domain/roster";

export interface PlayerRecord extends PlayerProfile {
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
  poolLimits: PoolLimits;
  engineConfig: Record<string, unknown>;
}

/** UNIIVERSE is single-team today; the schema allows more later. */
export async function getOrCreateTeam(db: Db): Promise<TeamRecord> {
  const [existing] = await db.select().from(teams).orderBy(asc(teams.createdAt)).limit(1);
  const row = existing ?? (await db.insert(teams).values({ name: "UNIIVERSE", primaryPoolLimit: DEFAULT_POOL_LIMITS.primary, secondaryPoolLimit: DEFAULT_POOL_LIMITS.secondary }).returning())[0]!;
  return {
    id: row.id,
    name: row.name,
    poolLimits: { primary: row.primaryPoolLimit, secondary: row.secondaryPoolLimit },
    engineConfig: row.engineConfig,
  };
}

export async function updateTeam(db: Db, teamId: string, patch: Partial<{ name: string; primaryPoolLimit: number; secondaryPoolLimit: number; engineConfig: Record<string, unknown> }>) {
  await db.update(teams).set({ ...patch, updatedAt: new Date() }).where(eq(teams.id, teamId));
}

async function loadPools(db: Db, playerIds: string[]): Promise<Map<string, { primary: string[]; secondary: string[] }>> {
  const map = new Map<string, { primary: string[]; secondary: string[] }>();
  if (playerIds.length === 0) return map;
  const rows = await db
    .select()
    .from(playerChampionPools)
    .where(inArray(playerChampionPools.playerId, playerIds))
    .orderBy(asc(playerChampionPools.position), asc(playerChampionPools.createdAt));
  for (const r of rows) {
    const entry = map.get(r.playerId) ?? { primary: [], secondary: [] };
    entry[r.slot].push(r.championId);
    map.set(r.playerId, entry);
  }
  return map;
}

function toRecord(row: typeof players.$inferSelect, pools: { primary: string[]; secondary: string[] }): PlayerRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    group: row.group,
    primaryRole: row.primaryRole,
    secondaryRole: row.secondaryRole,
    primaryPool: pools.primary,
    secondaryPool: pools.secondary,
    riotId: row.riotId,
    notes: row.notes,
    archivedAt: row.archivedAt,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listPlayers(db: Db, teamId: string, options: { includeArchived?: boolean } = {}): Promise<PlayerRecord[]> {
  const rows = await db
    .select()
    .from(players)
    .where(options.includeArchived ? eq(players.teamId, teamId) : and(eq(players.teamId, teamId), isNull(players.archivedAt)))
    .orderBy(asc(players.sortOrder), asc(players.createdAt));
  const pools = await loadPools(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toRecord(r, pools.get(r.id) ?? { primary: [], secondary: [] }));
}

export async function getPlayer(db: Db, playerId: string): Promise<PlayerRecord | null> {
  const [row] = await db.select().from(players).where(eq(players.id, playerId));
  if (!row) return null;
  const pools = await loadPools(db, [row.id]);
  return toRecord(row, pools.get(row.id) ?? { primary: [], secondary: [] });
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
}

export class PlayerValidationError extends Error {}

function validatePlayerInput(input: PlayerInput, limits: PoolLimits) {
  if (!input.displayName.trim()) throw new PlayerValidationError("Display name is required.");
  if (!ROLES.includes(input.primaryRole)) throw new PlayerValidationError("Primary role is invalid.");
  if (input.secondaryRole && !ROLES.includes(input.secondaryRole)) throw new PlayerValidationError("Secondary role is invalid.");
  if (input.secondaryRole && input.secondaryRole === input.primaryRole) throw new PlayerValidationError("Secondary role must differ from the primary role.");
  const primary = dedupe(input.primaryPool ?? []);
  const secondary = dedupe(input.secondaryPool ?? []);
  if (primary.length > limits.primary) throw new PlayerValidationError(`Primary pool is limited to ${limits.primary} champions.`);
  if (secondary.length > limits.secondary) throw new PlayerValidationError(`Secondary pool is limited to ${limits.secondary} champions.`);
  if (!input.secondaryRole && secondary.length > 0) throw new PlayerValidationError("Choose a secondary role before adding a secondary pool.");
  return { primary, secondary };
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
}

async function replacePools(db: Db, playerId: string, primary: string[], secondary: string[]) {
  await db.delete(playerChampionPools).where(eq(playerChampionPools.playerId, playerId));
  const values = [
    ...primary.map((championId, position) => ({ playerId, slot: "primary" as const, championId, position })),
    ...secondary.map((championId, position) => ({ playerId, slot: "secondary" as const, championId, position })),
  ];
  if (values.length) await db.insert(playerChampionPools).values(values);
}

export async function createPlayer(db: Db, teamId: string, input: PlayerInput, limits: PoolLimits): Promise<PlayerRecord> {
  const { primary, secondary } = validatePlayerInput(input, limits);
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
      notes: input.notes ?? "",
      group: input.group ?? "main",
      sortOrder: Number(n ?? 0),
    })
    .returning();
  await replacePools(db, row!.id, primary, secondary);
  return (await getPlayer(db, row!.id))!;
}

export async function updatePlayer(db: Db, playerId: string, input: PlayerInput, limits: PoolLimits): Promise<PlayerRecord> {
  const { primary, secondary } = validatePlayerInput(input, limits);
  await db.transaction(async (tx) => {
    await tx
      .update(players)
      .set({
        displayName: input.displayName.trim(),
        riotId: input.riotId?.trim() || null,
        primaryRole: input.primaryRole,
        secondaryRole: input.secondaryRole ?? null,
        notes: input.notes ?? "",
        group: input.group ?? "main",
        updatedAt: new Date(),
      })
      .where(eq(players.id, playerId));
    await replacePools(tx, playerId, primary, secondary);
  });
  return (await getPlayer(db, playerId))!;
}

export async function setPlayerGroup(db: Db, playerId: string, group: PlayerGroup) {
  await db.update(players).set({ group, updatedAt: new Date() }).where(eq(players.id, playerId));
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
  isComplete: boolean;
}

export async function getCurrentLineup(db: Db, teamId: string): Promise<LineupView> {
  let [row] = await db.select().from(lineups).where(and(eq(lineups.teamId, teamId), eq(lineups.isCurrent, true))).limit(1);
  if (!row) {
    [row] = await db.insert(lineups).values({ teamId, name: "Active lineup", isCurrent: true }).returning();
  }
  const slotRows = await db.select().from(lineupSlots).where(eq(lineupSlots.lineupId, row!.id));
  const slots: Partial<Record<Role, string>> = {};
  for (const s of slotRows) slots[s.role] = s.playerId;
  return { id: row!.id, name: row!.name, slots, isComplete: ROLES.every((r) => !!slots[r]) };
}

/** Assigns a player to a role in the current lineup, removing them from any other slot first. */
export async function setLineupSlot(db: Db, teamId: string, role: Role, playerId: string | null) {
  const lineup = await getCurrentLineup(db, teamId);
  await db.transaction(async (tx) => {
    await tx.delete(lineupSlots).where(and(eq(lineupSlots.lineupId, lineup.id), eq(lineupSlots.role, role)));
    if (playerId) {
      await tx.delete(lineupSlots).where(and(eq(lineupSlots.lineupId, lineup.id), eq(lineupSlots.playerId, playerId)));
      await tx.insert(lineupSlots).values({ lineupId: lineup.id, role, playerId });
    }
    await tx.update(lineups).set({ updatedAt: new Date() }).where(eq(lineups.id, lineup.id));
  });
}

export async function setLineup(db: Db, teamId: string, slots: Partial<Record<Role, string>>) {
  const lineup = await getCurrentLineup(db, teamId);
  await db.transaction(async (tx) => {
    await tx.delete(lineupSlots).where(eq(lineupSlots.lineupId, lineup.id));
    const values = ROLES.filter((r) => slots[r]).map((r) => ({ lineupId: lineup.id, role: r, playerId: slots[r]! }));
    if (values.length) await tx.insert(lineupSlots).values(values);
    await tx.update(lineups).set({ updatedAt: new Date() }).where(eq(lineups.id, lineup.id));
  });
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
  const all = await listPlayers(db, teamId, { includeArchived: true });
  const byId = new Map(all.map((p) => [p.id, p]));
  const selected = ids.map((id) => byId.get(id)).filter((p): p is PlayerRecord => !!p);
  if (selected.length !== 5) return null;
  return { players: selected, assignment: lineup.slots as Record<Role, string> };
}

/** Marks the current lineup as recently used (recent lineups list). */
export async function rememberLineupUse(db: Db, teamId: string) {
  const lineup = await getCurrentLineup(db, teamId);
  await db.update(lineups).set({ lastUsedAt: new Date() }).where(eq(lineups.id, lineup.id));
}

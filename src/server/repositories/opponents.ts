import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matches, opponentPlayers, opponentTeams } from "@/server/db/schema";
import { getOrCreateTeam } from "./team";
import type { Role } from "@/domain/roles";

export type ScoutConfidence = "high" | "medium" | "low" | "unknown";

export class OpponentError extends Error {}

export async function listOpponentTeams(db: Db, teamId: string, options: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select()
    .from(opponentTeams)
    .where(options.includeArchived ? eq(opponentTeams.teamId, teamId) : and(eq(opponentTeams.teamId, teamId), isNull(opponentTeams.archivedAt)))
    .orderBy(desc(opponentTeams.updatedAt));
  if (rows.length === 0) return [];
  const counts = await db
    .select({ opponentTeamId: matches.opponentTeamId, n: sql<number>`count(*)` })
    .from(matches)
    .where(inArray(matches.opponentTeamId, rows.map((r) => r.id)))
    .groupBy(matches.opponentTeamId);
  const playerCounts = await db
    .select({ opponentTeamId: opponentPlayers.opponentTeamId, n: sql<number>`count(*)` })
    .from(opponentPlayers)
    .where(inArray(opponentPlayers.opponentTeamId, rows.map((r) => r.id)))
    .groupBy(opponentPlayers.opponentTeamId);
  return rows.map((r) => ({ ...r, matchCount: Number(counts.find((c) => c.opponentTeamId === r.id)?.n ?? 0), playerCount: Number(playerCounts.find((c) => c.opponentTeamId === r.id)?.n ?? 0) }));
}

export async function getOpponentTeam(db: Db, id: string) {
  const [team] = await db.select().from(opponentTeams).where(eq(opponentTeams.id, id));
  if (!team) return null;
  const players = await db.select().from(opponentPlayers).where(eq(opponentPlayers.opponentTeamId, id)).orderBy(asc(opponentPlayers.sortOrder), asc(opponentPlayers.createdAt));
  return { ...team, players };
}

export async function createOpponentTeam(db: Db, teamId: string, input: { name: string; aliases?: string[]; notes?: string }) {
  const name = input.name.trim();
  if (!name) throw new OpponentError("Opponent name is required.");
  const [row] = await db.insert(opponentTeams).values({ teamId, name, aliases: (input.aliases ?? []).map((a) => a.trim()).filter(Boolean), notes: input.notes ?? "" }).returning();
  return row!;
}

export async function updateOpponentTeam(db: Db, id: string, patch: Partial<{ name: string; aliases: string[]; notes: string; archivedAt: Date | null }>) {
  if (patch.name !== undefined && !patch.name.trim()) throw new OpponentError("Opponent name is required.");
  await db.update(opponentTeams).set({ ...patch, updatedAt: new Date() }).where(eq(opponentTeams.id, id));
}

export async function deleteOpponentTeam(db: Db, id: string) {
  // Matches keep their opponentName text; the foreign key is set null by the schema.
  await db.delete(opponentTeams).where(eq(opponentTeams.id, id));
}

/** Finds an opponent by exact name or alias (case-insensitive) within the team. */
export async function findOpponentByName(db: Db, teamId: string, name: string) {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;
  const rows = await db.select().from(opponentTeams).where(eq(opponentTeams.teamId, teamId));
  return rows.find((r) => r.name.toLowerCase() === needle || r.aliases.some((a) => a.toLowerCase() === needle)) ?? null;
}

export interface OpponentPlayerInput {
  label: string;
  likelyRole?: Role | null;
  altRole?: Role | null;
  confidence?: ScoutConfidence;
  notes?: string;
  aliases?: string[];
}

export async function addOpponentPlayer(db: Db, opponentTeamId: string, input: OpponentPlayerInput) {
  const label = input.label.trim();
  if (!label) throw new OpponentError("Give the player a label (their name or e.g. 'Enemy Top').");
  const [countRow] = await db.select({ n: sql<number>`count(*)` }).from(opponentPlayers).where(eq(opponentPlayers.opponentTeamId, opponentTeamId));
  const [row] = await db
    .insert(opponentPlayers)
    .values({ opponentTeamId, label, likelyRole: input.likelyRole ?? null, altRole: input.altRole ?? null, confidence: input.confidence ?? "unknown", notes: input.notes ?? "", aliases: input.aliases ?? [], sortOrder: Number(countRow?.n ?? 0) })
    .returning();
  await db.update(opponentTeams).set({ updatedAt: new Date() }).where(eq(opponentTeams.id, opponentTeamId));
  return row!;
}

export async function updateOpponentPlayer(db: Db, id: string, patch: Partial<OpponentPlayerInput>) {
  await db.update(opponentPlayers).set({ ...patch, updatedAt: new Date() }).where(eq(opponentPlayers.id, id));
}

export async function deleteOpponentPlayer(db: Db, id: string) {
  await db.delete(opponentPlayers).where(eq(opponentPlayers.id, id));
}

/** Previous saved matches against an opponent (reference only). */
export async function previousMeetings(db: Db, opponentTeamId: string, limit = 20) {
  return db.select().from(matches).where(and(eq(matches.opponentTeamId, opponentTeamId), isNull(matches.archivedAt))).orderBy(desc(matches.playedAt)).limit(limit);
}

export async function getOrCreateTeamId(db: Db): Promise<string> {
  return (await getOrCreateTeam(db)).id;
}

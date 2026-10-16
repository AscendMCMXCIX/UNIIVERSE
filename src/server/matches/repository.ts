import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matches } from "@/server/db/schema";
import { deriveDraft } from "@/domain/draft";
import type { CompetitionMode } from "@/domain/competition";
import { toDraftState, type DraftRecord } from "@/server/repositories/drafts";
import type { EnemyPlayerNames } from "@/server/db/schema";
import { refreshSeriesScore } from "@/server/series/repository";

export type MatchRow = typeof matches.$inferSelect;
export type MatchResult = "win" | "loss" | "cancelled";

/**
 * Builds the archived match record from everything the draft already knows. Idempotent per
 * draft: completing a draft twice (or saving a theorycraft draft by hand) never duplicates it.
 */
export async function createMatchFromDraft(db: Db, draft: DraftRecord): Promise<string> {
  const [existing] = await db.select({ id: matches.id }).from(matches).where(eq(matches.draftId, draft.id));
  if (existing) return existing.id;
  const derived = deriveDraft(toDraftState(draft));
  const [row] = await db
    .insert(matches)
    .values({
      teamId: draft.teamId,
      draftId: draft.id,
      mode: draft.mode,
      eventName: draft.eventName,
      patch: draft.patch,
      side: draft.side,
      lineupSnapshot: draft.lineup,
      finalAssignments: draft.currentAssignments,
      ourBans: derived.ourBans.map((b) => b.championId),
      enemyBans: derived.enemyBans.map((b) => b.championId),
      ourPicks: derived.ourPicks.map((p) => ({ playerId: p.playerId, role: p.role, championId: p.championId, index: p.index })),
      enemyPicks: derived.enemyPicks.map((p) => ({ championId: p.championId, index: p.index })),
      opponentTeamId: draft.opponentTeamId,
      opponentName: draft.opponentName,
      seriesId: draft.seriesId,
      gameNumber: draft.gameNumber,
      enemyPlayers: draft.enemyPlayers ?? {},
      playbook: (draft.finalAnalysis?.playbook as Record<string, unknown> | undefined) ?? null,
      playedAt: draft.completedAt ?? new Date(),
    })
    .returning({ id: matches.id });
  return row!.id;
}

export interface MatchFilters {
  mode?: CompetitionMode | null;
  result?: MatchResult | "none" | null;
  /** Opponent label, matched case-insensitively. */
  opponentName?: string | null;
  seriesId?: string | null;
  patch?: string | null;
  /** Champion we picked. */
  championId?: string | null;
  /** Player in the lineup. */
  playerId?: string | null;
  limit?: number;
}

export async function listMatches(db: Db, teamId: string, filters: MatchFilters = {}): Promise<MatchRow[]> {
  const conditions = [eq(matches.teamId, teamId), isNull(matches.archivedAt)];
  if (filters.mode) conditions.push(eq(matches.mode, filters.mode));
  if (filters.result === "none") conditions.push(isNull(matches.result));
  else if (filters.result) conditions.push(eq(matches.result, filters.result));
  if (filters.opponentName) conditions.push(sql`lower(${matches.opponentName}) = lower(${filters.opponentName.trim()})`);
  if (filters.seriesId) conditions.push(eq(matches.seriesId, filters.seriesId));
  if (filters.patch) conditions.push(eq(matches.patch, filters.patch));
  const rows = await db
    .select()
    .from(matches)
    .where(and(...conditions))
    .orderBy(desc(matches.playedAt))
    .limit(filters.limit ?? 200);
  // JSON-array filters are applied in memory: the archive is small and this keeps the query portable.
  return rows.filter((m) => (!filters.championId || m.ourPicks.some((p) => p.championId === filters.championId)) && (!filters.playerId || m.ourPicks.some((p) => p.playerId === filters.playerId) || m.lineupSnapshot.some((p) => p.id === filters.playerId)));
}

export async function getMatch(db: Db, id: string): Promise<MatchRow | null> {
  const [row] = await db.select().from(matches).where(eq(matches.id, id));
  return row ?? null;
}

export async function getMatchByDraft(db: Db, draftId: string): Promise<MatchRow | null> {
  const [row] = await db.select().from(matches).where(eq(matches.draftId, draftId));
  return row ?? null;
}

export interface MatchUpdate {
  result?: MatchResult | null;
  durationSeconds?: number | null;
  riotMatchId?: string | null;
  riotInfo?: Record<string, unknown> | null;
  notes?: string;
  vodUrl?: string;
  playedAt?: Date;
  eventName?: string;
  opponentName?: string;
  enemyPlayers?: EnemyPlayerNames;
  mode?: CompetitionMode;
}

/**
 * The record's next version stamp: now, but always at least a millisecond after the stored one, so
 * two writes in the same millisecond still give two versions (the editor's save check compares them).
 */
function nextVersion() {
  return sql`greatest(${new Date().toISOString()}::timestamptz, date_trunc('milliseconds', ${matches.updatedAt}) + interval '1 millisecond')`;
}

/** Optional, hand-entered facts about the match. Never consulted by the engine. Only the fields present in `patch` change. */
export async function updateMatch(db: Db, id: string, patch: MatchUpdate): Promise<void> {
  const [before] = await db.select({ seriesId: matches.seriesId, result: matches.result }).from(matches).where(eq(matches.id, id));
  await db.update(matches).set({ ...patch, updatedAt: nextVersion() }).where(eq(matches.id, id));
  // A changed result moves the series score (and may decide the series).
  if (before?.seriesId && patch.result !== undefined && patch.result !== before.result) await refreshSeriesScore(db, before.seriesId);
}

/**
 * `updateMatch`, but only if the record is still the version the editor loaded (`expectedUpdatedAt`,
 * compared to the millisecond). The check and the write are one statement, so a link, a Riot fetch
 * or another editor's save that landed in between is never overwritten by a stale form: the call
 * returns false and nothing changes.
 */
export async function updateMatchIfUnchanged(db: Db, id: string, patch: MatchUpdate, expectedUpdatedAt: Date): Promise<boolean> {
  const [before] = await db.select({ seriesId: matches.seriesId, result: matches.result }).from(matches).where(eq(matches.id, id));
  const written = await db
    .update(matches)
    .set({ ...patch, updatedAt: nextVersion() })
    .where(and(eq(matches.id, id), sql`date_trunc('milliseconds', ${matches.updatedAt}) = ${expectedUpdatedAt.toISOString()}::timestamptz`))
    .returning({ id: matches.id });
  if (written.length === 0) return false;
  if (before?.seriesId && patch.result !== undefined && patch.result !== before.result) await refreshSeriesScore(db, before.seriesId);
  return true;
}

/**
 * Deletes a match from the archive the safe way: the record is hidden (archived) rather than
 * removed, so players, Riot accounts, the draft and other matches are untouched and nothing points
 * at a missing row. A series it belonged to is re-scored without it at once.
 */
export async function archiveMatch(db: Db, id: string): Promise<void> {
  const [before] = await db.select({ seriesId: matches.seriesId }).from(matches).where(eq(matches.id, id));
  await db.update(matches).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(matches.id, id));
  if (before?.seriesId) await refreshSeriesScore(db, before.seriesId);
}

/** Brings an archived match back (saving the same draft as a match again). */
export async function restoreMatch(db: Db, id: string): Promise<void> {
  const [before] = await db.select({ seriesId: matches.seriesId }).from(matches).where(eq(matches.id, id));
  await db.update(matches).set({ archivedAt: null, updatedAt: new Date() }).where(eq(matches.id, id));
  if (before?.seriesId) await refreshSeriesScore(db, before.seriesId);
}

/** Saves a completed draft as a match, bringing back its record if that match had been deleted. */
export async function saveMatchFromDraft(db: Db, draft: DraftRecord): Promise<string> {
  const previous = await getMatchByDraft(db, draft.id);
  if (previous?.archivedAt) await restoreMatch(db, previous.id);
  return previous?.id ?? createMatchFromDraft(db, draft);
}

/** Permanent removal (maintenance and tests only; the app archives). */
export async function deleteMatch(db: Db, id: string): Promise<void> {
  const [before] = await db.select({ seriesId: matches.seriesId }).from(matches).where(eq(matches.id, id));
  await db.delete(matches).where(eq(matches.id, id));
  if (before?.seriesId) await refreshSeriesScore(db, before.seriesId);
}

/** Distinct patches and opponent labels present in the archive, for filter controls. */
export async function matchFilterOptions(db: Db, teamId: string): Promise<{ patches: string[]; opponents: string[] }> {
  const rows = await db.select({ patch: matches.patch, opponentName: matches.opponentName }).from(matches).where(and(eq(matches.teamId, teamId), isNull(matches.archivedAt)));
  const patches = [...new Set(rows.map((r) => r.patch))].sort().reverse();
  const opponents = new Map<string, string>();
  for (const r of rows) if (r.opponentName.trim()) opponents.set(r.opponentName.trim().toLowerCase(), r.opponentName.trim());
  return { patches, opponents: [...opponents.values()].sort((a, b) => a.localeCompare(b)) };
}

export async function matchSummary(db: Db, teamId: string): Promise<{ total: number; wins: number; losses: number }> {
  const [row] = await db
    .select({ total: sql<number>`count(*)`, wins: sql<number>`count(*) filter (where ${matches.result} = 'win')`, losses: sql<number>`count(*) filter (where ${matches.result} = 'loss')` })
    .from(matches)
    .where(and(eq(matches.teamId, teamId), isNull(matches.archivedAt)));
  return { total: Number(row?.total ?? 0), wins: Number(row?.wins ?? 0), losses: Number(row?.losses ?? 0) };
}

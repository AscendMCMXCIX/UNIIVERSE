import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { drafts, matches, series } from "@/server/db/schema";
import type { CompetitionMode } from "@/domain/competition";
import { canStartNextGame, scoreSeries, type SeriesLength, type SeriesStatus, type SeriesWinner } from "@/domain/series";

export interface SeriesRecord {
  id: string;
  teamId: string;
  mode: CompetitionMode;
  eventName: string;
  opponentName: string;
  bestOf: number;
  status: SeriesStatus;
  ourWins: number;
  theirWins: number;
  winner: SeriesWinner | null;
  notes: string;
  createdAt: Date;
  completedAt: Date | null;
  /** Games started so far (drafts in the series). */
  gamesStarted: number;
  /** The account that started the series; it manages it (admins may override). */
  createdByUserId: string | null;
}

export class SeriesError extends Error {}

function toRecord(row: typeof series.$inferSelect, gamesStarted: number): SeriesRecord {
  return {
    id: row.id,
    teamId: row.teamId,
    mode: row.mode,
    eventName: row.eventName,
    opponentName: row.opponentName,
    bestOf: row.bestOf,
    status: row.status,
    ourWins: row.ourWins,
    theirWins: row.theirWins,
    winner: row.winner === "us" || row.winner === "them" ? row.winner : null,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    gamesStarted,
  };
}

async function gamesStartedFor(db: Db, seriesIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (seriesIds.length === 0) return map;
  const rows = await db.select({ seriesId: drafts.seriesId, n: sql<number>`count(*)` }).from(drafts).where(and(inArray(drafts.seriesId, seriesIds), ne(drafts.status, "abandoned"))).groupBy(drafts.seriesId);
  for (const r of rows) if (r.seriesId) map.set(r.seriesId, Number(r.n));
  return map;
}

export async function createSeries(db: Db, teamId: string, input: { mode: CompetitionMode; bestOf: SeriesLength; eventName?: string; opponentName?: string; createdByUserId?: string | null }): Promise<SeriesRecord> {
  const [row] = await db
    .insert(series)
    .values({ teamId, mode: input.mode, bestOf: input.bestOf, eventName: input.eventName?.trim() ?? "", opponentName: input.opponentName?.trim() ?? "", createdByUserId: input.createdByUserId ?? null })
    .returning();
  return toRecord(row!, 0);
}

export async function getSeries(db: Db, id: string): Promise<SeriesRecord | null> {
  const [row] = await db.select().from(series).where(eq(series.id, id));
  if (!row) return null;
  return toRecord(row, (await gamesStartedFor(db, [row.id])).get(row.id) ?? 0);
}

export async function listSeries(db: Db, teamId: string, limit = 100): Promise<SeriesRecord[]> {
  const rows = await db.select().from(series).where(eq(series.teamId, teamId)).orderBy(desc(series.createdAt)).limit(limit);
  const started = await gamesStartedFor(db, rows.map((r) => r.id));
  return rows.map((r) => toRecord(r, started.get(r.id) ?? 0));
}

/** The next game number for a series (1-based, after the games already started). */
export async function nextGameNumber(db: Db, seriesId: string): Promise<number> {
  const [row] = await db.select({ max: sql<number>`coalesce(max(${drafts.gameNumber}), 0)` }).from(drafts).where(and(eq(drafts.seriesId, seriesId), ne(drafts.status, "abandoned")));
  return Number(row?.max ?? 0) + 1;
}

/** Whether a new game may be started in this series right now. */
export async function canStartGame(db: Db, seriesId: string): Promise<{ ok: true; series: SeriesRecord; gameNumber: number } | { ok: false; error: string }> {
  const s = await getSeries(db, seriesId);
  if (!s) return { ok: false, error: "Series not found." };
  if (s.status === "cancelled") return { ok: false, error: "This series was cancelled." };
  if (!canStartNextGame({ status: s.status, bestOf: s.bestOf, ourWins: s.ourWins, theirWins: s.theirWins, gamesStarted: s.gamesStarted })) return { ok: false, error: s.status === "completed" ? "This series is already decided." : "Every game of this series has been started." };
  return { ok: true, series: s, gameNumber: s.gamesStarted + 1 };
}

/**
 * Recomputes the score from the recorded results of the series' games and closes the series
 * once one side has enough wins. Called whenever a game result changes.
 */
export async function refreshSeriesScore(db: Db, seriesId: string): Promise<SeriesRecord | null> {
  const [row] = await db.select().from(series).where(eq(series.id, seriesId));
  if (!row) return null;
  const games = await db.select({ result: matches.result }).from(matches).where(and(eq(matches.seriesId, seriesId), isNull(matches.archivedAt)));
  const score = scoreSeries(row.bestOf, games.map((g) => g.result));
  const patch: Partial<typeof series.$inferInsert> = { ourWins: score.ourWins, theirWins: score.theirWins, updatedAt: new Date() };
  if (row.status !== "cancelled") {
    if (score.winner) {
      patch.status = "completed";
      patch.winner = score.winner;
      patch.completedAt = row.completedAt ?? new Date();
    } else if (row.status === "completed" && row.winner && !score.winner) {
      // A result was removed or changed: the series is open again.
      patch.status = "in_progress";
      patch.winner = null;
      patch.completedAt = null;
    }
  }
  await db.update(series).set(patch).where(eq(series.id, seriesId));
  return getSeries(db, seriesId);
}

/** Ends a series early: decided by the current score when one side leads, otherwise cancelled. */
export async function endSeries(db: Db, seriesId: string, options: { cancel?: boolean } = {}): Promise<SeriesRecord | null> {
  const s = await getSeries(db, seriesId);
  if (!s) return null;
  if (s.status !== "in_progress") return s;
  const winner: SeriesWinner | null = options.cancel ? null : s.ourWins > s.theirWins ? "us" : s.theirWins > s.ourWins ? "them" : null;
  await db
    .update(series)
    .set({ status: options.cancel || !winner ? "cancelled" : "completed", winner, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(series.id, seriesId));
  return getSeries(db, seriesId);
}

/** Re-opens a cancelled or completed series so another game can be played (archive housekeeping). */
export async function reopenSeries(db: Db, seriesId: string): Promise<SeriesRecord | null> {
  await db.update(series).set({ status: "in_progress", winner: null, completedAt: null, updatedAt: new Date() }).where(eq(series.id, seriesId));
  return refreshSeriesScore(db, seriesId);
}

export async function updateSeries(db: Db, seriesId: string, patch: Partial<{ eventName: string; opponentName: string; notes: string }>): Promise<void> {
  await db.update(series).set({ ...patch, updatedAt: new Date() }).where(eq(series.id, seriesId));
}

/** Games of a series in order (drafts, with their match record ids when archived). */
export async function listSeriesGames(db: Db, seriesId: string) {
  const rows = await db.select({ draftId: drafts.id, gameNumber: drafts.gameNumber, side: drafts.side, status: drafts.status, createdAt: drafts.createdAt }).from(drafts).where(and(eq(drafts.seriesId, seriesId), ne(drafts.status, "abandoned"))).orderBy(asc(drafts.gameNumber), asc(drafts.createdAt));
  const matchRows = await db.select({ id: matches.id, draftId: matches.draftId, result: matches.result, gameNumber: matches.gameNumber }).from(matches).where(and(eq(matches.seriesId, seriesId), isNull(matches.archivedAt)));
  return rows.map((r) => {
    const m = matchRows.find((x) => x.draftId === r.draftId);
    return { ...r, matchId: m?.id ?? null, result: m?.result ?? null };
  });
}

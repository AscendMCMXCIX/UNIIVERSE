import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, riotAccounts } from "@/server/db/schema";
import type { Role } from "@/domain/roles";

export interface RiotAccountRecord {
  id: string;
  ownerType: "player" | "opponent";
  playerId: string | null;
  opponentPlayerId: string | null;
  gameName: string;
  tagLine: string;
  riotId: string;
  platform: string;
  /** user = chosen in the region selector · riot = confirmed by Riot's active-region lookup */
  platformSource: "user" | "riot";
  puuid: string | null;
  puuidResolvedAt: Date | null;
  resolveAttempts: number;
  label: string;
  role: Role | null;
  tier: string | null;
  division: string | null;
  leaguePoints: number | null;
  rankedWins: number | null;
  rankedLosses: number | null;
  rankUpdatedAt: Date | null;
  lastSyncAt: Date | null;
  syncStatus: string;
  syncError: string | null;
  createdAt: Date;
}

export class AccountError extends Error {}

function toRecord(row: typeof riotAccounts.$inferSelect): RiotAccountRecord {
  return {
    id: row.id,
    ownerType: row.ownerType,
    playerId: row.playerId,
    opponentPlayerId: row.opponentPlayerId,
    gameName: row.gameName,
    tagLine: row.tagLine,
    riotId: `${row.gameName}#${row.tagLine}`,
    platform: row.platform,
    platformSource: row.platformSource === "riot" ? "riot" : "user",
    puuid: row.puuid,
    puuidResolvedAt: row.puuidResolvedAt,
    resolveAttempts: row.resolveAttempts,
    label: row.label,
    role: row.role,
    tier: row.tier,
    division: row.division,
    leaguePoints: row.leaguePoints,
    rankedWins: row.rankedWins,
    rankedLosses: row.rankedLosses,
    rankUpdatedAt: row.rankUpdatedAt,
    lastSyncAt: row.lastSyncAt,
    syncStatus: row.syncStatus,
    syncError: row.syncError,
    createdAt: row.createdAt,
  };
}

/**
 * Parses "gameName#tagLine" exactly as typed. Only the single separating '#' is interpreted;
 * all other characters (spaces, Unicode, symbols) are preserved untouched.
 */
export function parseRiotId(input: string): { gameName: string; tagLine: string } | null {
  const trimmed = input.trim();
  const idx = trimmed.lastIndexOf("#");
  if (idx <= 0 || idx === trimmed.length - 1) return null;
  const gameName = trimmed.slice(0, idx).trim();
  const tagLine = trimmed.slice(idx + 1).trim();
  if (!gameName || !tagLine || tagLine.length > 8 || gameName.length > 24) return null;
  return { gameName, tagLine };
}

export async function listAccountsForPlayer(db: Db, playerId: string): Promise<RiotAccountRecord[]> {
  const rows = await db.select().from(riotAccounts).where(eq(riotAccounts.playerId, playerId)).orderBy(asc(riotAccounts.createdAt));
  return rows.map(toRecord);
}

export async function listAccountsForPlayers(db: Db, playerIds: string[]): Promise<RiotAccountRecord[]> {
  if (playerIds.length === 0) return [];
  const rows = await db.select().from(riotAccounts).where(inArray(riotAccounts.playerId, playerIds));
  return rows.map(toRecord);
}

export async function listAccountsForOpponentPlayers(db: Db, opponentPlayerIds: string[]): Promise<RiotAccountRecord[]> {
  if (opponentPlayerIds.length === 0) return [];
  const rows = await db.select().from(riotAccounts).where(inArray(riotAccounts.opponentPlayerId, opponentPlayerIds));
  return rows.map(toRecord);
}

export interface AddAccountInput {
  ownerType: "player" | "opponent";
  playerId?: string | null;
  opponentPlayerId?: string | null;
  riotId: string;
  platform: string;
  label?: string;
  role?: Role | null;
  /** Known PUUID (e.g. from a resolved lookup). */
  puuid?: string | null;
}

/** Adds an account. The same Riot ID / PUUID can only exist once across players and opponents. */
export async function addAccount(db: Db, input: AddAccountInput): Promise<RiotAccountRecord> {
  const parsed = parseRiotId(input.riotId);
  if (!parsed) throw new AccountError("Enter the Riot ID exactly as shown in the client: GameName#TAG.");
  const platform = input.platform.trim().toLowerCase();
  if (!platform) throw new AccountError("Choose a region.");
  const [existing] = await db
    .select()
    .from(riotAccounts)
    .where(or(and(eq(riotAccounts.platform, platform), eq(riotAccounts.gameName, parsed.gameName), eq(riotAccounts.tagLine, parsed.tagLine)), input.puuid ? eq(riotAccounts.puuid, input.puuid) : sql`false`));
  if (existing) {
    const where = existing.ownerType === "player" ? "one of our players" : "an opponent";
    throw new AccountError(`${parsed.gameName}#${parsed.tagLine} is already linked to ${where}.`);
  }
  const [row] = await db
    .insert(riotAccounts)
    .values({
      ownerType: input.ownerType,
      playerId: input.ownerType === "player" ? (input.playerId ?? null) : null,
      opponentPlayerId: input.ownerType === "opponent" ? (input.opponentPlayerId ?? null) : null,
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
      platform,
      puuid: input.puuid ?? null,
      label: input.label ?? "main",
      role: input.role ?? null,
    })
    .returning();
  return toRecord(row!);
}

export async function removeAccount(db: Db, id: string): Promise<void> {
  await db.delete(riotAccounts).where(eq(riotAccounts.id, id));
}

export async function updateAccountLabel(db: Db, id: string, patch: { label?: string; role?: Role | null }): Promise<void> {
  await db.update(riotAccounts).set({ ...patch, updatedAt: new Date() }).where(eq(riotAccounts.id, id));
}

/** Accounts that need syncing, least recently synced first. */
export async function accountsDueForSync(db: Db, options: { limit: number; olderThanMinutes: number; ownerType?: "player" | "opponent" }): Promise<RiotAccountRecord[]> {
  const cutoff = new Date(Date.now() - options.olderThanMinutes * 60_000);
  const rows = await db
    .select()
    .from(riotAccounts)
    .where(and(options.ownerType ? eq(riotAccounts.ownerType, options.ownerType) : undefined, sql`${riotAccounts.label} <> 'demo'`, or(isNull(riotAccounts.lastSyncAt), lt(riotAccounts.lastSyncAt, cutoff))))
    .orderBy(sql`${riotAccounts.lastSyncAt} ASC NULLS FIRST`)
    .limit(options.limit);
  return rows.map(toRecord);
}

/**
 * The batch one account-sync run works through: accounts whose regular refresh is due, plus
 * player accounts still waiting for Riot (pending, unresolved, failed) whose last attempt is a
 * few minutes old, so a Riot outage or a replaced key recovers on the next run instead of after
 * the full refresh interval. Pending accounts come first; one cheap request each, bounded.
 */
export async function accountsForSyncRun(db: Db, options: { limit: number; olderThanMinutes: number; pendingLimit?: number; pendingOlderThanMinutes?: number }): Promise<RiotAccountRecord[]> {
  const [due, pending] = await Promise.all([accountsDueForSync(db, options), listPendingAccounts(db, options.pendingLimit ?? 10)]);
  const retryCutoff = Date.now() - (options.pendingOlderThanMinutes ?? 5) * 60_000;
  const retry = pending.filter((a) => !a.lastSyncAt || a.lastSyncAt.getTime() < retryCutoff);
  const seen = new Set<string>();
  return [...retry, ...due].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
}

/** Linked player accounts that are not synced (never, pending, unresolved, failed), oldest attempt first. */
export async function listPendingAccounts(db: Db, limit = 20): Promise<RiotAccountRecord[]> {
  const rows = await db
    .select()
    .from(riotAccounts)
    .where(and(eq(riotAccounts.ownerType, "player"), sql`${riotAccounts.label} <> 'demo'`, sql`${riotAccounts.syncStatus} <> 'ok'`))
    .orderBy(sql`${riotAccounts.lastSyncAt} ASC NULLS FIRST`)
    .limit(limit);
  return rows.map(toRecord);
}

export interface HistoryRow {
  accountId: string;
  championId: string;
  role: string;
  queueGroup: string;
  patch: string;
  games: number;
  wins: number;
  lastPlayedAt: Date | null;
}

export async function loadHistoryForAccounts(db: Db, accountIds: string[]): Promise<HistoryRow[]> {
  if (accountIds.length === 0) return [];
  return db
    .select({
      accountId: accountChampionHistory.accountId,
      championId: accountChampionHistory.championId,
      role: accountChampionHistory.role,
      queueGroup: accountChampionHistory.queueGroup,
      patch: accountChampionHistory.patch,
      games: accountChampionHistory.games,
      wins: accountChampionHistory.wins,
      lastPlayedAt: accountChampionHistory.lastPlayedAt,
    })
    .from(accountChampionHistory)
    .where(inArray(accountChampionHistory.accountId, accountIds));
}

export async function loadMasteryForAccounts(db: Db, accountIds: string[]) {
  if (accountIds.length === 0) return [];
  return db.select().from(accountMastery).where(inArray(accountMastery.accountId, accountIds));
}

export async function recentAccountsSummary(db: Db, limit = 10) {
  return db.select().from(riotAccounts).orderBy(desc(riotAccounts.lastSyncAt)).limit(limit);
}

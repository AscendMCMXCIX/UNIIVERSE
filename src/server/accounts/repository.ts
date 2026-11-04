import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { accountRows } from "./account-rows";
import type { Db } from "@/server/db/types";
import { players, riotAccounts, type HistoryBackfill } from "@/server/db/schema";
import type { Role } from "@/domain/roles";
import { orderAccounts } from "@/domain/account-order";
import { isRiotPlatform } from "@/domain/riot-platforms";
import { ERASED_IDENTITY_MESSAGE, erasureFilter } from "@/server/privacy/ledger";

export interface RiotAccountRecord {
  id: string;
  ownerType: "player" | "opponent";
  playerId: string | null;
  gameName: string;
  tagLine: string;
  riotId: string;
  platform: string;
  /** user = chosen in the region selector · riot = confirmed by Riot's active-region lookup */
  platformSource: "user" | "riot";
  puuid: string | null;
  puuidResolvedAt: Date | null;
  riotIdCheckedAt: Date | null;
  resolveAttempts: number;
  label: string;
  /** Chosen position among the player's accounts (see domain/account-order); null until reordered. */
  sortOrder: number | null;
  role: Role | null;
  tier: string | null;
  division: string | null;
  leaguePoints: number | null;
  rankedWins: number | null;
  rankedLosses: number | null;
  rankUpdatedAt: Date | null;
  /** solo | flex | null (snapshot older than the queue being recorded). */
  rankQueue: "solo" | "flex" | null;
  lastSyncAt: Date | null;
  syncStatus: string;
  syncError: string | null;
  /** Season history collection state (null until the first sync after it was introduced). */
  historyBackfill: HistoryBackfill | null;
  createdAt: Date;
}

export class AccountError extends Error {}

function toRecord(row: typeof riotAccounts.$inferSelect): RiotAccountRecord {
  return {
    id: row.id,
    ownerType: row.ownerType,
    playerId: row.playerId,
    gameName: row.gameName,
    tagLine: row.tagLine,
    riotId: `${row.gameName}#${row.tagLine}`,
    platform: row.platform,
    platformSource: row.platformSource === "riot" ? "riot" : "user",
    puuid: row.puuid,
    puuidResolvedAt: row.puuidResolvedAt,
    riotIdCheckedAt: row.riotIdCheckedAt ?? null,
    resolveAttempts: row.resolveAttempts,
    label: row.label,
    sortOrder: row.sortOrder ?? null,
    role: row.role,
    tier: row.tier,
    division: row.division,
    leaguePoints: row.leaguePoints,
    rankedWins: row.rankedWins,
    rankedLosses: row.rankedLosses,
    rankUpdatedAt: row.rankUpdatedAt,
    rankQueue: row.rankQueue === "solo" || row.rankQueue === "flex" ? row.rankQueue : null,
    lastSyncAt: row.lastSyncAt,
    syncStatus: row.syncStatus,
    syncError: row.syncError,
    historyBackfill: row.historyBackfill ?? null,
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

/** A player's accounts in their one order: the Main first, then the alternatives as the player arranged them. */
export async function listAccountsForPlayer(db: Db, playerId: string): Promise<RiotAccountRecord[]> {
  const rows = await db.select().from(riotAccounts).where(eq(riotAccounts.playerId, playerId)).orderBy(asc(riotAccounts.createdAt));
  return orderAccounts(rows.map(toRecord));
}

/** Several players' accounts, each player's in their one order. */
export async function listAccountsForPlayers(db: Db, playerIds: string[]): Promise<RiotAccountRecord[]> {
  if (playerIds.length === 0) return [];
  const rows = await db.select().from(riotAccounts).where(inArray(riotAccounts.playerId, playerIds));
  return orderAccounts(rows.map(toRecord));
}

export interface AddAccountInput {
  ownerType: "player" | "opponent";
  playerId?: string | null;
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
  if (!isRiotPlatform(platform)) throw new AccountError("Choose a region from the list.");
  // Never the Riot account of someone whose personal data was erased (server/privacy).
  const erased = await erasureFilter(db);
  if (erased.puuid(input.puuid) || erased.riotId(`${parsed.gameName}#${parsed.tagLine}`)) throw new AccountError(ERASED_IDENTITY_MESSAGE);
  const [existing] = await db
    .select()
    .from(riotAccounts)
    .where(or(and(eq(riotAccounts.platform, platform), eq(riotAccounts.gameName, parsed.gameName), eq(riotAccounts.tagLine, parsed.tagLine)), input.puuid ? eq(riotAccounts.puuid, input.puuid) : sql`false`));
  if (existing) {
    const where = existing.ownerType === "player" ? "one of our players" : "an opponent";
    throw new AccountError(`${parsed.gameName}#${parsed.tagLine} is already linked to ${where}.`);
  }
  // One Main per player: a player's first account is Main, later ones are Alts unless chosen.
  let label = input.label ?? "main";
  let sortOrder: number | null = null;
  if (input.ownerType === "player" && input.playerId) {
    const mine = await db.select({ label: riotAccounts.label, sortOrder: riotAccounts.sortOrder }).from(riotAccounts).where(eq(riotAccounts.playerId, input.playerId));
    if (label === "main" && mine.some((a) => a.label === "main")) label = "alt";
    // A newly linked account goes last among the player's accounts.
    if (mine.some((a) => a.sortOrder !== null)) sortOrder = Math.max(...mine.map((a) => a.sortOrder ?? 0)) + 1;
  }
  const [row] = await db
    .insert(riotAccounts)
    .values({
      ownerType: input.ownerType,
      playerId: input.ownerType === "player" ? (input.playerId ?? null) : null,
      gameName: parsed.gameName,
      tagLine: parsed.tagLine,
      platform,
      puuid: input.puuid ?? null,
      label,
      sortOrder,
      role: input.role ?? null,
    })
    .returning();
  return toRecord(row!);
}

/**
 * Removes an account. When it was the player's Main, their first alternative (in their chosen
 * order) becomes Main (and the profile's Riot ID follows), so a player with accounts always has
 * exactly one Main.
 */
export async function removeAccount(db: Db, id: string): Promise<void> {
  const [gone] = await db.delete(riotAccounts).where(eq(riotAccounts.id, id)).returning({ playerId: riotAccounts.playerId, label: riotAccounts.label });
  if (gone?.playerId && gone.label === "main") {
    const [next] = (await listAccountsForPlayer(db, gone.playerId)).filter((a) => a.label !== "demo");
    if (next) await setMainAccount(db, gone.playerId, next.id);
  }
}

/**
 * Saves the player's order of their accounts. `orderedIds` must be exactly the player's accounts
 * (an account of anyone else, a missing one or a repeat is refused). The Main stays first whatever
 * its position here. Presentation only: no game, statistic or Main choice changes.
 */
export async function reorderAccounts(db: Db, playerId: string, orderedIds: readonly string[]): Promise<RiotAccountRecord[]> {
  const mine = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, playerId));
  const ids = new Set(mine.map((a) => a.id));
  if (orderedIds.length !== ids.size || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !ids.has(id))) {
    throw new AccountError("Your linked accounts changed meanwhile. Reload the page and try again.");
  }
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) await tx.update(riotAccounts).set({ sortOrder: i }).where(and(eq(riotAccounts.id, id), eq(riotAccounts.playerId, playerId)));
  });
  return listAccountsForPlayer(db, playerId);
}

/**
 * Makes one linked account the player's Main (the others become Alts) and keeps the profile's
 * Riot ID in step. Organisation only: every account keeps counting in statistics, nothing about
 * the accounts or their games changes.
 */
export async function setMainAccount(db: Db, playerId: string, accountId: string): Promise<RiotAccountRecord> {
  const [account] = await db.select().from(riotAccounts).where(and(eq(riotAccounts.id, accountId), eq(riotAccounts.playerId, playerId)));
  if (!account) throw new AccountError("That account is not linked to this player.");
  if (account.label === "demo") throw new AccountError("Demo accounts cannot be the main account.");
  const now = new Date();
  await db.transaction(async (tx) => {
    // Demote first: the database allows only one main per player at any moment. The former Main
    // takes the new Main's place among the alternatives (the two swap; the rest keep their order).
    await tx.update(riotAccounts).set({ label: "alt", sortOrder: account.sortOrder, updatedAt: now }).where(and(eq(riotAccounts.playerId, playerId), eq(riotAccounts.label, "main"), sql`${riotAccounts.id} <> ${accountId}`));
    await tx.update(riotAccounts).set({ label: "main", updatedAt: now }).where(eq(riotAccounts.id, accountId));
    await tx.update(players).set({ riotId: `${account.gameName}#${account.tagLine}`, updatedAt: now }).where(eq(players.id, playerId));
  });
  return toRecord({ ...account, label: "main" });
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
    // Accounts still collecting this season's history are due on every run until it is complete.
    .where(and(options.ownerType ? eq(riotAccounts.ownerType, options.ownerType) : undefined, sql`${riotAccounts.label} <> 'demo'`, or(isNull(riotAccounts.lastSyncAt), lt(riotAccounts.lastSyncAt, cutoff), and(eq(riotAccounts.syncStatus, "ok"), eq(riotAccounts.ownerType, "player"), sql`(${riotAccounts.historyBackfill} ->> 'completedAt') IS NULL`))))
    .orderBy(sql`${riotAccounts.lastSyncAt} ASC NULLS FIRST`)
    .limit(options.limit);
  return rows.map(toRecord);
}

/**
 * The batch one account-sync run works through, most urgent first:
 *   1. accounts still waiting for Riot (never synced, pending, unresolved, failed), retried with
 *      back-off: `pendingOlderThanMinutes` after the first failure, doubling per failed attempt up
 *      to six hours, so a Riot outage or a replaced key recovers on its own without hammering;
 *   2. player accounts still collecting this season's history (every run until complete);
 *   3. accounts of active players (team members, or signed in during the last week) whose
 *      last refresh is older than `activeOlderThanMinutes`;
 *   4. everything else (quiet personal-use accounts) older than `olderThanMinutes`.
 * Within a group the longest-waiting account goes first, so nothing starves. Only player accounts
 * are refreshed: accounts stored for opposing players by the removed Draft feature are left alone.
 */
export async function accountsForSyncRun(db: Db, options: { limit: number; olderThanMinutes: number; activeOlderThanMinutes?: number; pendingLimit?: number; pendingOlderThanMinutes?: number }): Promise<RiotAccountRecord[]> {
  const base = Math.max(0, options.pendingOlderThanMinutes ?? 5);
  const active = options.activeOlderThanMinutes ?? options.olderThanMinutes;
  const rows = await db.execute(sql`
    WITH ranked AS (
      SELECT a.id, a.last_sync_at, a.resolve_attempts,
        CASE
          WHEN a.owner_type = 'player' AND a.sync_status NOT IN ('ok', 'demo') THEN 1
          WHEN a.owner_type = 'player' AND a.sync_status = 'ok' AND (a.history_backfill ->> 'completedAt') IS NULL THEN 2
          WHEN a.owner_type = 'player' AND (p.team_member OR EXISTS (
            SELECT 1 FROM users u JOIN sessions s ON s.user_id = u.id WHERE u.player_id = a.player_id AND s.last_seen_at > now() - interval '7 days')) THEN 3
          ELSE 4
        END AS priority
      FROM riot_accounts a LEFT JOIN players p ON p.id = a.player_id
      WHERE a.owner_type = 'player' AND a.label <> 'demo' AND a.sync_status <> 'demo'
    )
    SELECT id, priority FROM ranked
    WHERE (priority = 1 AND (last_sync_at IS NULL OR last_sync_at < now() - make_interval(mins => ${base}::int * power(2, LEAST(GREATEST(resolve_attempts - 1, 0), 6))::int)
                                  OR last_sync_at < now() - interval '6 hours'))
       OR (priority = 2 AND (last_sync_at IS NULL OR last_sync_at < now() - interval '2 minutes'))
       OR (priority = 3 AND (last_sync_at IS NULL OR last_sync_at < now() - make_interval(mins => ${active}::int)))
       OR (priority = 4 AND (last_sync_at IS NULL OR last_sync_at < now() - make_interval(mins => ${options.olderThanMinutes}::int)))
    ORDER BY priority, last_sync_at ASC NULLS FIRST
    LIMIT ${options.limit + (options.pendingLimit ?? 10)}`);
  const list = ((rows as { rows?: Array<{ id: string; priority: number }> }).rows ?? (rows as unknown as Array<{ id: string; priority: number }>)).map((r) => ({ id: r.id, priority: Number(r.priority) }));
  // At most `pendingLimit` retries per run, then up to `limit` regular refreshes.
  const retries = list.filter((r) => r.priority === 1).slice(0, options.pendingLimit ?? 10);
  const regular = list.filter((r) => r.priority > 1).slice(0, options.limit);
  const ids = [...retries, ...regular].map((r) => r.id);
  if (ids.length === 0) return [];
  const records = await db.select().from(riotAccounts).where(inArray(riotAccounts.id, ids));
  const byId = new Map(records.map((r) => [r.id, toRecord(r)]));
  return ids.map((id) => byId.get(id)).filter((r): r is RiotAccountRecord => !!r);
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

/** Every champion-history row of these accounts (kept per instance until it changes; account-rows.ts). */
export async function loadHistoryForAccounts(db: Db, accountIds: string[]): Promise<HistoryRow[]> {
  return accountRows(db, "history", accountIds);
}

/** Every mastery row of these accounts (kept per instance until it changes; account-rows.ts). */
export async function loadMasteryForAccounts(db: Db, accountIds: string[]) {
  return accountRows(db, "mastery", accountIds);
}

export async function recentAccountsSummary(db: Db, limit = 10) {
  return db.select().from(riotAccounts).orderBy(desc(riotAccounts.lastSyncAt)).limit(limit);
}

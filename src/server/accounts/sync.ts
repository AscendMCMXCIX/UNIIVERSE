import { matchesWithoutDetails, storeMatchDetail, storeMatchUnavailable } from "./match-details";
import { summariseMatches } from "./match-summary";
import { and, desc, eq, inArray, isNotNull, isNull, like, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountChampionHistory, accountMastery, accountMatches, champions, patches, players, riotAccounts } from "@/server/db/schema";
import { RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import type { RiotMatch, RiotParticipant } from "@/server/riot/api/schemas";
import { patchFromVersion } from "@/domain/patch";
import { normaliseRiotRegionAnswer, platformLabel } from "@/domain/riot-platforms";
import { RIOT_POSITION_TO_ROLE } from "@/domain/roles";
import { FIRST_SEASON, seasonForDate, seasonOfPatch, seasonStartUnix } from "@/domain/season";
import type { HistoryBackfill } from "@/server/db/schema";
import { recordRiotOutcome } from "@/server/riot/credential";
import type { RiotAccountRecord } from "./repository";
import { recordRankSnapshots, storedRankFrom } from "./rank-history";
import { erasureFilter, type ErasureFilter } from "@/server/privacy/ledger";

/**
 * Riot queue ids UNIIVERSE collects for our players, all on Summoner's Rift:
 *   420 Ranked Solo/Duo · 440 Ranked Flex · 400 Normal Draft · 430 Normal Blind (retired, kept for
 *   older seasons) · 480 Swiftplay · 490 Normal Quickplay · 700 Clash.
 * ARAM, Arena and event modes are left out: different map or rules, no draft evidence.
 */
export const SYNC_QUEUE_IDS = [420, 440, 400, 430, 480, 490, 700] as const;
export const NORMAL_QUEUE_IDS: readonly number[] = [400, 430, 480, 490];

export function queueGroupFor(queueId: number): "solo" | "flex" | "normal" | "other" {
  if (queueId === 420) return "solo";
  if (queueId === 440) return "flex";
  if (NORMAL_QUEUE_IDS.includes(queueId)) return "normal";
  return "other";
}

export interface AccountSyncResult {
  accountId: string;
  resolved: boolean;
  /** Platform in use after the run (Riot's answer when available, else the player's selection). */
  platform: string;
  platformSource: "user" | "riot";
  matchesFetched: number;
  matchesFolded: number;
  masteryRows: number;
  rankUpdated: boolean;
  /** Plain-language problem, when the run did not complete. */
  error?: string;
  /** Stored sync status after the run. */
  status: "ok" | "pending" | "unresolved" | "failed";
  /** Season history collection after the run. */
  history?: { season: number; complete: boolean; queuesDone: number; queues: number };
}

export interface AccountSyncOptions {
  /** Season to collect (game-version major, 16 = 2026); defaults to the current calendar year. */
  season?: number;
  /** Match details fetched per account per run (new games first, then older season games). */
  maxMatchesPerRun?: number;
  outOfTime?: () => boolean;
  log?: (m: string) => void;
  /** Queue ids collected (default SYNC_QUEUE_IDS). */
  queueIds?: readonly number[];
  /** Re-fetch per-game performance for games stored without it (default true). */
  performanceBackfill?: boolean;
  /** Fill in full match records for the match history (default on). */
  detailsBackfill?: boolean;
  /** Clock, for tests. */
  now?: () => Date;
  /** Collect the previous season once the current one is complete (default true). */
  previousSeason?: boolean;
  /** Re-read the Riot ID by PUUID when it has not been checked for a day (default true). */
  refreshRiotId?: boolean;
  /** Ask about queues with no game this season even when one was asked recently (a manual refresh: the first game of a queue shows at once). */
  recheckEmptyQueues?: boolean;
}

/**
 * Plain-language cause of a failed account request. Teammates read these on their profile, so no
 * HTTP codes or routes: what happened and whether anything is expected of them.
 */
export function friendlyAccountError(err: unknown, context: "resolve" | "sync" = "sync"): { message: string; status: "pending" | "unresolved" | "failed" } {
  if (err instanceof RiotApiError) {
    switch (err.status) {
      case 404:
        return context === "resolve"
          ? { message: "Riot could not find this Riot ID. Check the spelling and the #TAG exactly as shown in the League client, then save it again.", status: "unresolved" }
          : { message: "Riot has no League data for this account on the selected server yet. It is checked again on the next sync.", status: "pending" };
      case 401:
      case 403:
        // Teammates never see infrastructure detail; the owner sees the credential status in Settings → Data health.
        return { message: "Riot data is temporarily unavailable. Your Riot ID has been saved and will sync automatically when the service is available.", status: "pending" };
      case 429:
        return { message: "Riot is rate-limiting requests right now. Your account is saved and retried automatically.", status: "pending" };
      case 400:
        return { message: "Riot did not accept the request for this account. It is retried automatically; if this persists, remove and re-add the account.", status: "pending" };
      case 0:
        return { message: "Riot's servers did not answer. Your account is saved and retried automatically.", status: "pending" };
      default:
        return err.status >= 500 ? { message: "Riot's servers are having trouble. Your account is saved and retried automatically.", status: "pending" } : { message: "Riot answered in an unexpected way. Your account is saved and retried automatically.", status: "pending" };
    }
  }
  const text = (err as Error)?.message ?? String(err);
  if (/Unexpected response shape/i.test(text)) return { message: "Riot answered in an unexpected format. Your account is saved and retried automatically.", status: "pending" };
  return { message: "Something went wrong while talking to Riot. Your account is saved and retried automatically.", status: "pending" };
}

/**
 * How a log line names a linked account: by a short piece of its UNIIVERSE id, never its Riot ID.
 * Job logs are kept with the job runs and printed by the Data jobs workflow, so they name nobody;
 * an administrator finds the account under Admin Mode → Data & Integrations.
 */
export const accountRef = (account: Pick<RiotAccountRecord, "id">): string => `account ${account.id.slice(0, 8)}`;

/** How often a linked account's Riot ID is re-read from Riot by PUUID. */
const RIOT_ID_RECHECK_MS = 20 * 3600_000;

/**
 * Case A of a Riot ID change: the player renamed their account through Riot. The PUUID is the
 * identity, so the stored name simply follows Riot; games, mastery, statistics and ownership are
 * untouched. A failure here never fails the sync (the old name stays until the next check).
 */
async function refreshRiotId(db: Db, client: RiotApiClient, account: RiotAccountRecord, puuid: string, platform: string, log: (line: string) => void): Promise<void> {
  try {
    const acc = await client.accountByPuuid(platform, puuid);
    const gameName = acc.gameName ?? account.gameName;
    const tagLine = acc.tagLine ?? account.tagLine;
    const renamed = gameName !== account.gameName || tagLine !== account.tagLine;
    await db.update(riotAccounts).set({ ...(renamed ? { gameName, tagLine } : {}), riotIdCheckedAt: new Date(), updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
    if (renamed) {
      log(`${accountRef(account)}: renamed in Riot; data kept`);
      if (account.playerId) {
        await db
          .update(players)
          .set({ riotId: `${gameName}#${tagLine}`, updatedAt: new Date() })
          .where(and(eq(players.id, account.playerId), sql`lower(${players.riotId}) = lower(${`${account.gameName}#${account.tagLine}`})`));
      }
    }
  } catch (err) {
    if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
    log(`${accountRef(account)}: Riot ID check unavailable (${(err as Error).message}); keeping the stored name`);
  }
}

/**
 * Incrementally synchronises one linked Riot account:
 *   1. resolve the PUUID from the Riot ID when unknown (ACCOUNT-V1), adopt Riot's spelling,
 *   2. ask Riot which server the account actively plays on; fall back to the player's selection,
 *   3. refresh rank + champion mastery,
 *   4. fetch new match ids since the account's cursor, skip ones already folded,
 *   5. fold each match's participant row for this PUUID into champion history.
 * Everything is idempotent (account_matches is the dedupe ledger) and budget-aware. Riot being
 * unavailable never throws: the account is marked pending and retried by the next job run.
 */
export async function syncAccount(db: Db, client: RiotApiClient, account: RiotAccountRecord, options: AccountSyncOptions = {}): Promise<AccountSyncResult> {
  const log = options.log ?? (() => {});
  let platform = account.platform;
  let platformSource: "user" | "riot" = account.platformSource === "riot" ? "riot" : "user";
  const result: AccountSyncResult = { accountId: account.id, resolved: !!account.puuid, platform, platformSource, matchesFetched: 0, matchesFolded: 0, masteryRows: 0, rankUpdated: false, status: "ok" };
  let puuid = account.puuid;
  const fail = async (err: unknown, context: "resolve" | "sync"): Promise<AccountSyncResult> => {
    const f = friendlyAccountError(err, context);
    await db
      .update(riotAccounts)
      .set({ lastSyncAt: new Date(), syncStatus: f.status, syncError: f.message, resolveAttempts: sql`${riotAccounts.resolveAttempts} + 1`, updatedAt: new Date() })
      .where(eq(riotAccounts.id, account.id));
    // A 404 is an answer about this Riot ID, not about the key; everything else says something about the credential.
    if (!(err instanceof RiotApiError && err.status === 404)) await recordRiotOutcome(db, client, { ok: false, error: err });
    else await recordRiotOutcome(db, client, { ok: true });
    log(`${accountRef(account)}: ${f.message} (${(err as Error)?.message ?? err})`);
    return { ...result, error: f.message, status: f.status };
  };

  // A Riot account whose owner's personal data was erased is never read again (it can only be
  // here in a database restored from before the erasure and not reconciled yet).
  const erased = await erasureFilter(db);
  const refuseErased = async (): Promise<AccountSyncResult> => {
    await db.update(riotAccounts).set({ syncStatus: "failed", syncError: ERASED_ACCOUNT_MESSAGE, lastSyncAt: new Date(), updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
    log(`${accountRef(account)}: not synced (an erasure applies to it)`);
    return { ...result, error: ERASED_ACCOUNT_MESSAGE, status: "failed" };
  };
  if (erased.puuid(puuid) || erased.riotId(`${account.gameName}#${account.tagLine}`)) return refuseErased();

  try {
    if (!puuid) {
      let acc;
      try {
        acc = await client.accountByRiotId(platform, account.gameName, account.tagLine);
      } catch (err) {
        return fail(err, "resolve");
      }
      puuid = acc.puuid;
      if (erased.puuid(puuid)) return refuseErased();
      // Another linked account may already own this PUUID (same player, renamed Riot ID).
      const [clash] = await db.select({ id: riotAccounts.id, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine, playerId: riotAccounts.playerId }).from(riotAccounts).where(and(eq(riotAccounts.puuid, puuid), sql`${riotAccounts.id} <> ${account.id}`));
      if (clash) {
        const message = clash.playerId === account.playerId ? `This is the same Riot account as ${clash.gameName}#${clash.tagLine}, which is already linked (renamed Riot ID). Remove one of the two; games are only ever counted once.` : `This Riot account is already linked to another player as ${clash.gameName}#${clash.tagLine}. Ask the owner to move it.`;
        await db.update(riotAccounts).set({ syncStatus: "failed", syncError: message, lastSyncAt: new Date(), updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
        return { ...result, error: message, status: "failed" };
      }
      // Adopt Riot's canonical spelling unless another stored account already uses it.
      let gameName = acc.gameName ?? account.gameName;
      let tagLine = acc.tagLine ?? account.tagLine;
      const [nameClash] = await db
        .select({ id: riotAccounts.id })
        .from(riotAccounts)
        .where(and(eq(riotAccounts.platform, platform), eq(riotAccounts.gameName, gameName), eq(riotAccounts.tagLine, tagLine), sql`${riotAccounts.id} <> ${account.id}`));
      if (nameClash) {
        gameName = account.gameName;
        tagLine = account.tagLine;
      }
      await db.update(riotAccounts).set({ puuid, gameName, tagLine, puuidResolvedAt: new Date(), resolveAttempts: 0, updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
      if (account.label === "main" && account.playerId && (gameName !== account.gameName || tagLine !== account.tagLine)) {
        await db.update(players).set({ riotId: `${gameName}#${tagLine}`, updatedAt: new Date() }).where(eq(players.id, account.playerId));
      }
      result.resolved = true;
    } else if (options.refreshRiotId !== false && (!account.riotIdCheckedAt || (options.now?.() ?? new Date()).getTime() - account.riotIdCheckedAt.getTime() > RIOT_ID_RECHECK_MS)) {
      await refreshRiotId(db, client, account, puuid, platform, log);
    }

    // Which server does the account actually play on? Riot knows; the selector was a hint.
    if (platformSource !== "riot") {
      try {
        const answer = normaliseRiotRegionAnswer(await client.activePlatformByPuuid(platform, puuid));
        if (answer) {
          if (answer !== platform) log(`${accountRef(account)}: Riot says ${platformLabel(answer)}, not ${platformLabel(platform)}; following Riot`);
          platform = answer;
          platformSource = "riot";
          await db.update(riotAccounts).set({ platform, platformSource: "riot", updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
        } else {
          log(`${accountRef(account)}: Riot did not report an active server; keeping ${platformLabel(platform)}`);
        }
      } catch (err) {
        if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
        log(`${accountRef(account)}: active-server lookup unavailable (${(err as Error).message}); keeping ${platformLabel(platform)}`);
      }
    }
    result.platform = platform;
    result.platformSource = platformSource;

    // Rank snapshot (solo queue preferred, flex as fallback) and mastery.
    try {
      const entries = await client.leagueEntriesByPuuid(platform, puuid);
      // Ranked progress: one snapshot per queue when it changed (the same answer, no extra request).
      await recordRankSnapshots(db, account.id, entries);
      // The stored rank: Solo/Duo first, Flex as fallback; Riot reporting neither (a season reset)
      // clears it, matching the unranked snapshot just recorded. Never ranked: nothing to write.
      const stored = storedRankFrom(entries);
      if (stored.tier || account.tier) {
        await db.update(riotAccounts).set(stored).where(eq(riotAccounts.id, account.id));
        result.rankUpdated = true;
      }
    } catch (err) {
      if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
      log(`${accountRef(account)}: rank lookup failed: ${(err as Error).message}`);
    }
    try {
      const masteries = await client.championMasteries(platform, puuid);
      const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
      const rows = masteries
        .map((m) => ({ accountId: account.id, championId: keyToId.get(m.championId), points: m.championPoints, level: m.championLevel, lastPlayedAt: m.lastPlayTime ? new Date(m.lastPlayTime) : null }))
        .filter((r): r is typeof r & { championId: string } => !!r.championId);
      for (let i = 0; i < rows.length; i += 200) {
        await db
          .insert(accountMastery)
          .values(rows.slice(i, i + 200))
          .onConflictDoUpdate({ target: [accountMastery.accountId, accountMastery.championId], set: { points: sql`excluded.points`, level: sql`excluded.level`, lastPlayedAt: sql`excluded.last_played_at` } });
      }
      result.masteryRows = rows.length;
    } catch (err) {
      if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) throw err;
      log(`${accountRef(account)}: mastery lookup failed: ${(err as Error).message}`);
    }

    // Match history: every supported queue, the whole current season, collected incrementally.
    const history = await collectSeasonHistory(db, client, { ...account, puuid, platform }, options, result, log);
    await db.update(riotAccounts).set({ lastSyncAt: new Date(), syncStatus: "ok", syncError: null, resolveAttempts: 0, syncCursor: Math.floor(Date.now() / 1000), historyBackfill: history, updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
    result.history = summariseBackfill(history);
    await recordRiotOutcome(db, client, { ok: true });
    return result;
  } catch (err) {
    if (err instanceof RiotApiError && err.status === 400 && account.puuid) {
      // Riot could not decode the stored player id. Ids are encrypted per API key, so this is what
      // a key change looks like; forget the id and resolve it again from the Riot ID next time.
      const message = "The server's Riot API key changed, so this account is being re-verified from its Riot ID. Nothing to do; it happens automatically.";
      await db.update(riotAccounts).set({ puuid: null, puuidResolvedAt: null, platformSource: "user", lastSyncAt: new Date(), syncStatus: "pending", syncError: message, updatedAt: new Date() }).where(eq(riotAccounts.id, account.id));
      return { ...result, resolved: false, error: message, status: "pending" };
    }
    return fail(err, "sync");
  }
}

export const ERASED_ACCOUNT_MESSAGE = "This Riot account belongs to someone whose personal data was erased from UNIIVERSE, so it is not read. An administrator can reconcile erasures under Admin Mode → Users & Permissions → Personal data.";

/** The season of the current patch (falls back to the calendar year without real static data). */
export async function currentSeason(db: Db, now: Date = new Date()): Promise<number> {
  const [row] = await db.select({ patch: patches.id }).from(patches).where(eq(patches.isCurrent, true)).limit(1);
  const fromPatch = seasonOfPatch(row?.patch);
  return fromPatch !== null && fromPatch >= 14 ? fromPatch : seasonForDate(now);
}

/**
 * Where a season's match lists start (unix seconds): 1 January of its year, or earlier when
 * UNIIVERSE saw the season's first patch before then. Games are told apart by patch, so an early
 * start costs only a few listed games of the season before, and a season Riot opens in December
 * is collected from its first day. Never later than 1 January.
 */
export async function seasonListStart(db: Db, season: number): Promise<number> {
  const [row] = await db.select({ first: sql<string | Date | null>`min(${patches.firstSeenAt})` }).from(patches).where(like(patches.id, `${season}.%`));
  const seen = row?.first ? Math.floor(new Date(row.first).getTime() / 1000) : Number.POSITIVE_INFINITY;
  return Math.min(seasonStartUnix(season), seen);
}

/** Queues with no game this season are re-checked at most this often (one list request each). */
const EMPTY_QUEUE_RECHECK_MS = 12 * 3_600_000;
const PAGE = 100;

export function summariseBackfill(state: HistoryBackfill): { season: number; complete: boolean; queuesDone: number; queues: number } {
  const queues = Object.values(state.queues);
  return { season: state.season, complete: !!state.completedAt, queuesDone: queues.filter((q) => q.done).length, queues: queues.length };
}

/**
 * Collects the account's matches for the season, queue by queue:
 *   1. the newest page of every queue (new games since the last run), then
 *   2. one page further back per unfinished queue, resuming where the previous run stopped.
 * Match details are fetched only for ids not in the ledger and only up to the per-run limit, so a
 * long season fills in over several runs while new games always come first. Ids already stored
 * cost nothing; queues without a game this season are re-checked twice a day. No listed game is
 * passed over for good: a queue whose newest page a run left unfinished is read again from the
 * top (phase 1 below).
 */
async function collectSeasonHistory(db: Db, client: RiotApiClient, account: RiotAccountRecord & { puuid: string }, options: AccountSyncOptions, result: AccountSyncResult, log: (m: string) => void): Promise<HistoryBackfill> {
  const now = options.now?.() ?? new Date();
  const season = options.season ?? (await currentSeason(db, now));
  const queueIds = options.queueIds ?? SYNC_QUEUE_IDS;
  const limit = options.maxMatchesPerRun ?? 80;
  const [row] = await db.select({ state: riotAccounts.historyBackfill }).from(riotAccounts).where(eq(riotAccounts.id, account.id));
  const previous = row?.state ?? null;
  const state: HistoryBackfill = previous && previous.season === season ? { ...previous, queues: { ...previous.queues } } : { season, queues: {}, startedAt: now.toISOString(), completedAt: null };
  const startTime = await seasonListStart(db, season);
  const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
  const erased = await erasureFilter(db);
  let fetched = 0;
  const budgetLeft = () => fetched < limit && !options.outOfTime?.();

  // Reads one page of a queue's season list and stores every game on it that is not stored yet.
  // `complete` says whether the whole page is now stored: false when the run's limit, the time
  // budget or a failed request stopped it, at `stoppedAt` (the place on the page of the first game
  // not got to).
  const readPage = async (queueId: number, start: number, window: { startTime: number; endTime?: number } = { startTime }): Promise<{ ids: number; fresh: number; complete: boolean; stoppedAt: number }> => {
    const ids = await client.matchIdsByPuuid(account.platform, account.puuid, { queue: queueId, startTime: window.startTime, endTime: window.endTime, count: PAGE, start });
    if (ids.length === 0) return { ids: 0, fresh: 0, complete: true, stoppedAt: 0 };
    const known = new Set((await db.select({ matchId: accountMatches.matchId }).from(accountMatches).where(and(eq(accountMatches.accountId, account.id), inArray(accountMatches.matchId, ids)))).map((r) => r.matchId));
    const fresh = ids.filter((id) => !known.has(id)).length;
    const stop = (i: number) => ({ ids: ids.length, fresh, complete: false, stoppedAt: i });
    for (let i = 0; i < ids.length; i++) {
      const matchId = ids[i]!;
      if (known.has(matchId)) continue;
      if (!budgetLeft()) return stop(i);
      fetched += 1;
      let match: RiotMatch;
      try {
        match = await client.match(account.platform, matchId);
      } catch (err) {
        if (err instanceof RiotApiError && (err.status === 403 || err.status === 401)) throw err;
        log(`match ${matchId} failed: ${(err as Error).message}`);
        return stop(i);
      }
      result.matchesFetched += 1;
      if (await foldMatch(db, account, match, keyToId, queueIds, erased)) result.matchesFolded += 1;
    }
    return { ids: ids.length, fresh, complete: true, stoppedAt: ids.length };
  };

  // 1. New games first, every queue.
  for (const queueId of queueIds) {
    if (!budgetLeft()) break;
    const q = state.queues[String(queueId)] ?? { offset: 0, done: false };
    const emptySoFar = q.done && q.offset === 0;
    if (emptySoFar && !options.recheckEmptyQueues && q.checkedAt && now.getTime() - new Date(q.checkedAt).getTime() < EMPTY_QUEUE_RECHECK_MS) continue;
    const page = await readPage(queueId, 0);
    q.checkedAt = now.toISOString();
    if (page.complete) {
      if (page.ids === PAGE && page.fresh === PAGE && q.offset > 0) {
        // A full page of new games (a long gap between runs): older new games may sit beyond
        // it, so scan back from here again; stored ids along the way cost nothing.
        q.offset = PAGE;
        q.done = false;
      } else {
        q.offset = Math.max(q.offset, page.ids);
        if (page.ids < PAGE) q.done = true;
        else if (emptySoFar) q.done = false;
      }
    } else if (page.stoppedAt > 0) {
      // The run stopped partway down the newest page (its limit, the time budget or a failed
      // request): games below the ones it stored are still to fetch. New games keep arriving at
      // the top, so before a later run finishes this page they can push those games off it, into
      // the part of the list the offset says was read, where phase 2 never looks (a long gap: more
      // new games than a run fetches). So the queue is read again from the top: once its newest
      // page is complete, phase 2 goes through the older pages again (one list request per hundred
      // games; ids already stored cost nothing). Stopped at the first game, nothing has to move:
      // the games still to fetch are the newest, and a later run finds them at the top.
      q.offset = 0;
      q.done = false;
    }
    state.queues[String(queueId)] = q;
  }
  // 2. Older games of this season, resuming each unfinished queue.
  for (const queueId of queueIds) {
    const q = state.queues[String(queueId)];
    if (!q || q.done || q.offset === 0) continue;
    while (budgetLeft()) {
      const page = await readPage(queueId, q.offset);
      if (!page.complete) break;
      q.offset += page.ids;
      if (page.ids < PAGE) {
        q.done = true;
        break;
      }
    }
  }
  const allDone = queueIds.every((id) => state.queues[String(id)]?.done);
  state.completedAt = allDone ? (state.completedAt ?? now.toISOString()) : null;
  // 2b. Performance details (KDA, CS, damage, vision) for games stored before these were
  //     recorded: once this season's list is complete, newest first, within the run's budget.
  //     One request per game, once; a game Riot no longer returns keeps its nulls.
  if (allDone && budgetLeft() && options.performanceBackfill !== false) {
    const missing = await db
      .select({ matchId: accountMatches.matchId })
      .from(accountMatches)
      .where(and(eq(accountMatches.accountId, account.id), isNotNull(accountMatches.championId), isNull(accountMatches.kills)))
      .orderBy(desc(accountMatches.gameCreation))
      .limit(Math.max(0, limit - fetched));
    for (const { matchId } of missing) {
      if (!budgetLeft()) break;
      fetched += 1;
      try {
        const match = await client.match(account.platform, matchId);
        const me = match.info.participants.find((p) => p.puuid === account.puuid);
        await db.update(accountMatches).set(me ? performanceOf(me) : DETAILS_UNAVAILABLE).where(and(eq(accountMatches.accountId, account.id), eq(accountMatches.matchId, matchId)));
        if (me) await storeMatchDetail(db, account.platform, match, keyToId);
        result.matchesFetched += 1;
      } catch (err) {
        if (err instanceof RiotApiError && (err.status === 403 || err.status === 401)) throw err;
        if (err instanceof RiotApiError && err.status === 404) {
          // Riot no longer serves this game: remember that so it is not asked for again.
          await db.update(accountMatches).set(DETAILS_UNAVAILABLE).where(and(eq(accountMatches.accountId, account.id), eq(accountMatches.matchId, matchId)));
          continue;
        }
        log(`match ${matchId} details failed: ${(err as Error).message}`);
        break;
      }
    }
  }
  // 2c. Full match records (both teams, items, runes) for the match history, for games stored
  //     before these were kept: newest first, within what is left of the run's budget, once per
  //     match (a game shared with another linked account is fetched once).
  if (budgetLeft() && options.detailsBackfill !== false) {
    for (const matchId of await matchesWithoutDetails(db, account.id, limit - fetched)) {
      if (!budgetLeft()) break;
      fetched += 1;
      try {
        const match = await client.match(account.platform, matchId);
        await storeMatchDetail(db, account.platform, match, keyToId);
        result.matchesFetched += 1;
      } catch (err) {
        if (err instanceof RiotApiError && (err.status === 403 || err.status === 401)) throw err;
        if (err instanceof RiotApiError && err.status === 404) {
          // Riot no longer serves the full game: remember that (the stored statistics stay as they are).
          await storeMatchUnavailable(db, account.id, matchId);
          continue;
        }
        log(`match ${matchId} record failed: ${(err as Error).message}`);
        break;
      }
    }
  }
  // 3. The previous season, oldest priority: only once this season is complete, with what is
  //    left of the run's budget, page by page from its newest game backwards. A season change
  //    starts it afresh (ids already stored cost nothing to list again). Never a season before
  //    the first one offered (domain/season): its games could not be shown, so they are not
  //    fetched.
  if (allDone && budgetLeft() && options.previousSeason !== false && season - 1 >= FIRST_SEASON) {
    const prevSeason = season - 1;
    const prev = state.previous && state.previous.season === prevSeason ? { ...state.previous, queues: { ...state.previous.queues } } : { season: prevSeason, queues: {}, completedAt: null };
    const window = { startTime: await seasonListStart(db, prevSeason), endTime: startTime };
    for (const queueId of queueIds) {
      const q = prev.queues[String(queueId)] ?? { offset: 0, done: false };
      while (!q.done && budgetLeft()) {
        const page = await readPage(queueId, q.offset, window);
        if (!page.complete) break;
        q.offset += page.ids;
        if (page.ids < PAGE) q.done = true;
      }
      prev.queues[String(queueId)] = q;
      if (!budgetLeft()) break;
    }
    prev.completedAt = queueIds.every((id) => prev.queues[String(id)]?.done) ? (prev.completedAt ?? now.toISOString()) : null;
    state.previous = prev;
  }
  const games = Object.entries(state.queues).map(([id, q]) => `${id}:${q.offset}${q.done ? "" : "+"}`).join(" ");
  log(`${accountRef(account)}: season ${season} history ${allDone ? "complete" : "in progress"} (${games}); fetched ${fetched}`);
  return state;
}

/**
 * Stores one match for one account: the ledger row (dedupe key and per-game facts for season
 * statistics) and the champion history bucket it adds to, in one transaction. Returns false when
 * the match was already stored or does not include this account.
 */
async function foldMatch(db: Db, account: RiotAccountRecord & { puuid: string }, match: RiotMatch, keyToId: Map<number, string>, queueIds: readonly number[], erased: ErasureFilter): Promise<boolean> {
  const matchId = match.metadata.matchId;
  const me = match.info.participants.find((p) => p.puuid === account.puuid);
  const championId = me ? keyToId.get(me.championId) : undefined;
  if (!me || !championId || match.info.gameDuration < 300 || !queueIds.includes(match.info.queueId)) {
    // Remakes and games without this account are remembered so they are never fetched again.
    await db.insert(accountMatches).values({ accountId: account.id, matchId, gameCreation: match.info.gameCreation, queueId: match.info.queueId }).onConflictDoNothing();
    return false;
  }
  const patch = patchFromVersion(match.info.gameVersion) ?? "unknown";
  const role = RIOT_POSITION_TO_ROLE[me.teamPosition] ?? "UNKNOWN";
  const playedAt = new Date(match.info.gameCreation);
  // The lane opponent: the enemy in the same position, when positions are known. An opponent whose
  // personal data was erased is left unknown (their champion is about them).
  const opponent = me.teamPosition ? match.info.participants.find((p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition) : undefined;
  const opponentErased = !!opponent && (erased.puuid(opponent.puuid) || erased.riotId(opponent.riotIdGameName && opponent.riotIdTagline ? `${opponent.riotIdGameName}#${opponent.riotIdTagline}` : null));
  const enemyChampionId = opponent && !opponentErased ? (keyToId.get(opponent.championId) ?? null) : null;
  // The full match (both teams, items, runes) for the personal match history: same fetch, no extra request.
  await storeMatchDetail(db, account.platform, match, keyToId);
  let folded = false;
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(accountMatches)
      .values({ accountId: account.id, matchId, gameCreation: match.info.gameCreation, queueId: match.info.queueId, championId, role, win: me.win, enemyChampionId, patch, gameDuration: match.info.gameDuration, ...performanceOf(me) })
      .onConflictDoNothing()
      .returning({ id: accountMatches.matchId });
    if (inserted.length === 0) return;
    await tx
      .insert(accountChampionHistory)
      .values({ accountId: account.id, championId, role, queueGroup: queueGroupFor(match.info.queueId), patch, games: 1, wins: me.win ? 1 : 0, kills: me.kills, deaths: me.deaths, assists: me.assists, lastPlayedAt: playedAt })
      .onConflictDoUpdate({
        target: [accountChampionHistory.accountId, accountChampionHistory.championId, accountChampionHistory.role, accountChampionHistory.queueGroup, accountChampionHistory.patch],
        set: {
          games: sql`${accountChampionHistory.games} + 1`,
          wins: sql`${accountChampionHistory.wins} + ${me.win ? 1 : 0}`,
          kills: sql`${accountChampionHistory.kills} + ${me.kills}`,
          deaths: sql`${accountChampionHistory.deaths} + ${me.deaths}`,
          assists: sql`${accountChampionHistory.assists} + ${me.assists}`,
          lastPlayedAt: sql`GREATEST(${accountChampionHistory.lastPlayedAt}, ${playedAt.toISOString()}::timestamptz)`,
        },
      });
    folded = true;
  });
  // The details were stored before this game's row existed: copy its figures now.
  if (folded) await summariseMatches(db, { accountIds: [account.id], matchIds: [matchId], maxBatches: 1 });
  return folded;
}

/**
 * Marker for a stored game whose details Riot no longer returns: kills = -1 (never a real value).
 * Averages only use games with kills >= 0, so the game counts for record and win rate only.
 */
export const DETAILS_UNAVAILABLE = { kills: -1, deaths: null, assists: null, cs: null, damage: null, visionScore: null } as const;

/** Per-game performance from one participant row; a field Riot did not send stays null (never invented). */
export function performanceOf(p: RiotParticipant): { kills: number; deaths: number; assists: number; cs: number | null; damage: number | null; visionScore: number | null } {
  const cs = p.totalMinionsKilled === undefined && p.neutralMinionsKilled === undefined ? null : (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0);
  return { kills: p.kills, deaths: p.deaths, assists: p.assists, cs, damage: p.totalDamageDealtToChampions ?? null, visionScore: p.visionScore ?? null };
}

/** True when a stored game belongs to the given season (by its patch). */
export function inSeason(patch: string | null | undefined, season: number): boolean {
  return seasonOfPatch(patch) === season;
}

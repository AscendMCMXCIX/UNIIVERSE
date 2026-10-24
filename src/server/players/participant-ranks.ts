import { desc, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { lastKnownRanks, rankSnapshots, riotAccounts } from "@/server/db/schema";
import { createRiotClient, RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import type { LeagueEntry } from "@/server/riot/api/schemas";
import { browserTestRiot, browserTestRiotClient } from "@/server/riot/browser-test";
import { erasureFilter } from "@/server/privacy/ledger";
import { isRiotPlatform } from "@/domain/riot-platforms";
import { RANK_FRESH_DAYS, type QueueRank, type RankReading } from "@/domain/known-rank";

/*
  The ranks shown beside a match's players (domain/known-rank.ts for what is shown).

  Stored first: a linked account's last sync (riot_accounts and its rank_snapshots, both queues)
  and last_known_ranks (one row per other player). When a member opens a match, the players whose
  newest reading is missing or older than RANK_FRESH_DAYS are looked up with LEAGUE-V4
  (/lol/league/v4/entries/by-puuid, one request each, on the match's server) and the answer is kept
  in last_known_ranks, both queues, "UNRANKED" where Riot lists no entry. Nothing else asks: no
  list, page or job looks anyone up, and no player is looked up again within three days.

  Limits, so the rank checks never crowd out account sync or overrun the key:
  - only the players of the one match being opened (ten at most), only when their reading is stale;
  - RANK_LOOKUPS_PER_DAY checks in any 24 hours across the site, counted from the rows written;
  - at most half of each rate-limit window of the match's server (RANK_LOOKUP_SHARE), and never a
    wait: a request with no free slot is skipped, and the match says so;
  - no retries; a player whose check failed is not asked again on this server for 30 minutes, and
    a rejected key stops every check for 10 minutes.
  A rank is stored only while the player is still in the stored match (an erased player has been
  replaced there by "Removed player"), and permanent erasure deletes a person's row.
*/

export const LOOKUP_SOURCE = "match lookup";
/** LEAGUE-V4 checks in any 24 hours, across the site. */
export const RANK_LOOKUPS_PER_DAY = 1_000;
/** The share of each rate-limit window (per Riot server) the checks may fill; account sync keeps the rest. */
export const RANK_LOOKUP_SHARE = 0.5;
const FAILED_PAUSE_MS = 30 * 60_000;
const REFUSED_PAUSE_MS = 10 * 60_000;

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

const queueRank = (tier: string | null, division: string | null, leaguePoints: number | null): QueueRank => (!tier || tier === "UNRANKED" ? "unranked" : { tier, division, leaguePoints });

/**
 * Every stored reading for these players (no Riot request): their linked account's last sync,
 * with each queue's latest rank snapshot, and their last_known_ranks row. Three indexed queries.
 */
export async function storedRankReadings(db: Db, puuids: readonly string[]): Promise<Map<string, RankReading[]>> {
  const ids = [...new Set(puuids.filter(Boolean))];
  const out = new Map<string, RankReading[]>();
  if (!ids.length) return out;
  const add = (puuid: string, r: RankReading) => out.set(puuid, [...(out.get(puuid) ?? []), r]);
  const [accounts, known] = await Promise.all([
    db
      .select({ id: riotAccounts.id, puuid: riotAccounts.puuid, tier: riotAccounts.tier, division: riotAccounts.division, leaguePoints: riotAccounts.leaguePoints, queue: riotAccounts.rankQueue, at: riotAccounts.rankUpdatedAt })
      .from(riotAccounts)
      .where(inArray(riotAccounts.puuid, ids)),
    db.select().from(lastKnownRanks).where(inArray(lastKnownRanks.puuid, ids)),
  ]);
  const synced = accounts.filter((a) => a.puuid && a.at);
  const snapshots = synced.length
    ? await db
        .selectDistinctOn([rankSnapshots.accountId, rankSnapshots.queue], { accountId: rankSnapshots.accountId, queue: rankSnapshots.queue, tier: rankSnapshots.tier, division: rankSnapshots.division, leaguePoints: rankSnapshots.leaguePoints })
        .from(rankSnapshots)
        .where(inArray(rankSnapshots.accountId, synced.map((a) => a.id)))
        .orderBy(rankSnapshots.accountId, rankSnapshots.queue, desc(rankSnapshots.capturedAt))
    : [];
  for (const a of synced) {
    const own = snapshots.filter((s) => s.accountId === a.id);
    const at = a.at!.getTime();
    if (own.length) {
      // The sync read both queues: a queue without a snapshot was never ranked, one whose latest snapshot has no tier is unranked now.
      const of = (queue: "solo" | "flex"): QueueRank => {
        const s = own.find((x) => x.queue === queue);
        return s ? queueRank(s.tier, s.division, s.leaguePoints) : "unranked";
      };
      add(a.puuid!, { at, kind: "check", solo: of("solo"), flex: of("flex") });
    } else if (a.tier && a.tier !== "UNRANKED") {
      // Read before rank history was kept: the one rank the account stored, its queue only.
      const rank = queueRank(a.tier, a.division, a.leaguePoints);
      add(a.puuid!, { at, kind: "sighting", solo: a.queue === "flex" ? null : rank, flex: a.queue === "flex" ? rank : null });
    } else add(a.puuid!, { at, kind: "check", solo: "unranked", flex: "unranked" });
  }
  for (const r of known) {
    const at = r.observedAt.getTime();
    if (r.source === LOOKUP_SOURCE) add(r.puuid, { at, kind: "check", solo: queueRank(r.tier, r.division, r.leaguePoints), flex: queueRank(r.flexTier, r.flexDivision, r.flexLeaguePoints) });
    else add(r.puuid, { at, kind: "sighting", solo: queueRank(r.tier, r.division, r.leaguePoints), flex: null });
  }
  return out;
}

/** What the rank checks of one opened match did. */
export interface RankCheck {
  /** Players whose rank was asked of Riot. */
  asked: number;
  /** Answers stored (a rank or "unranked"). */
  found: number;
  /** Requests that failed (Riot errors, timeouts). */
  failed: number;
  /** Players left unchecked, and why: the daily limit, no free slot in the rate limits, or checks unavailable here. */
  skipped: number;
  reason: "budget" | "busy" | "unavailable" | null;
}

export const NO_CHECK: RankCheck = { asked: 0, found: 0, failed: 0, skipped: 0, reason: null };

// Per server instance: checks in flight (two windows on one match ask once), recent failures, and a rejected key.
const inFlight = new Map<string, Promise<"found" | "failed" | "busy" | "refused">>();
const failedUntil = new Map<string, number>();
let refusedUntil = 0;

/** Riot for the rank checks: no retries, quick, at most RANK_LOOKUP_SHARE of each window, never waiting; the stand-in in browser tests. */
export function rankLookupClient(): RiotApiClient | null {
  return createRiotClient({ maxRetries: 0, timeoutMs: 4_000, limitShare: RANK_LOOKUP_SHARE, noWait: true }) ?? browserTestRiotClient();
}

/** A real Riot match on a known server (demo games only with the browser tests' stand-in), and the key not just rejected. */
function checkable(match: { matchId: string; platform: string | null }, now: number): boolean {
  if (now < refusedUntil || !match.platform || !isRiotPlatform(match.platform)) return false;
  return browserTestRiot() || !match.matchId.startsWith("DEMO_");
}

/** Whether this deployment can check the ranks of this stored match's players (Riot access configured, or the browser tests' stand-in). */
export function rankChecksAvailable(match: { matchId: string; platform: string | null }, now = Date.now()): boolean {
  return checkable(match, now) && (browserTestRiot() || !!process.env.RIOT_API_KEY?.trim());
}

/** Lookups written in the last 24 hours (each is one LEAGUE-V4 request): the partial index's count. */
export async function rankLookupsSince(db: Db, since: Date): Promise<number> {
  const [row] = rowsOf<{ n: number | string }>(await db.execute(sql`SELECT count(*) AS n FROM last_known_ranks WHERE source = 'match lookup' AND observed_at > ${since.toISOString()}::timestamptz`));
  return Number(row?.n ?? 0);
}

/**
 * Keeps one LEAGUE-V4 answer, both queues, but only while the player is still in the stored match
 * (an erasure meanwhile replaced them with "Removed player", so nothing is written).
 */
async function storeLookup(db: Db, matchId: string, puuid: string, entries: readonly LeagueEntry[], now: Date): Promise<void> {
  const entry = (queueType: string) => entries.find((e) => e.queueType === queueType && e.tier);
  const solo = entry("RANKED_SOLO_5x5");
  const flex = entry("RANKED_FLEX_SR");
  await db.execute(sql`
    INSERT INTO last_known_ranks (puuid, tier, division, league_points, flex_tier, flex_division, flex_league_points, observed_at, source)
    SELECT ${puuid}::text, ${solo?.tier ?? "UNRANKED"}::text, ${solo?.rank ?? null}::text, ${solo ? solo.leaguePoints : null}::int,
      ${flex?.tier ?? "UNRANKED"}::text, ${flex?.rank ?? null}::text, ${flex ? flex.leaguePoints : null}::int, ${now.toISOString()}::timestamptz, ${LOOKUP_SOURCE}::text
    WHERE EXISTS (SELECT 1 FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) p WHERE d.match_id = ${matchId} AND p->>'puuid' = ${puuid})
    ON CONFLICT (puuid) DO UPDATE SET tier = EXCLUDED.tier, division = EXCLUDED.division, league_points = EXCLUDED.league_points,
      flex_tier = EXCLUDED.flex_tier, flex_division = EXCLUDED.flex_division, flex_league_points = EXCLUDED.flex_league_points,
      observed_at = EXCLUDED.observed_at, source = EXCLUDED.source`);
}

/**
 * Looks up the current rank of these players of one stored match (callers pass only those whose
 * reading is stale) within the limits above, and keeps the answers. Never throws for Riot's sake.
 */
export async function lookUpRanks(
  db: Db,
  client: RiotApiClient | null,
  match: { matchId: string; platform: string | null },
  players: ReadonlyArray<{ puuid: string; name: string | null }>,
  options: { now?: Date; perDay?: number } = {},
): Promise<RankCheck> {
  const now = options.now ?? new Date();
  const t = now.getTime();
  const candidates = players.filter((p) => p.puuid && (failedUntil.get(p.puuid) ?? 0) <= t);
  if (!candidates.length) return NO_CHECK;
  if (!client || !checkable(match, t)) return { ...NO_CHECK, skipped: candidates.length, reason: "unavailable" };
  // Never anyone whose personal data was erased (a stored match no longer names them; this is a second lock).
  const erased = await erasureFilter(db);
  const allowed = candidates.filter((p) => !erased.participant(p));
  const room = Math.max(0, (options.perDay ?? RANK_LOOKUPS_PER_DAY) - (await rankLookupsSince(db, new Date(t - 86_400_000))));
  const ask = allowed.slice(0, room);
  const outcome: RankCheck = { asked: ask.length, found: 0, failed: 0, skipped: allowed.length - ask.length, reason: allowed.length > ask.length ? "budget" : null };
  const platform = match.platform!;
  const results = await Promise.all(
    ask.map((p) => {
      const running = inFlight.get(p.puuid);
      if (running) return running;
      const run = (async () => {
        try {
          const entries = await client.leagueEntriesByPuuid(platform, p.puuid);
          await storeLookup(db, match.matchId, p.puuid, entries, now);
          return "found" as const;
        } catch (err) {
          if (err instanceof RiotApiError && err.status === 429) return "busy" as const;
          if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) {
            refusedUntil = Date.now() + REFUSED_PAUSE_MS;
            return "refused" as const;
          }
          if (failedUntil.size > 2_000) for (const [k, until] of failedUntil) if (until <= Date.now()) failedUntil.delete(k);
          failedUntil.set(p.puuid, Date.now() + FAILED_PAUSE_MS);
          return "failed" as const;
        } finally {
          inFlight.delete(p.puuid);
        }
      })();
      inFlight.set(p.puuid, run);
      return run;
    }),
  );
  for (const r of results) {
    if (r === "found") outcome.found++;
    else if (r === "failed") outcome.failed++;
    else {
      outcome.asked--;
      outcome.skipped++;
      outcome.reason ??= r === "busy" ? "busy" : "unavailable";
    }
  }
  return outcome;
}

/**
 * For the read-only data audit (counts only, nobody named): the readings kept, the lookups
 * answered on each of the last seven days (one LEAGUE-V4 request each), and how many places in
 * the games stored over the last 30 days have a rank to show, by where it comes from.
 */
export async function rankCoverage(db: Db, now = new Date()) {
  const n = (v: unknown) => Number(v ?? 0);
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
  const kept = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      SELECT source, count(*) AS players,
        count(*) FILTER (WHERE tier = 'UNRANKED' AND coalesce(flex_tier, 'UNRANKED') = 'UNRANKED') AS unranked,
        count(*) FILTER (WHERE observed_at > ${ago(RANK_FRESH_DAYS)}::timestamptz) AS current
      FROM last_known_ranks GROUP BY 1 ORDER BY 1`),
  ).map((r) => ({ source: String(r.source), players: n(r.players), unranked: n(r.unranked), current: n(r.current) }));
  const lookupsByDay = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      SELECT to_char(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, count(*) AS lookups
      FROM last_known_ranks WHERE source = 'match lookup' AND observed_at > ${ago(7)}::timestamptz GROUP BY 1 ORDER BY 1`),
  ).map((r) => ({ day: String(r.day), lookups: n(r.lookups) }));
  const [c] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      WITH p AS (
        SELECT DISTINCT d.match_id, x->>'puuid' AS puuid
        FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) x
        WHERE d.game_creation >= ${now.getTime() - 30 * 86_400_000} AND coalesce(x->>'removed', '') <> 'true' AND coalesce(x->>'puuid', '') <> '')
      SELECT count(DISTINCT p.match_id) AS games, count(*) AS places,
        count(*) FILTER (WHERE a.owner_type = 'player') AS linked,
        count(*) FILTER (WHERE a.owner_type = 'player' AND a.rank_updated_at IS NOT NULL) AS linked_synced,
        count(*) FILTER (WHERE a.puuid IS NOT NULL AND a.owner_type <> 'player') AS legacy_opponent,
        count(*) FILTER (WHERE a.puuid IS NULL AND k.source = 'match lookup') AS checked,
        count(*) FILTER (WHERE a.puuid IS NULL AND k.source = 'match lookup' AND k.observed_at > ${ago(RANK_FRESH_DAYS)}::timestamptz) AS checked_current,
        count(*) FILTER (WHERE a.puuid IS NULL AND k.source = 'match lookup' AND k.tier = 'UNRANKED' AND coalesce(k.flex_tier, 'UNRANKED') = 'UNRANKED') AS checked_unranked,
        count(*) FILTER (WHERE a.puuid IS NULL AND k.puuid IS NOT NULL AND k.source <> 'match lookup') AS sighting_only,
        count(*) FILTER (WHERE a.puuid IS NULL AND k.puuid IS NULL) AS nothing
      FROM p LEFT JOIN riot_accounts a ON a.puuid = p.puuid LEFT JOIN last_known_ranks k ON k.puuid = p.puuid`),
  );
  return {
    limits: { lookupsPerDay: RANK_LOOKUPS_PER_DAY, rateLimitShare: RANK_LOOKUP_SHARE, freshDays: RANK_FRESH_DAYS },
    kept,
    lookupsByDay,
    gamesLast30Days: {
      games: n(c?.games),
      places: n(c?.places),
      linkedAccounts: n(c?.linked),
      linkedAccountsSynced: n(c?.linked_synced),
      /** Accounts the retired Draft scouting stored for opponents: no longer synced, and counted apart from the others. */
      legacyOpponentAccounts: n(c?.legacy_opponent),
      othersChecked: n(c?.checked),
      othersCheckedCurrent: n(c?.checked_current),
      othersCheckedUnranked: n(c?.checked_unranked),
      othersSightingOnly: n(c?.sighting_only),
      othersNothingStored: n(c?.nothing),
    },
  };
}

/** Tests: forget this instance's failures, rejected key and checks in flight. */
export function resetRankLookups(): void {
  inFlight.clear();
  failedUntil.clear();
  refusedUntil = 0;
}

import { eq, sql } from "drizzle-orm";
import { defineJob } from "./registry";
import type { Db } from "@/server/db/types";
import { riotAccounts } from "@/server/db/schema";
import { createRiotClient, RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { browserTestRiotClient } from "@/server/riot/browser-test";
import { recordRankSnapshots, storedRankFrom } from "@/server/accounts/rank-history";
import { erasureFilter } from "@/server/privacy/ledger";
import { isRiotPlatform } from "@/domain/riot-platforms";

/*
  THE RANK WATCH: frequent readings of the team's ranks, so each ranked game is enclosed by a
  reading taken while it was played and one taken minutes after it ended, the two that prove its
  LP (domain/lp-attribution). One LEAGUE-V4 request per account answers both queues; an unchanged
  reading only moves the last row's confirmed_at, a change is a new row (accounts/rank-history).

  Who is read, and how often:
  - accounts that played ranked, or whose rank changed, in the last RANK_WATCH_ACTIVE_DAYS days:
    every run (the schedule calls it every five minutes; RANK_WATCH_ACTIVE_MS leaves room for its
    jitter);
  - other accounts with a rank: about hourly (RANK_WATCH_IDLE_MS), so a return to ranked is seen;
  - never-ranked accounts are left to account sync, which reads every account's rank anyway.
  Limits: at most RANK_WATCH_MAX accounts a run, half of each rate-limit window (account sync and
  the rank checks share the key), no retries and no waiting: a run with no room left stops, as it
  does at a refused key. Nothing is lost by a skipped run: the next one reads again.
*/

export const RANK_WATCH_ACTIVE_DAYS = 30;
export const RANK_WATCH_ACTIVE_MS = 4 * 60_000;
export const RANK_WATCH_IDLE_MS = 55 * 60_000;
export const RANK_WATCH_MAX = 40;
export const RANK_WATCH_SHARE = 0.5;

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const ms = (v: unknown): number | null => (v === null || v === undefined ? null : typeof v === "number" ? v : new Date(v as string | Date).getTime());

export interface WatchAccount {
  id: string;
  platform: string;
  puuid: string;
  hadRank: boolean;
  active: boolean;
  lastRead: number;
}

/** The accounts due a reading now, the active ones first, then the longest unread. */
export async function accountsDueRankWatch(db: Db, now: number): Promise<WatchAccount[]> {
  const rows = rowsOf<{ id: string; platform: string; puuid: string; tier: string | null; last_game: unknown; last_read: unknown; last_change: unknown }>(
    await db.execute(sql`
      SELECT a.id, a.platform, a.puuid, a.tier,
        (SELECT max(m.game_creation) FROM account_matches m WHERE m.account_id = a.id AND m.queue_id IN (420, 440)) AS last_game,
        (SELECT max(greatest(s.captured_at, coalesce(s.confirmed_at, s.captured_at))) FROM rank_snapshots s WHERE s.account_id = a.id) AS last_read,
        (SELECT max(s.captured_at) FROM rank_snapshots s WHERE s.account_id = a.id) AS last_change
      FROM riot_accounts a
      WHERE a.owner_type = 'player' AND a.player_id IS NOT NULL AND a.puuid IS NOT NULL`),
  );
  const since = now - RANK_WATCH_ACTIVE_DAYS * 86_400_000;
  return rows
    .map((r) => {
      const lastRead = ms(r.last_read);
      const lastGame = ms(r.last_game);
      const lastChange = ms(r.last_change);
      return { id: r.id, platform: r.platform, puuid: r.puuid, hadRank: lastRead !== null, active: (lastGame ?? 0) >= since || (lastChange ?? 0) >= since, lastRead: lastRead ?? 0 };
    })
    .filter((a) => a.hadRank && isRiotPlatform(a.platform) && now - a.lastRead >= (a.active ? RANK_WATCH_ACTIVE_MS : RANK_WATCH_IDLE_MS))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.lastRead - b.lastRead)
    .slice(0, RANK_WATCH_MAX);
}

export interface RankWatchRun {
  due: number;
  active: number;
  read: number;
  changed: number;
  failed: number;
  stoppedBy: string | null;
}

/** Reads the accounts due now, one request each, until the deadline, a full rate limit or a refused key. */
export async function watchRanks(db: Db, client: RiotApiClient, options: { deadline: number; log?: (message: string) => void; now?: number }): Promise<RankWatchRun> {
  const now = options.now ?? Date.now();
  const due = await accountsDueRankWatch(db, now);
  const erased = await erasureFilter(db);
  const run: RankWatchRun = { due: due.length, active: due.filter((a) => a.active).length, read: 0, changed: 0, failed: 0, stoppedBy: null };
  for (const account of due) {
    if (Date.now() > options.deadline) {
      run.stoppedBy = "time budget";
      break;
    }
    if (erased.puuid(account.puuid)) continue;
    try {
      const entries = await client.leagueEntriesByPuuid(account.platform, account.puuid);
      // The reading's time: when its answer came (the run's clock, which a test sets).
      const written = await recordRankSnapshots(db, account.id, entries, options.now === undefined ? new Date() : new Date(now));
      run.read += 1;
      if (written > 0) {
        run.changed += 1;
        // The stored rank (the profile header, the cards) follows the change at once.
        await db.update(riotAccounts).set(storedRankFrom(entries)).where(eq(riotAccounts.id, account.id));
      }
    } catch (err) {
      if (err instanceof RiotApiError && (err.status === 401 || err.status === 403)) {
        run.stoppedBy = `Riot refused the key (${err.status})`;
        break;
      }
      if (err instanceof RiotApiError && err.status === 429) {
        run.stoppedBy = "no room in the rate limits";
        break;
      }
      run.failed += 1;
      options.log?.(`rank-watch: an account's reading failed: ${(err as Error).message}`);
    }
  }
  return run;
}

defineJob({
  key: "rank-watch",
  description: "Read the rank of the linked accounts (LEAGUE-V4, one request each, both queues): every run for those that played ranked in the last 30 days, about hourly for the others. An unchanged reading confirms the last one, a change is stored; together they prove each ranked game's LP. At most 40 accounts a run, half of each rate-limit window, no retries.",
  defaultIntervalMinutes: 5,
  run: async (ctx) => {
    const client = createRiotClient({ maxRetries: 0, timeoutMs: 5_000, limitShare: RANK_WATCH_SHARE, noWait: true }) ?? browserTestRiotClient();
    if (!client) return { ok: true, degraded: true, error: "RIOT_API_KEY is not configured; ranks cannot be read.", summary: { skipped: true } };
    const run = await watchRanks(ctx.db, client, { deadline: ctx.startedAt + ctx.budgetMs, log: ctx.log });
    ctx.log(`rank-watch: ${run.read} of ${run.due} due read (${run.active} active), ${run.changed} changed${run.failed ? `, ${run.failed} failed` : ""}${run.stoppedBy ? `, stopped: ${run.stoppedBy}` : ""}`);
    const refused = run.stoppedBy?.startsWith("Riot refused") ?? false;
    // Every account tried failed (Riot 5xx, a timeout, the network): said in counts, so Admin repeats it as a warning.
    const noneRead = run.read === 0 && run.failed > 0;
    const error = refused ? (run.stoppedBy ?? undefined) : noneRead ? `${run.failed === 1 ? "The one account tried this run could not be read" : `None of the ${run.failed} accounts tried this run could be read`}; the run's log says why.` : undefined;
    return { ok: true, degraded: refused || noneRead, error, summary: { ...run, requests: client.requestCount } };
  },
});

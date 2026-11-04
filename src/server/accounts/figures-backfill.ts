import { inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, champions, matchDetails } from "@/server/db/schema";
import { RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { FIRST_SEASON } from "@/domain/season";
import { erasureFilter } from "@/server/privacy/ledger";
import { matchDetailRow } from "./match-details";
import { summariseMatches } from "./match-summary";
import { seasonListStart } from "./sync";

/*
  Figures backfill: the extra figures Riot records for each player in a game (double, triple,
  quadra and pentakills, wards cleared, objective damage, solo kills…) for the linked players' games
  stored before Team Leaderboards (Phase 14) kept them. Those games' full records were stored
  without the figures, so each record is asked for once more:
  - newest games first, and only games of a season the app offers (Season 2026 on);
  - one request per match, even when several linked accounts played it, to the server the record
    was first read from (an account that has since moved keeps its old games' server);
  - a few per run, one at a time through the shared rate limiter, stopping at the first refusal or
    error (Riot's limits are shared with the account sync).
  The fresh record replaces the stored one (the same fields, now with the figures) and the game's
  summary is copied again, so profiles, Leaderboards and match history show the counts on their next
  read. A record Riot no longer provides is marked as checked ({} in extra_stats) and never asked
  for again: its games keep having no counts, never zeros, and profiles say so.
*/

type Row = Record<string, unknown>;
const rows = (r: unknown): Row[] => ((r as { rows?: Row[] }).rows ?? (r as Row[])) as Row[];

/** Marks games as checked: their record has no figures, now or ever. */
const CHECKED = sql`'{}'::jsonb`;

/**
 * The stored record lists no players. Its stored size says so first (an empty list is a few bytes, a
 * record with players several kilobytes), so only tiny records are unpacked: a plain
 * jsonb_array_length unpacked every stored record on each run (about 2.4 s of database time on
 * production, 26 Oct 2026).
 */
const NO_PLAYERS = sql`CASE WHEN pg_column_size(d.participants) < 64 THEN jsonb_array_length(d.participants) = 0 ELSE false END`;

/** Where the linked players' games of the offered seasons stand: with figures, never to have them, or still to fetch. */
export async function figuresCoverage(db: Db): Promise<{ games: number; withFigures: number; unavailable: number; pending: number }> {
  const since = (await seasonListStart(db, FIRST_SEASON)) * 1000;
  const [r] = rows(
    await db.execute(sql`
      SELECT count(*) AS games,
        count(*) FILTER (WHERE am.extra_stats->>'doubleKills' IS NOT NULL) AS with_figures,
        count(*) FILTER (WHERE am.extra_stats IS NOT NULL AND am.extra_stats->>'doubleKills' IS NULL) AS unavailable
      FROM account_matches am
      JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player'
      WHERE am.champion_id IS NOT NULL AND am.game_creation >= ${since}`),
  );
  const games = Number(r?.games ?? 0);
  const withFigures = Number(r?.with_figures ?? 0);
  const unavailable = Number(r?.unavailable ?? 0);
  return { games, withFigures, unavailable, pending: Math.max(0, games - withFigures - unavailable) };
}

/** One player's games of the offered seasons still waiting for their figures (a profile's Refresh says how many are left). */
export async function pendingFiguresForPlayer(db: Db, playerId: string): Promise<number> {
  const since = (await seasonListStart(db, FIRST_SEASON)) * 1000;
  const [r] = rows(
    await db.execute(sql`
      SELECT count(DISTINCT am.match_id) AS pending
      FROM account_matches am
      JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player' AND a.player_id = ${playerId}
      WHERE am.champion_id IS NOT NULL AND am.extra_stats IS NULL AND am.game_creation >= ${since}`),
  );
  return Number(r?.pending ?? 0);
}

export interface FiguresBackfillResult {
  fetched: number;
  /** Records Riot no longer provides (or never had the figures): marked, not asked for again. */
  unavailable: number;
  /** Why the run stopped early, if it did (a refusal, an error, the time budget). */
  stoppedBy: string | null;
}

/**
 * Fetches again up to `limit` stored records without the figures, newest games first, stopping at
 * the deadline or the first refusal. With `playerId`, only that player's games (a profile's Refresh).
 */
export async function backfillFigures(db: Db, client: RiotApiClient, options: { limit: number; deadline: number; playerId?: string; log?: (m: string) => void }): Promise<FiguresBackfillResult> {
  const result: FiguresBackfillResult = { fetched: 0, unavailable: 0, stoppedBy: null };
  if (options.limit <= 0) return result;
  // A game whose stored record is itself marked unavailable (no players) has nothing to ask for.
  await db.execute(sql`
    UPDATE account_matches am SET extra_stats = ${CHECKED}
    FROM match_details d
    WHERE d.match_id = am.match_id AND am.extra_stats IS NULL AND am.champion_id IS NOT NULL AND ${NO_PLAYERS}`);
  const since = (await seasonListStart(db, FIRST_SEASON)) * 1000;
  const due = rows(
    await db.execute(sql`
      SELECT am.match_id, coalesce(max(d.platform), min(a.platform)) AS platform, max(am.game_creation) AS created
      FROM account_matches am
      JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player' AND a.platform IS NOT NULL
      JOIN match_details d ON d.match_id = am.match_id AND NOT (${NO_PLAYERS})
      WHERE am.champion_id IS NOT NULL AND am.extra_stats IS NULL AND am.game_creation >= ${since}${options.playerId ? sql` AND a.player_id = ${options.playerId}` : sql``}
      GROUP BY am.match_id
      ORDER BY created DESC
      LIMIT ${options.limit}`),
  );
  if (due.length === 0) return result;
  const keyToId = new Map((await db.select({ key: champions.key, id: champions.id }).from(champions)).map((c) => [c.key, c.id]));
  const erased = await erasureFilter(db);
  const refreshed: string[] = [];
  const checked: string[] = [];
  for (const r of due) {
    if (Date.now() > options.deadline) {
      result.stoppedBy = "time budget";
      break;
    }
    const matchId = String(r.match_id);
    const platform = String(r.platform);
    try {
      const row = matchDetailRow(platform, await client.match(platform, matchId), keyToId, erased);
      // A record with a "Removed player" keeps its players as they are: a fresh copy from Riot
      // never brings an erased player back, even one the erasure records no longer recognise.
      await db
        .update(matchDetails)
        .set({ teams: row.teams, participants: sql`CASE WHEN ${matchDetails.participants} @> '[{"removed": true}]'::jsonb THEN ${matchDetails.participants} ELSE ${JSON.stringify(row.participants)}::jsonb END`, gameVersion: row.gameVersion })
        .where(sql`${matchDetails.matchId} = ${matchId}`);
      refreshed.push(matchId);
      result.fetched += 1;
    } catch (err) {
      if (err instanceof RiotApiError && err.status === 404) {
        checked.push(matchId);
        result.unavailable += 1;
        continue;
      }
      result.stoppedBy = err instanceof RiotApiError ? `Riot answered ${err.status || "with an error"}` : "a network error";
      options.log?.(`${matchId}: ${(err as Error).message}`);
      break;
    }
  }
  await erased.remember(db);
  // Each refreshed game's summary is copied again from its new record (one pass for the run).
  if (refreshed.length) {
    await db.update(accountMatches).set({ summarisedAt: null }).where(inArray(accountMatches.matchId, refreshed));
    await summariseMatches(db, { matchIds: refreshed, maxBatches: 1 });
  }
  // Whatever still has no figures after its record was asked for (Riot no longer has it, or sent
  // none for that player) is checked, so it is not asked for again; a refreshed game only once
  // its summary was copied from the new record.
  const list = (ids: string[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);
  if (refreshed.length) await db.execute(sql`UPDATE account_matches SET extra_stats = ${CHECKED} WHERE match_id IN (${list(refreshed)}) AND extra_stats IS NULL AND champion_id IS NOT NULL AND summarised_at IS NOT NULL`);
  if (checked.length) await db.execute(sql`UPDATE account_matches SET extra_stats = ${CHECKED} WHERE match_id IN (${list(checked)}) AND extra_stats IS NULL AND champion_id IS NOT NULL`);
  return result;
}

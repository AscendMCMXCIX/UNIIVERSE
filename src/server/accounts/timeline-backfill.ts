import { eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matchTimelines } from "@/server/db/schema";
import { MAX_SKIPPED_RECORDS, recordFailure, type RiotApiClient } from "@/server/riot/api/client";
import { describeStop } from "./figures-backfill";
import { SYNC_QUEUE_IDS } from "./sync";
import { completedTimeline, keptTimeline, timelineRow } from "./match-timeline";

/*
  Timeline backfill for Matchups: the linked players' own Summoner's Rift games that have an
  identified lane opponent get their timeline fetched once and kept compactly (gold, experience and
  CS per frame; build and skill order). Newest games first, a small number per run, one request at
  a time through the shared rate limiter, and the run stops at the first refusal (Riot's limits
  are shared with the account sync). A timeline Riot no longer provides is recorded as unavailable
  and never asked for again; one Riot cannot serve right now (its 5xx for one game, which can last
  for good) is passed over, a few a run, so it never holds up the games behind it, and is asked for
  again later (recordFailure in riot/api/client). Remakes (under five minutes) are skipped.
*/

/** Games shorter than this are remakes: no lane to compare. */
export const MIN_LANE_GAME_SECONDS = 300;

type Row = Record<string, unknown>;
const rows = (r: unknown): Row[] => ((r as { rows?: Row[] }).rows ?? (r as Row[])) as Row[];

/** The condition for a game Matchups can use: one of the linked players' rift games with a lane opponent, not a remake. */
const laneGame = sql`am.champion_id IS NOT NULL AND am.enemy_champion_id IS NOT NULL AND am.queue_id IN (${sql.join(SYNC_QUEUE_IDS.map((q) => sql`${q}`), sql`, `)}) AND coalesce(am.game_duration, 0) >= ${MIN_LANE_GAME_SECONDS}`;

/** How many of the linked players' lane games have frames stored, are unavailable at Riot, or are still to fetch. */
export async function timelineCoverage(db: Db): Promise<{ laneGames: number; withFrames: number; unavailable: number; pending: number }> {
  const [r] = rows(
    await db.execute(sql`
      SELECT count(DISTINCT am.match_id) AS lane_games,
        count(DISTINCT am.match_id) FILTER (WHERE jsonb_array_length(t.frames->'t') > 0) AS with_frames,
        count(DISTINCT am.match_id) FILTER (WHERE t.frames IS NOT NULL AND jsonb_array_length(t.frames->'t') = 0) AS unavailable
      FROM account_matches am
      JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player'
      LEFT JOIN match_timelines t ON t.match_id = am.match_id
      WHERE ${laneGame}`),
  );
  const laneGames = Number(r?.lane_games ?? 0);
  const withFrames = Number(r?.with_frames ?? 0);
  const unavailable = Number(r?.unavailable ?? 0);
  return { laneGames, withFrames, unavailable, pending: Math.max(0, laneGames - withFrames - unavailable) };
}

export interface BackfillResult {
  fetched: number;
  unavailable: number;
  /** Timelines Riot could not serve this run (by match id): passed over, asked for again next time. */
  skipped: string[];
  /** Why the run stopped early, if it did (a refusal, an error, the time budget). */
  stoppedBy: string | null;
}

/** Fetches up to `limit` missing timelines, newest games first, stopping at the deadline or the first refusal. */
export async function backfillTimelines(db: Db, client: RiotApiClient, options: { limit: number; deadline: number; log?: (m: string) => void }): Promise<BackfillResult> {
  const result: BackfillResult = { fetched: 0, unavailable: 0, skipped: [], stoppedBy: null };
  if (options.limit <= 0) return result;
  const due = rows(
    await db.execute(sql`
      SELECT am.match_id, min(a.platform) AS platform, max(am.game_creation) AS created
      FROM account_matches am
      JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player' AND a.platform IS NOT NULL
      LEFT JOIN match_timelines t ON t.match_id = am.match_id
      WHERE ${laneGame} AND t.frames IS NULL
      GROUP BY am.match_id
      ORDER BY created DESC
      LIMIT ${options.limit}`),
  );
  for (const r of due) {
    if (Date.now() > options.deadline) {
      result.stoppedBy = "time budget";
      break;
    }
    const matchId = String(r.match_id);
    const platform = String(r.platform);
    let row: typeof matchTimelines.$inferInsert;
    try {
      row = await keptTimeline(db, timelineRow(matchId, platform, await client.matchTimeline(platform, matchId)));
      result.fetched += 1;
    } catch (err) {
      const kind = recordFailure(err);
      if (kind === "unavailable") {
        row = timelineRow(matchId, platform, null);
        result.unavailable += 1;
      } else {
        options.log?.(`${matchId}: ${(err as Error).message}`);
        if (kind === "skip" && result.skipped.length < MAX_SKIPPED_RECORDS) {
          result.skipped.push(matchId);
          continue;
        }
        result.stoppedBy = kind === "skip" ? `${MAX_SKIPPED_RECORDS} records could not be read` : describeStop(err);
        break;
      }
    }
    // A row stored for the build order only (no frames yet) keeps its purchases and skills; the
    // frames, kill times and objectives are added (completedTimeline). A timeline Riot no longer
    // provides keeps what it had.
    const [stored] = await db.select({ participants: matchTimelines.participants, frames: matchTimelines.frames, events: matchTimelines.events }).from(matchTimelines).where(eq(matchTimelines.matchId, matchId));
    const done = completedTimeline(stored, row);
    await db
      .insert(matchTimelines)
      .values({ ...row, ...done })
      .onConflictDoUpdate({ target: matchTimelines.matchId, set: done });
  }
  return result;
}

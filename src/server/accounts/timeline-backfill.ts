import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { matchTimelines } from "@/server/db/schema";
import { RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { SYNC_QUEUE_IDS } from "./sync";
import { timelineRow } from "./match-timeline";

/*
  Timeline backfill for Matchups: the linked players' own Summoner's Rift games that have an
  identified lane opponent get their timeline fetched once and kept compactly (gold, experience and
  CS per frame; build and skill order). Newest games first, a small number per run, one request at
  a time through the shared rate limiter, and the run stops at the first refusal or error (Riot's
  limits are shared with ranked collection). A timeline Riot no longer provides is recorded as
  unavailable and never asked for again. Remakes (under five minutes) are skipped.
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
  /** Why the run stopped early, if it did (a refusal, an error, the time budget). */
  stoppedBy: string | null;
}

/** Fetches up to `limit` missing timelines, newest games first, stopping at the deadline or the first refusal. */
export async function backfillTimelines(db: Db, client: RiotApiClient, options: { limit: number; deadline: number; log?: (m: string) => void }): Promise<BackfillResult> {
  const result: BackfillResult = { fetched: 0, unavailable: 0, stoppedBy: null };
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
      row = timelineRow(matchId, platform, await client.matchTimeline(platform, matchId));
      result.fetched += 1;
    } catch (err) {
      if (err instanceof RiotApiError && err.status === 404) {
        row = timelineRow(matchId, platform, null);
        result.unavailable += 1;
      } else {
        result.stoppedBy = err instanceof RiotApiError ? `Riot answered ${err.status || "with an error"}` : "a network error";
        options.log?.(`${matchId}: ${(err as Error).message}`);
        break;
      }
    }
    // Rows stored for the build order only (no frames yet) keep their purchases; the frames are added.
    await db
      .insert(matchTimelines)
      .values(row)
      .onConflictDoUpdate({ target: matchTimelines.matchId, set: { frames: row.frames, participants: sql`CASE WHEN jsonb_array_length(${matchTimelines.participants}) = 0 THEN excluded.participants ELSE ${matchTimelines.participants} END` } });
  }
  return result;
}

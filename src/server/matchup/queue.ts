import { unstable_cache, revalidateTag } from "next/cache";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { getDbHandle } from "@/server/db/client";
import { currentSeason } from "@/server/accounts/sync";
import { MIN_VALID_DURATION_S } from "@/domain/season-stats";
import { isRole } from "@/domain/roles";
import { LANE_QUEUES } from "@/domain/matchup/queues";
import type { MeetCount } from "@/domain/matchup/curation";

/*
  Matchup Intel's curation queue, for Admin only (Admin → Platform Settings → Matchup notes;
  docs/MATCHUP_INTEL.md, "Curation"): how often the team's members met each lane opponent, and each
  pairing (their champion against it), in the season's draft games, so the notes worth writing
  first are the ones the team meets most. Restored from the retired curation priorities
  (a4a794be^ server/matchup-intel/curation.ts): the same member rule (a team member's profile that
  is not archived; a result known; no remake), with the lane opponent the one lane opponent rule
  stored (account_matches.enemy_champion_id).

  Champion names and counts only, never whose games: with a handful of members a role's pairing
  can point at one person, so these figures stay on Admin's page, never in a log, a job's output,
  /api/health, the Production check or the docs. About 15 KB a read, cached for an hour in Next's
  data cache (tag QUEUE_CACHE_TAG, dropped by every note action and by an erasure).
*/

export const QUEUE_CACHE_TAG = "matchup-queue";
const QUEUE_CACHE_SECONDS = 3600;
/** The pairings kept, most met first; and the opponents per role. */
const TOP_PAIRS = 200;
const TOP_OPPONENTS = 30;

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parse = <T,>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

async function sharedCacheFor(db: Db): Promise<boolean> {
  if (!process.env.NEXT_RUNTIME) return false;
  try {
    const handle = await getDbHandle();
    return handle.db === db && handle.mode === "postgres";
  } catch {
    return false;
  }
}

/** The members' meetings this season: each pairing, and each opponent by role (championId null). */
export async function readMeetCounts(db: Db, season: number): Promise<MeetCount[]> {
  const queues = sql.raw(LANE_QUEUES.map((q) => String(q)).join(", "));
  const result = await db.execute(sql`
    WITH g AS (
      SELECT am.role::text AS role, am.champion_id, am.enemy_champion_id, am.match_id, am.game_creation, (t.frames IS NOT NULL) AS tl
      FROM account_matches am
      JOIN riot_accounts ra ON ra.id = am.account_id AND ra.owner_type = 'player'
      JOIN players p ON p.id = ra.player_id AND p.team_member AND p.archived_at IS NULL
      LEFT JOIN match_timelines t ON t.match_id = am.match_id
      WHERE am.win IS NOT NULL AND am.game_duration >= ${MIN_VALID_DURATION_S} AND am.enemy_champion_id IS NOT NULL AND am.champion_id IS NOT NULL AND am.role IS NOT NULL
        AND am.queue_id IN (${queues}) AND am.patch LIKE ${`${Math.trunc(season)}.%`}
    ),
    pairs AS (
      SELECT role, champion_id, enemy_champion_id, count(DISTINCT match_id) AS games, max(game_creation) AS last, count(DISTINCT match_id) FILTER (WHERE tl) AS timed
      FROM g GROUP BY role, champion_id, enemy_champion_id ORDER BY games DESC, last DESC LIMIT ${TOP_PAIRS}
    ),
    opps AS (
      SELECT role, enemy_champion_id, count(DISTINCT match_id) AS games, max(game_creation) AS last, count(DISTINCT match_id) FILTER (WHERE tl) AS timed,
        row_number() OVER (PARTITION BY role ORDER BY count(DISTINCT match_id) DESC, max(game_creation) DESC) AS rn
      FROM g GROUP BY role, enemy_champion_id
    )
    SELECT coalesce((SELECT json_agg(json_build_array(role, champion_id, enemy_champion_id, games, last, timed)) FROM pairs), '[]') AS pairs,
           coalesce((SELECT json_agg(json_build_array(role, null, enemy_champion_id, games, last, timed)) FROM opps WHERE rn <= ${TOP_OPPONENTS}), '[]') AS opponents`);
  const [row] = rowsOf<{ pairs: unknown; opponents: unknown }>(result);
  type Raw = [string, string | null, string, number | string, number | string, number | string];
  const read = (v: unknown) =>
    parse<Raw[]>(v ?? [])
      .filter((r) => isRole(r[0]) && typeof r[2] === "string")
      .map(([role, championId, opponentId, games, last, timed]) => ({ role: role as MeetCount["role"], championId: championId ?? null, opponentId, games: Number(games), last: Number(last), withTimeline: Number(timed) }));
  return [...read(row?.opponents), ...read(row?.pairs)];
}

/** The meetings for Admin's queue, cached for an hour on production. */
export async function loadMeetCounts(db: Db): Promise<MeetCount[]> {
  const season = await currentSeason(db);
  const read = () => readMeetCounts(db, season);
  return (await sharedCacheFor(db)) ? unstable_cache(read, ["matchup-queue", "1", String(season)], { revalidate: QUEUE_CACHE_SECONDS, tags: [QUEUE_CACHE_TAG] })() : read();
}

/** Drops the cached queue (a note action, an erasure). */
export function forgetMatchupQueue(): void {
  try {
    revalidateTag(QUEUE_CACHE_TAG, { expire: 0 });
  } catch {
    // Outside a request of the Next server: nothing cached here.
  }
}

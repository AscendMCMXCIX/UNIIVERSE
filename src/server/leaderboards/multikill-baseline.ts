import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { registerLocalCache } from "@/server/observability/cache";
import { seasonGames } from "@/domain/leaderboard-records";
import { buildMultikillBaseline, type BaselineRow, type MultikillBaseline } from "@/domain/multikill-score";
import { loadCountingReading } from "@/server/accounts/multikill-counting";
import type { LeaderboardData } from "./service";

/*
  The multikill score's comparison (domain/multikill-score, docs/TEAM_LEADERBOARDS.md "The multikill
  score"): every other player in the members' stored games of the season (allies and opponents; never
  a team member, never a removed player), as aggregates only. One statement over the season's stored
  match records, the very games the season records count (seasonGames), answered as about one row
  per position and champion (each a short array: position, champion, games, and the multikills under
  both readings of Riot's counters). How Riot counts is read once for every page that shows
  multikills (server/accounts/multikill-counting), so the board and the profiles agree. No PUUID,
  name or game leaves the database; nothing about any one player is kept.

  Cost: the records' participants are unpacked once per computation (a few hundred ms of database
  time for a season of a few thousand records, measured in docs/TEAM_LEADERBOARDS.md), and the answer
  is a few KB. A comparison of thousands of games moves little with a few more, so it is cached per
  team and season for up to 6 hours, recomputed when the team's stored history has changed (the
  games cache's fingerprint) and the cached one is at least an hour old.
*/

const MAX_AGE_MS = 6 * 3_600_000;
const REFRESH_AFTER_MS = 3_600_000;

interface Cached {
  key: string;
  at: number;
  baseline: MultikillBaseline;
}
const cache = new Map<string, Cached>();

/** Forget cached comparisons (tests, or after a change the fingerprint cannot see). */
export function invalidateMultikillBaselineCache() {
  cache.clear();
}
registerLocalCache(invalidateMultikillBaselineCache);

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parse = <T,>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

type Row = [string | null, string | null, number, number, number, number, number, number, number, number, number];

/**
 * The comparison for one season of the team's games: the other players in the same stored records,
 * read with the counting rule those records show. `data` is the team's load (its season games and
 * the members' accounts); `now` for tests.
 */
export async function loadMultikillBaseline(db: Db, teamId: string, data: Pick<LeaderboardData, "games" | "memberPuuids" | "historyKey">, season: number, now = Date.now()): Promise<MultikillBaseline> {
  const matchIds = [...new Set(seasonGames(data.games, season).map((g) => g.matchId))].sort();
  const key = `${data.historyKey ?? ""}|${matchIds.length}`;
  const id = `${teamId}|${season}`;
  const hit = cache.get(id);
  if (hit && now - hit.at < MAX_AGE_MS && (hit.key === key || now - hit.at < REFRESH_AFTER_MS)) return hit.baseline;
  const reading = await loadCountingReading(db);
  const baseline = buildMultikillBaseline(matchIds.length ? await readBaseline(db, matchIds, data.memberPuuids ?? []) : [], reading.evidence);
  cache.set(id, { key, at: now, baseline });
  return baseline;
}

async function readBaseline(db: Db, matchIds: readonly string[], memberPuuids: readonly string[]): Promise<BaselineRow[]> {
  const ids = JSON.stringify(matchIds);
  const members = JSON.stringify(memberPuuids);
  const counter = (k: string) => sql.raw(`(x->'stats'->>'${k}')::int`);
  // Postgres plans many more participants a record than the ten there are, which can put this over
  // its JIT threshold; compiling would take longer than running it (as for Encounters).
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL jit = off`);
    return tx.execute(sql`
      WITH p AS (
        SELECT x->>'position' AS position, x->>'championId' AS champion,
          coalesce(x->>'puuid', '') IN (SELECT jsonb_array_elements_text(${members}::jsonb)) AS member,
          ${counter("doubleKills")} AS d, ${counter("tripleKills")} AS t, ${counter("quadraKills")} AS q, ${counter("pentaKills")} AS pk
        FROM (SELECT DISTINCT value AS match_id FROM jsonb_array_elements_text(${ids}::jsonb)) g
        JOIN match_details md ON md.match_id = g.match_id
        CROSS JOIN LATERAL jsonb_array_elements(md.participants) x
        WHERE x->>'removed' IS NULL
          AND jsonb_typeof(x->'stats'->'doubleKills') = 'number' AND jsonb_typeof(x->'stats'->'tripleKills') = 'number'
          AND jsonb_typeof(x->'stats'->'quadraKills') = 'number' AND jsonb_typeof(x->'stats'->'pentaKills') = 'number'
      )
      SELECT
        (SELECT coalesce(json_agg(json_build_array(position, champion, games, n2, n3, n4, n5, s2, s3, s4, s5)), '[]') FROM (
          SELECT position, champion, count(*)::int AS games,
            sum(greatest(d - t, 0))::int AS n2, sum(greatest(t - q, 0))::int AS n3, sum(greatest(q - pk, 0))::int AS n4, sum(pk)::int AS n5,
            sum(d)::int AS s2, sum(t)::int AS s3, sum(q)::int AS s4, sum(pk)::int AS s5
          FROM p WHERE NOT member GROUP BY position, champion) groups) AS rows`);
  });
  const [answer] = rowsOf<{ rows: unknown }>(result);
  const rows: BaselineRow[] = parse<Row[]>(answer?.rows ?? []).map(([position, championId, games, n2, n3, n4, n5, s2, s3, s4, s5]) => ({
    position,
    championId,
    games: Number(games),
    nested: { double: Number(n2), triple: Number(n3), quadra: Number(n4), penta: Number(n5) },
    separate: { double: Number(s2), triple: Number(s3), quadra: Number(s4), penta: Number(s5) },
  }));
  return rows;
}

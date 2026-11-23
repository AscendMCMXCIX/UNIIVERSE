import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { registerLocalCache } from "@/server/observability/cache";
import { readCountingRule, type CountingReading } from "@/domain/multikill-score";

/*
  How Riot's multikill counters count (domain/multikill-score, readCountingRule), read once from the
  linked players' own stored games and shared by every page that shows multikills, so the profiles
  (Overview, All Champions, the champion window) and Team Leaderboards (its board, tiles and Peek)
  show the same member the same counts: each multikill once, at its largest (Release 15, round 3).

  One aggregate statement over `account_matches` (the per-game counters copied from each record): two
  counts, no row of any player. A team's few thousand games with counters hold hundreds with a triple,
  enough to read the rule; a smaller one reads "assumed nested", the reading that never counts a
  multikill twice, and the pages say so. Cached for up to 6 hours: the rule is Riot's, and does not
  change with a few more games.
*/

const MAX_AGE_MS = 6 * 3_600_000;
let cached: { at: number; reading: CountingReading } | null = null;

/** Forget the cached reading (tests). */
export function invalidateMultikillCountingCache() {
  cached = null;
}
registerLocalCache(invalidateMultikillCountingCache);

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

/** The counting rule the linked players' stored games show (cached); `now` for tests. */
export async function loadCountingReading(db: Db, now = Date.now()): Promise<CountingReading> {
  if (cached && now - cached.at < MAX_AGE_MS) return cached.reading;
  const n = (k: string) => sql.raw(`(am.extra_stats->>'${k}')::int`);
  const result = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE ${n("tripleKills")} > 0)::int AS with_triple,
      count(*) FILTER (WHERE ${n("tripleKills")} > ${n("doubleKills")} OR ${n("quadraKills")} > ${n("tripleKills")} OR ${n("pentaKills")} > ${n("quadraKills")}
        OR (${n("largestMultiKill")} >= 3 AND ${n("doubleKills")} = 0) OR (${n("largestMultiKill")} >= 4 AND ${n("tripleKills")} = 0) OR (${n("largestMultiKill")} >= 5 AND ${n("quadraKills")} = 0))::int AS out_of_order
    FROM account_matches am
    JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player'
    WHERE jsonb_typeof(am.extra_stats->'doubleKills') = 'number' AND jsonb_typeof(am.extra_stats->'tripleKills') = 'number'
      AND jsonb_typeof(am.extra_stats->'quadraKills') = 'number' AND jsonb_typeof(am.extra_stats->'pentaKills') = 'number'`);
  const [r] = rowsOf<{ with_triple: number; out_of_order: number }>(result);
  const reading = readCountingRule({ withTriple: Number(r?.with_triple ?? 0), outOfOrder: Number(r?.out_of_order ?? 0) });
  cached = { at: now, reading };
  return reading;
}

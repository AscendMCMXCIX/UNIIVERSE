import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";

/*
  Each stored game keeps a few figures from its stored match details (side, gold, wards, the
  team's kills and damage, the extra figures): copied once, when the details are stored, so Team
  Leaderboards and Played Together read plain columns instead of re-reading every match's JSON.
  A game is summarised as soon as its details exist, even if they have no entry for its player
  (an unavailable match): `summarised_at` says it was looked at, the figures stay empty.

  Safe to run at any time and as often as wanted: it only touches games still waiting, in
  bounded batches. No Riot request is involved.
*/

const BATCH = 2000;
/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export async function summariseMatches(db: Db, scope: { accountIds?: readonly string[]; matchIds?: readonly string[]; maxBatches?: number } = {}): Promise<number> {
  if (scope.accountIds?.length === 0 || scope.matchIds?.length === 0) return 0;
  const byAccount = scope.accountIds ? sql`AND am.account_id IN (${sql.join(scope.accountIds.map((id) => sql`${id}::uuid`), sql`, `)})` : sql``;
  const byMatch = scope.matchIds ? sql`AND am.match_id IN (${sql.join(scope.matchIds.map((id) => sql`${id}`), sql`, `)})` : sql``;
  let total = 0;
  for (let i = 0; i < (scope.maxBatches ?? 10); i++) {
    const result = await db.execute(sql`
      WITH todo AS (
        SELECT am.account_id, am.match_id, ra.puuid
        FROM account_matches am
        JOIN riot_accounts ra ON ra.id = am.account_id
        WHERE am.summarised_at IS NULL AND am.champion_id IS NOT NULL ${byAccount} ${byMatch}
          AND EXISTS (SELECT 1 FROM match_details md WHERE md.match_id = am.match_id)
        LIMIT ${BATCH}
      ),
      calc AS (
        SELECT t.account_id, t.match_id, d.team_id, d.gold, d.wards_placed, d.team_kills, d.team_damage, d.extra_stats
        FROM todo t
        LEFT JOIN LATERAL (
          SELECT NULLIF(p->>'teamId', '')::int AS team_id,
                 NULLIF(p->>'gold', '')::int AS gold,
                 NULLIF(p->>'wardsPlaced', '')::int AS wards_placed,
                 CASE WHEN jsonb_typeof(p->'stats') = 'object' AND p->'stats' <> '{}'::jsonb THEN p->'stats' END AS extra_stats,
                 -- A team with a "Removed player" (erased personal data) takes its kills from Riot's team total: the placeholder's figures are not real.
                 (SELECT CASE WHEN bool_or(q->>'removed' = 'true') THEN (SELECT NULLIF(t->'objectives'->>'champion', '')::int FROM jsonb_array_elements(md.teams) t WHERE t->>'teamId' = p->>'teamId' LIMIT 1) ELSE sum((q->>'kills')::int)::int END FROM jsonb_array_elements(md.participants) q WHERE q->>'teamId' = p->>'teamId') AS team_kills,
                 (SELECT CASE WHEN bool_and(q->>'damage' IS NOT NULL) THEN sum((q->>'damage')::bigint) END FROM jsonb_array_elements(md.participants) q WHERE q->>'teamId' = p->>'teamId') AS team_damage
          FROM match_details md, jsonb_array_elements(md.participants) p
          WHERE md.match_id = t.match_id AND t.puuid IS NOT NULL AND p->>'puuid' = t.puuid
          LIMIT 1
        ) d ON true
      )
      UPDATE account_matches am
      SET team_id = calc.team_id, gold = calc.gold, wards_placed = calc.wards_placed, team_kills = calc.team_kills, team_damage = calc.team_damage, extra_stats = calc.extra_stats, summarised_at = now()
      FROM calc
      WHERE am.account_id = calc.account_id AND am.match_id = calc.match_id
      RETURNING am.match_id`);
    const n = rowsOf<{ match_id: string }>(result).length;
    total += n;
    if (n < BATCH) break;
  }
  return total;
}

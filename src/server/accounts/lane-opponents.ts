import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { LANE_NAMES, laneOpponentOf, type LaneSeat } from "@/domain/match-analysis";

/*
  The stored lane opponents (`account_matches.enemy_champion_id`) against the one lane opponent
  rule (domain/match-analysis laneOpponentOf), over the player accounts' counted games whose match
  record is stored.

  Until 20 Nov 2026 the account sync stored the first enemy in the player's merged position, with
  no check that nobody else held it, while the champion window's lane figures demanded exactly one
  such enemy (mi-evidence F1, champions-matches AC-10). The sync now stores the rule's opponent;
  rows folded before are counted here, and repaired only by hand:
  - `laneOpponentAudit` (the read-only data-audit job): counts computed in the database, one row of
    counts leaves it. It reads the same rule in SQL (`ruleSql` below, over the same lane names);
    tests/db/lane-opponents.test.ts holds the two to the same answer on every case.
  - `recomputeLaneOpponents` (the `lane-opponent-recompute` job, a setup/repair job run by hand):
    the rule itself, in TypeScript, over every such row, writing only the rows whose stored
    opponent differs from it. Derived data only: no Riot request, no source data changed, so it can
    always be derived again from the records, and running it again changes nothing.

  A row is left as stored when its record no longer holds what its opponent was chosen from: a
  player in the game whose personal data was erased (a "Removed player" keeps no position), or no
  place in the record for the row's own player (neither its current PUUID, nor its champion on its
  side). Nothing about any player leaves the database except champions; counts only in the answers.
*/

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const n = (v: unknown) => Number(v ?? 0);

export interface LaneOpponentCounts {
  /** Player accounts' counted games whose match record is stored. */
  rows: number;
  /** Of them, records that keep Riot's two readings of each position (stored from 20 Nov 2026 on). */
  sourcePositions: number;
  /** Left as stored: a player in the game erased, or the row's own player not found in the record. */
  leftAsStored: number;
  /** Of the rest, games the rule names no opponent for ("lane opponent unclear"). */
  unclear: number;
  /**
   * Of the rest, games whose stored opponent differs from the rule's: `missing` none stored where
   * the rule names one, `unclear` one stored where the rule names none, `other` another champion.
   */
  disagree: { total: number; missing: number; unclear: number; other: number };
}

/** The lane name a stored position names, or NULL: domain/match-analysis LANE_NAMES as SQL (code constants only). */
function laneSql(position: SQL): SQL {
  const whens = Object.entries(LANE_NAMES).map(([name, lane]) => {
    if (!/^[A-Z]+$/.test(name) || !/^[A-Z]+$/.test(lane)) throw new Error("lane names must be capital letters");
    return `WHEN '${name}' THEN '${lane}'`;
  });
  return sql`(CASE ${position} ${sql.raw(whens.join(" "))} END)`;
}

/** The rows the rule is read over, with the record and the row's own player in it (`me`). */
const ROWS = sql`
  SELECT am.account_id, am.match_id, am.enemy_champion_id AS stored, d.participants AS parts, m.me,
    EXISTS (SELECT 1 FROM jsonb_array_elements(d.participants) x WHERE coalesce(x->>'removed', '') = 'true') AS has_removed,
    EXISTS (SELECT 1 FROM jsonb_array_elements(d.participants) x WHERE jsonb_typeof(x->'teamPosition') = 'string') AS sourced
  FROM account_matches am
  JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player'
  JOIN match_details d ON d.match_id = am.match_id
  LEFT JOIN LATERAL (
    -- The row's own player: its account's PUUID, else its champion on its side (a record kept under
    -- an earlier Riot key carries that key's ids); never a removed player.
    SELECT e.p AS me
    FROM jsonb_array_elements(d.participants) WITH ORDINALITY AS e(p, i)
    WHERE coalesce(e.p->>'removed', '') <> 'true'
      AND (coalesce(e.p->>'puuid' = a.puuid, false) OR (am.team_id IS NOT NULL AND e.p->>'championId' = am.champion_id AND e.p->>'teamId' = am.team_id::text))
    ORDER BY coalesce(e.p->>'puuid' = a.puuid, false) DESC, e.i
    LIMIT 1
  ) m ON true
  WHERE am.champion_id IS NOT NULL AND jsonb_typeof(d.participants) = 'array' AND jsonb_array_length(d.participants) > 0`;

/**
 * The rule in SQL, for the counts only (the TypeScript rule is the one that writes): which reading
 * the player's seat is compared on, the lane it names, and the one enemy holding it while the
 * player is the only one on their side to hold it.
 */
function ruleSql(): SQL {
  const reading = sql`CASE
      WHEN g.me IS NULL THEN NULL
      WHEN jsonb_typeof(g.me->'teamPosition') IS DISTINCT FROM 'string' THEN CASE WHEN ${laneSql(sql`g.me->>'position'`)} IS NOT NULL THEN 'position' END
      WHEN ${laneSql(sql`g.me->>'teamPosition'`)} IS NOT NULL THEN 'teamPosition'
      WHEN ${laneSql(sql`g.me->>'individualPosition'`)} IS NOT NULL THEN 'individualPosition'
    END`;
  return sql`
    WITH g AS (${ROWS}),
    r AS (SELECT g.*, ${reading} AS reading FROM g),
    l AS (SELECT r.*, ${laneSql(sql`(r.me->>r.reading)`)} AS lane FROM r)
    SELECT l.account_id, l.match_id, l.stored, l.has_removed, l.sourced, l.me IS NOT NULL AS found,
      CASE WHEN l.lane IS NULL THEN NULL ELSE (
        SELECT CASE WHEN count(*) FILTER (WHERE x->>'teamId' = l.me->>'teamId') = 1 AND count(*) FILTER (WHERE x->>'teamId' IS DISTINCT FROM l.me->>'teamId') = 1
                    THEN min(x->>'championId') FILTER (WHERE x->>'teamId' IS DISTINCT FROM l.me->>'teamId') END
        FROM jsonb_array_elements(l.parts) x
        WHERE coalesce(x->>'removed', '') <> 'true' AND ${laneSql(sql`(x->>l.reading)`)} = l.lane
      ) END AS rule
    FROM l`;
}

/** The stored lane opponents against the rule, counted in the database (read-only; data-audit). */
export async function laneOpponentAudit(db: Db): Promise<LaneOpponentCounts> {
  const [c] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      WITH o AS (${ruleSql()}), k AS (SELECT o.*, found AND NOT has_removed AS judged FROM o)
      SELECT count(*) AS rows,
        count(*) FILTER (WHERE sourced) AS source_positions,
        count(*) FILTER (WHERE NOT judged) AS left_as_stored,
        count(*) FILTER (WHERE judged AND rule IS NULL) AS unclear,
        count(*) FILTER (WHERE judged AND stored IS DISTINCT FROM rule) AS disagree,
        count(*) FILTER (WHERE judged AND stored IS NULL AND rule IS NOT NULL) AS disagree_missing,
        count(*) FILTER (WHERE judged AND stored IS NOT NULL AND rule IS NULL) AS disagree_unclear,
        count(*) FILTER (WHERE judged AND stored IS NOT NULL AND rule IS NOT NULL AND stored <> rule) AS disagree_other
      FROM k`),
  );
  return {
    rows: n(c?.rows),
    sourcePositions: n(c?.source_positions),
    leftAsStored: n(c?.left_as_stored),
    unclear: n(c?.unclear),
    disagree: { total: n(c?.disagree), missing: n(c?.disagree_missing), unclear: n(c?.disagree_unclear), other: n(c?.disagree_other) },
  };
}

/** Rows read and written per round trip by the recompute. */
const PAGE = 500;

type Part = [teamId: number, championId: string | null, position: string | null, teamPosition: string | null, individualPosition: string | null, removed: boolean, ownPuuid: boolean];
type Row = { account_id: string; match_id: string; champion_id: string; team_id: number | null; stored: string | null; parts: Part[] | string };

/** The rule's opponent (a champion) for one row, or "left" when the row is left as stored. */
export function ruleForRow(row: { championId: string; teamId: number | null; parts: readonly Part[] }): { opponent: string | null; sourced: boolean } | "left" {
  const seats: Array<LaneSeat & { championId: string | null }> = row.parts.map(([teamId, championId, position, teamPosition, individualPosition, removed]) => ({ teamId: Number(teamId), championId, position, teamPosition, individualPosition, removed }));
  const sourced = row.parts.some((p) => typeof p[3] === "string");
  if (row.parts.some((p) => p[5])) return "left";
  let me = row.parts.findIndex((p) => p[6] && !p[5]);
  if (me < 0 && row.teamId !== null) me = row.parts.findIndex((p) => !p[5] && p[1] === row.championId && Number(p[0]) === row.teamId);
  if (me < 0) return "left";
  const slot = laneOpponentOf(seats, me);
  return { opponent: slot === null ? null : (seats[slot]!.championId ?? null), sourced };
}

export interface LaneOpponentRecompute extends LaneOpponentCounts {
  /** Rows written (their stored opponent replaced by the rule's), by the same kinds as `disagree`. */
  changed: { total: number; missing: number; unclear: number; other: number };
  /** Rows that changed in the meantime (another write got there first): left for the next run. */
  skipped: number;
}

/**
 * Sets every stored lane opponent that differs from the rule to the rule's, page by page. Rows left
 * as stored are counted and not touched. A row is written only if it still holds the value read
 * (an account sync folding meanwhile wins), so it is safe beside the scheduler, and a second run
 * finds nothing to change. Counts only in its answer.
 */
export async function recomputeLaneOpponents(db: Db, options: { pageSize?: number } = {}): Promise<LaneOpponentRecompute> {
  const size = options.pageSize ?? PAGE;
  const out: LaneOpponentRecompute = { rows: 0, sourcePositions: 0, leftAsStored: 0, unclear: 0, disagree: { total: 0, missing: 0, unclear: 0, other: 0 }, changed: { total: 0, missing: 0, unclear: 0, other: 0 }, skipped: 0 };
  let after: { accountId: string; matchId: string } | null = null;
  for (;;) {
    const page: Row[] = rowsOf<Row>(
      await db.execute(sql`
        SELECT am.account_id, am.match_id, am.champion_id, am.team_id, am.enemy_champion_id AS stored,
          (SELECT json_agg(json_build_array((p->>'teamId')::int, p->>'championId', p->>'position', p->>'teamPosition', p->>'individualPosition', coalesce(p->>'removed', '') = 'true', coalesce(p->>'puuid' = a.puuid, false)) ORDER BY e.i)
             FROM jsonb_array_elements(d.participants) WITH ORDINALITY AS e(p, i)) AS parts
        FROM account_matches am
        JOIN riot_accounts a ON a.id = am.account_id AND a.owner_type = 'player'
        JOIN match_details d ON d.match_id = am.match_id
        WHERE am.champion_id IS NOT NULL AND jsonb_typeof(d.participants) = 'array' AND jsonb_array_length(d.participants) > 0
          ${after ? sql`AND (am.account_id, am.match_id) > (${after.accountId}::uuid, ${after.matchId})` : sql``}
        ORDER BY am.account_id, am.match_id
        LIMIT ${size}`),
    );
    if (!page.length) break;
    const writes: Array<{ accountId: string; matchId: string; was: string | null; next: string | null; kind: "missing" | "unclear" | "other" }> = [];
    for (const r of page) {
      out.rows += 1;
      const parts = (typeof r.parts === "string" ? JSON.parse(r.parts) : r.parts) as Part[];
      if (parts.some((p) => typeof p[3] === "string")) out.sourcePositions += 1;
      const rule = ruleForRow({ championId: r.champion_id, teamId: r.team_id === null ? null : Number(r.team_id), parts });
      if (rule === "left") {
        out.leftAsStored += 1;
        continue;
      }
      if (rule.opponent === null) out.unclear += 1;
      if (rule.opponent === r.stored) continue;
      const kind = r.stored === null ? "missing" : rule.opponent === null ? "unclear" : "other";
      out.disagree.total += 1;
      out.disagree[kind] += 1;
      writes.push({ accountId: r.account_id, matchId: r.match_id, was: r.stored, next: rule.opponent, kind });
    }
    if (writes.length) {
      const values = sql.join(
        writes.map((w) => sql`(${w.accountId}::uuid, ${w.matchId}::text, ${w.was}::text, ${w.next}::text)`),
        sql`, `,
      );
      const done = rowsOf<{ account_id: string; match_id: string }>(
        await db.execute(sql`
          UPDATE account_matches am SET enemy_champion_id = v.next_enemy
          FROM (VALUES ${values}) AS v(account_id, match_id, was_enemy, next_enemy)
          WHERE am.account_id = v.account_id AND am.match_id = v.match_id AND am.enemy_champion_id IS NOT DISTINCT FROM v.was_enemy
          RETURNING am.account_id, am.match_id`),
      );
      const written = new Set(done.map((d) => `${d.account_id}|${d.match_id}`));
      for (const w of writes) {
        if (written.has(`${w.accountId}|${w.matchId}`)) {
          out.changed.total += 1;
          out.changed[w.kind] += 1;
        } else out.skipped += 1;
      }
    }
    const last: Row = page[page.length - 1]!;
    after = { accountId: last.account_id, matchId: last.match_id };
    if (page.length < size) break;
  }
  return out;
}

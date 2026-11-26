import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { LANE_NAMES, LANE_ORDER } from "@/domain/match-analysis";
import { MAX_VALID_DURATION_S, MIN_VALID_DURATION_S } from "@/domain/season-stats";
import { BUILD_DIMS, BUILD_QUEUES, SKILL_POINTS_READ, START_MS, type BuildCountRow, type BuildDim, type BuildLane, type ItemClasses, type SkillRanks } from "@/domain/champion-builds";

/*
  The counts behind Champion Intel's builds (domain/champion-builds, docs/CHAMPION_INTEL.md "Builds
  and runes"): ONE statement per champion and patch window, inside the database, of which only
  totals leave it, about one row per counted value (a part, a patch, a lane, a value, its games,
  wins and team members' own games). No PUUID, name, match id or record ever leaves the database,
  and nothing about any one player is kept (the multikill comparison's rule, multikill-baseline.ts).

  - Which games: stored records (match_details) of Summoner's Rift draft games (BUILD_QUEUES) that a
    current team member played (an account_matches row of a linked account of a team member's
    profile that is not archived: a personal-use or archived profile's own games are never counted),
    remakes and broken durations left out; in them, every player on the champion (both teams), by
    Riot's position, except an erased one (`removed`).
  - Found by the records' champions alone (match_details_champions_idx), so only that champion's
    records are opened: the condition must stay the index's own expression with the champion bound
    (tests/db/champion-builds.test.ts checks the plan).
  - Each player's timeline entry (match_timelines.participants, matched by PUUID inside the database)
    gives the items and the skill order; the timeline's frames and events are never read.
  - The item rules (which purchases are boots, completed items or known at all) come from the
    static data as id lists (domain/champion-builds itemClasses); the skill rule needs each ability's
    ranks (null: no skill order is counted). The same rules as the domain's startingSet and
    skillMaxOrder, which the database tests hold this statement to.

  Postgres plans many more participants a record than the ten there are, which can put this over its
  JIT threshold; compiling would take longer than running it, so JIT is off for it (as for the
  multikill comparison).
*/

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parse = <T,>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

/** The lane a stored position names, or NULL: domain/match-analysis LANE_NAMES as SQL (code constants only). */
function laneSql(position: SQL): SQL {
  const whens = Object.entries(LANE_NAMES).map(([name, lane]) => {
    if (!/^[A-Z]+$/.test(name) || !/^[A-Z]+$/.test(lane)) throw new Error("lane names must be capital letters");
    return `WHEN '${name}' THEN '${lane}'`;
  });
  return sql`(CASE ${position} ${sql.raw(whens.join(" "))} END)`;
}

export interface BuildCountsInput {
  /** The champion's Data Dragon id, from the roster. */
  champion: string;
  /** The patches counted, internal names ("16.22"). */
  patches: readonly string[];
  items: ItemClasses;
  /** Each ability's ranks (1 Q … 4 R); null counts no skill order. */
  ranks: SkillRanks | null;
}

/** The counts of one champion on a patch window: totals only (domain/champion-builds BuildCountRow). */
export async function readBuildCounts(db: Db, input: BuildCountsInput): Promise<BuildCountRow[]> {
  if (!input.patches.length) return [];
  const patches = JSON.stringify(input.patches);
  const completed = JSON.stringify(input.items.completed);
  const boots = JSON.stringify(input.items.boots);
  const known = JSON.stringify(input.items.known);
  const ranks = input.ranks ? JSON.stringify({ 1: input.ranks[1], 2: input.ranks[2], 3: input.ranks[3], 4: input.ranks[4] }) : null;
  const queues = sql.raw(BUILD_QUEUES.map((q) => String(q)).join(", "));
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL jit = off`);
    return tx.execute(sql`
      WITH mem AS MATERIALIZED (
        SELECT ra.puuid FROM riot_accounts ra JOIN players pl ON pl.id = ra.player_id
        WHERE ra.owner_type = 'player' AND pl.team_member AND pl.archived_at IS NULL AND ra.puuid IS NOT NULL
      ),
      rec AS MATERIALIZED (
        SELECT d.match_id, d.queue_id, d.participants,
          (SELECT (m[1]::int)::text || '.' || (m[2]::int)::text FROM regexp_match(d.game_version, '^(\\d+)\\.(\\d+)') AS m) AS patch
        FROM match_details d
        WHERE jsonb_path_query_array(d.participants, '$[*].championId') ?| ARRAY[${input.champion}]::text[]
          AND d.queue_id IN (${queues})
          AND d.game_duration >= ${MIN_VALID_DURATION_S} AND d.game_duration <= ${MAX_VALID_DURATION_S}
          AND EXISTS (
            SELECT 1 FROM account_matches am
            JOIN riot_accounts ra ON ra.id = am.account_id AND ra.owner_type = 'player'
            JOIN players pl ON pl.id = ra.player_id AND pl.team_member AND pl.archived_at IS NULL
            WHERE am.match_id = d.match_id)
      ),
      g AS MATERIALIZED (
        SELECT r.match_id, r.queue_id, r.patch, p AS part, ${laneSql(sql`p->>'position'`)} AS lane,
          (p->>'win')::boolean AS win, coalesce(p->>'puuid', '') IN (SELECT puuid FROM mem) AS member
        FROM rec r CROSS JOIN LATERAL jsonb_array_elements(r.participants) AS p
        WHERE r.patch IN (SELECT jsonb_array_elements_text(${patches}::jsonb))
          AND p->>'championId' = ${input.champion} AND p->>'removed' IS NULL
      ),
      t AS (
        SELECT g.*, tp.x AS tl FROM g
        LEFT JOIN match_timelines mt ON mt.match_id = g.match_id
        LEFT JOIN LATERAL (SELECT x FROM jsonb_array_elements(mt.participants) AS x WHERE x->>'puuid' = g.part->>'puuid' AND g.part->>'puuid' <> '' LIMIT 1) AS tp(x) ON true
        WHERE g.lane IS NOT NULL
      ),
      b AS (
        SELECT t.*, pu.known_all,
          CASE WHEN pu.known_all THEN ARRAY(
            SELECT c.id FROM (
              SELECT e->>1 AS id, min(x.o) AS first FROM jsonb_array_elements(t.tl->'purchases') WITH ORDINALITY AS x(e, o)
              WHERE ${completed}::jsonb ? (e->>1) GROUP BY e->>1) AS c
            ORDER BY c.first LIMIT 5) END AS done5
        FROM t
        LEFT JOIN LATERAL (SELECT bool_and(${known}::jsonb ? (e->>1)) AS known_all FROM jsonb_array_elements(t.tl->'purchases') AS e) AS pu ON t.tl IS NOT NULL
      ),
      k AS (
        SELECT patch, queue_id, lane, win, member, tl IS NOT NULL AS has_tl,
          CASE WHEN jsonb_typeof(part->'runes'->'primaryPerks') = 'array' AND jsonb_array_length(part->'runes'->'primaryPerks') = 4
                AND jsonb_typeof(part->'runes'->'secondaryPerks') = 'array' AND jsonb_array_length(part->'runes'->'secondaryPerks') = 2
                AND part->'runes'->>'primary' IS NOT NULL AND part->'runes'->>'secondary' IS NOT NULL
            THEN concat(part->'runes'->>'primary', ':', (SELECT string_agg(v, ',' ORDER BY o) FROM jsonb_array_elements_text(part->'runes'->'primaryPerks') WITH ORDINALITY AS a(v, o)),
                        '|', part->'runes'->>'secondary', ':', (SELECT string_agg(v, ',' ORDER BY o) FROM jsonb_array_elements_text(part->'runes'->'secondaryPerks') WITH ORDINALITY AS a(v, o))) END AS runes,
          CASE WHEN jsonb_typeof(part->'runes'->'shards') = 'array' AND jsonb_array_length(part->'runes'->'shards') = 3
            THEN (SELECT string_agg(v, ',' ORDER BY o) FROM jsonb_array_elements_text(part->'runes'->'shards') WITH ORDINALITY AS a(v, o)) END AS shards,
          CASE WHEN jsonb_typeof(part->'spells') = 'array' AND jsonb_array_length(part->'spells') = 2 AND (part->'spells'->>0) ~ '^[0-9]+$' AND (part->'spells'->>1) ~ '^[0-9]+$'
            THEN least((part->'spells'->>0)::int, (part->'spells'->>1)::int)::text || ',' || greatest((part->'spells'->>0)::int, (part->'spells'->>1)::int)::text END AS spells,
          CASE WHEN tl IS NOT NULL AND ${ranks}::jsonb IS NOT NULL THEN (
            SELECT CASE WHEN count(*) FILTER (WHERE q.at IS NOT NULL) >= 1
                          AND count(DISTINCT q.pts) FILTER (WHERE q.at IS NULL) = count(*) FILTER (WHERE q.at IS NULL)
                          AND (SELECT count(*) FROM jsonb_array_elements_text(tl->'skills') AS f(v) WHERE f.v IN ('1', '2', '3', '4')) >= 3
                   THEN string_agg(q.k, '' ORDER BY q.at NULLS LAST, q.pts DESC) || '|' || (
                     SELECT translate(string_agg(f.v, '' ORDER BY f.o), '1234', 'QWER') FROM (
                       SELECT v, o FROM jsonb_array_elements_text(tl->'skills') WITH ORDINALITY AS a(v, o) WHERE v IN ('1', '2', '3', '4') ORDER BY o LIMIT 3) AS f) END
            FROM (
              SELECT s.k, count(x.v) AS pts, min(x.rn) FILTER (WHERE x.n = (${ranks}::jsonb->>s.slot)::int) AS at
              FROM (VALUES ('1', 'Q'), ('2', 'W'), ('3', 'E'), ('4', 'R')) AS s(slot, k)
              LEFT JOIN (
                SELECT y.v, y.rn, count(*) OVER (PARTITION BY y.v ORDER BY y.rn) AS n
                FROM (SELECT v, row_number() OVER (ORDER BY o) AS rn FROM jsonb_array_elements_text(tl->'skills') WITH ORDINALITY AS a(v, o) WHERE v IN ('1', '2', '3', '4')) AS y
                WHERE y.rn <= ${SKILL_POINTS_READ}) AS x ON x.v = s.slot
              WHERE s.slot <> '4' OR (${ranks}::jsonb->>'4')::int >= 5
              GROUP BY s.slot, s.k) AS q
          ) END AS skills,
          CASE WHEN known_all THEN (
            SELECT string_agg(z.id, ',' ORDER BY z.id::int) FROM (
              SELECT bo.id FROM (
                SELECT e->>1 AS id, count(*) AS c FROM jsonb_array_elements(tl->'purchases') AS e WHERE (e->>0)::bigint < ${START_MS} GROUP BY e->>1) AS bo
              LEFT JOIN (
                SELECT e->>1 AS id, count(*) AS c FROM jsonb_array_elements(CASE WHEN jsonb_typeof(tl->'sold') = 'array' THEN tl->'sold' ELSE '[]'::jsonb END) AS e WHERE (e->>0)::bigint < ${START_MS} GROUP BY e->>1) AS so ON so.id = bo.id
              CROSS JOIN LATERAL generate_series(1, (bo.c - coalesce(so.c, 0))::int) AS rep) AS z
          ) END AS start,
          CASE WHEN known_all THEN coalesce(
            (SELECT e->>1 FROM jsonb_array_elements(tl->'purchases') WITH ORDINALITY AS x(e, o) WHERE ${boots}::jsonb ? (e->>1) ORDER BY o LIMIT 1),
            CASE WHEN cardinality(done5) >= 3 THEN 'none' END) END AS boots,
          done5
        FROM b
      )
      SELECT coalesce(json_agg(json_build_array(dim, patch, lane, value, n, w, nm)), '[]') AS rows FROM (
        SELECT x.dim, k.patch, k.lane, x.value, count(*)::int AS n, (count(*) FILTER (WHERE k.win))::int AS w, (count(*) FILTER (WHERE k.member))::int AS nm
        FROM k CROSS JOIN LATERAL (VALUES
          ('games', ''), ('queue', k.queue_id::text), ('timeline', CASE WHEN k.has_tl THEN '' END),
          ('runes', k.runes), ('shards', k.shards), ('spells', k.spells), ('skills', k.skills),
          ('start', k.start), ('boots', k.boots),
          ('core', CASE WHEN cardinality(k.done5) >= 3 THEN array_to_string(k.done5[1:3], '>') END),
          ('fourth', CASE WHEN cardinality(k.done5) >= 4 THEN array_to_string(ARRAY(SELECT u FROM unnest(k.done5[1:3]) AS u ORDER BY u::int), ',') || '|' || k.done5[4] END),
          ('fifth', CASE WHEN cardinality(k.done5) >= 5 THEN array_to_string(ARRAY(SELECT u FROM unnest(k.done5[1:3]) AS u ORDER BY u::int), ',') || '|' || k.done5[5] END)
        ) AS x(dim, value)
        WHERE x.value IS NOT NULL
        GROUP BY x.dim, k.patch, k.lane, x.value) AS grouped`);
  });
  const [answer] = rowsOf<{ rows: unknown }>(result);
  type Row = [string, string, string, string, number, number, number];
  const lanes = new Set<string>(LANE_ORDER);
  const dims = new Set<string>(BUILD_DIMS);
  return parse<Row[]>(answer?.rows ?? [])
    .filter(([dim, patch, lane]) => dims.has(dim) && lanes.has(lane) && typeof patch === "string")
    .map(([dim, patch, lane, value, n, w, nm]) => ({ dim: dim as BuildDim, patch, lane: lane as BuildLane, value: String(value ?? ""), n: Number(n), w: Number(w), nm: Number(nm) }));
}

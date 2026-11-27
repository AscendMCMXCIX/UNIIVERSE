import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { LANE_NAMES } from "@/domain/match-analysis";
import { MAX_VALID_DURATION_S } from "@/domain/season-stats";
import { ROLE_TO_RIOT_POSITION, type Role } from "@/domain/roles";
import { LANE_MS, type LaneGameRow, type LaneSeries } from "@/domain/matchup/lane-evidence";
import { LANE_QUEUES } from "@/domain/matchup/queues";

/*
  The games behind Matchup Intel's "In the team's matches" (domain/matchup/lane-evidence,
  docs/MATCHUP_INTEL.md): ONE statement per pair of champions, role and season, every draft queue
  at once (each row carries its queue, and the domain never pools them). Inside the database it
  finds the records, seats the two champions by the one lane opponent rule and reads their two
  timeline entries; per game only anonymous numbers leave it: the patch, the queue, the result,
  whether a member held a seat, the first twelve frame times and the two seats' gold, experience
  and CS over them, the two seats' kill and death times before 10:00, every player's death times
  before 10:00 (for the shared-millisecond rule) and the two first-blood flags. No match id, PUUID,
  name or whole record ever leaves it (tests/db/lane-matchups.test.ts checks the answer's keys).

  - Which games: stored records (match_details) of the four draft queues that a current team member
    played (an account_matches row of a linked account of a team member's profile that is not
    archived: the builds' rule, server/champion-builds/query.ts), of the season (the game version's
    major), that lasted at least 10:00, found by the two champions alone
    (match_details_champions_idx, both ids among them: the index's own expression, so only those
    records are opened; the database test checks the plan).
  - The seats: the champion `lo` and the champion `hi` on opposite sides, each the other's lane
    opponent in the role by domain/match-analysis laneOpponentOf, written here in SQL from the same
    lane names: Riot's team position, else its individual position compared with everyone's; a
    record from before both were kept by its merged position, and then not with an erased seat in
    the game. An erased player (`removed`) is never a seat.
  - `lo` and `hi` are given by the caller (the two ids in the order JavaScript sorts them), never
    compared here: the database's collation may order them otherwise.
  JIT is off for it, as for the builds and the multikill comparison: compiling would take longer
  than running it over a few hundred records.
*/

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parse = <T,>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

/** A position's lane name, or NULL: domain/match-analysis LANE_NAMES as SQL (code constants only). */
function laneSql(position: SQL): SQL {
  const whens = Object.entries(LANE_NAMES).map(([name, lane]) => {
    if (!/^[A-Z]+$/.test(name) || !/^[A-Z]+$/.test(lane)) throw new Error("lane names must be capital letters");
    return `WHEN '${name}' THEN '${lane}'`;
  });
  return sql`(CASE ${position} ${sql.raw(whens.join(" "))} END)`;
}

export interface LaneGamesInput {
  /** The two champions' Data Dragon ids, `lo` the one JavaScript sorts first. */
  lo: string;
  hi: string;
  role: Role;
  /** The season (game-version major, 16 for 2026). */
  season: number;
}

/** The first frames read: 0 to 11, about eleven minutes (Riot's frames are about a minute apart). */
const FRAMES_READ = 12;

/** The games of one pairing in one role and season, every draft queue, anonymous numbers only. */
export async function readLaneGames(db: Db, input: LaneGamesInput): Promise<LaneGameRow[]> {
  if (!(input.lo < input.hi)) throw new Error("lo must sort before hi");
  const lane = LANE_NAMES[ROLE_TO_RIOT_POSITION[input.role]];
  if (!lane) return [];
  const queues = sql.raw(LANE_QUEUES.map((q) => String(q)).join(", "));
  const prefix = `${Math.trunc(input.season)}.%`;
  const minDuration = Math.ceil(LANE_MS / 1000);
  const frames = sql.raw(`'$[0 to ${FRAMES_READ - 1}]'`);
  /** The lane a seat holds under `reading` (another seat's reading, for the rule's count). */
  const laneUnder = (reading: SQL, seat: string) => sql`(CASE ${reading} WHEN 'tp' THEN ${sql.raw(seat)}.tp WHEN 'ip' THEN ${sql.raw(seat)}.ip ELSE ${sql.raw(seat)}.pos END)`;
  /** x's lane opponent is y, in the role, by x's reading (laneOpponentOf). */
  const opponentIs = (x: string, y: string) => {
    const r = sql.raw(`${x}.reading`);
    return sql`${r} IS NOT NULL AND ${laneUnder(r, x)} = ${lane} AND ${laneUnder(r, y)} = ${lane}
      AND (${r} = 'tp' OR NOT ${sql.raw(`${x}.any_removed`)})
      AND (SELECT count(*) FROM sr q WHERE q.match_id = ${sql.raw(x)}.match_id AND NOT q.removed AND q.team = ${sql.raw(x)}.team AND ${laneUnder(r, "q")} = ${lane}) = 1
      AND (SELECT count(*) FROM sr q WHERE q.match_id = ${sql.raw(x)}.match_id AND NOT q.removed AND q.team <> ${sql.raw(x)}.team AND ${laneUnder(r, "q")} = ${lane}) = 1`;
  };
  const series = (seat: string) => sql`CASE WHEN t.frames->'p'->(${sql.raw(seat)}->>'puuid') IS NOT NULL THEN jsonb_build_object(
      'g', jsonb_path_query_array(t.frames->'p'->(${sql.raw(seat)}->>'puuid')->'g', ${frames}),
      'x', jsonb_path_query_array(t.frames->'p'->(${sql.raw(seat)}->>'puuid')->'x', ${frames}),
      'c', jsonb_path_query_array(t.frames->'p'->(${sql.raw(seat)}->>'puuid')->'c', ${frames})) END`;
  const before10 = (entry: string, key: "kills" | "deaths") => {
    const list = sql.raw(`${entry}->'${key}'`);
    return sql`CASE WHEN jsonb_typeof(${list}) = 'array' THEN (SELECT coalesce(jsonb_agg(v ORDER BY (v #>> '{}')::bigint), '[]'::jsonb) FROM jsonb_array_elements(${list}) AS v WHERE jsonb_typeof(v) = 'number' AND (v #>> '{}')::bigint < ${LANE_MS}) END`;
  };
  const firstBlood = (seat: string) => sql`CASE WHEN jsonb_typeof(${sql.raw(seat)}->'stats') = 'object' THEN coalesce((${sql.raw(seat)}->'stats'->>'firstBloodKill')::boolean, false) END`;
  const isMember = (seat: string) => sql`EXISTS (SELECT 1 FROM riot_accounts ra JOIN players pl ON pl.id = ra.player_id WHERE ra.owner_type = 'player' AND pl.team_member AND pl.archived_at IS NULL AND ra.puuid = ${sql.raw(seat)}->>'puuid' AND ${sql.raw(seat)}->>'puuid' <> '')`;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL jit = off`);
    return tx.execute(sql`
      WITH lane_rec AS MATERIALIZED (
        SELECT d.match_id, d.queue_id, d.participants,
          (SELECT (m[1]::int)::text || '.' || (m[2]::int)::text FROM regexp_match(d.game_version, '^(\\d+)\\.(\\d+)') AS m) AS patch
        FROM match_details d
        WHERE jsonb_path_query_array(d.participants, '$[*].championId') ?& ARRAY[${input.lo}, ${input.hi}]::text[]
          AND d.queue_id IN (${queues})
          AND d.game_version LIKE ${prefix}
          AND d.game_duration >= ${minDuration} AND d.game_duration <= ${MAX_VALID_DURATION_S}
          AND EXISTS (
            SELECT 1 FROM account_matches am
            JOIN riot_accounts ra ON ra.id = am.account_id AND ra.owner_type = 'player'
            JOIN players pl ON pl.id = ra.player_id AND pl.team_member AND pl.archived_at IS NULL
            WHERE am.match_id = d.match_id)
      ),
      s AS MATERIALIZED (
        SELECT r.match_id, r.queue_id, r.patch, e.p,
          e.p->>'teamId' AS team, e.p->>'championId' AS champ, (e.p->>'removed') IS NOT NULL AS removed,
          jsonb_typeof(e.p->'teamPosition') = 'string' AS has_tp,
          ${laneSql(sql`e.p->>'teamPosition'`)} AS tp, ${laneSql(sql`e.p->>'individualPosition'`)} AS ip, ${laneSql(sql`e.p->>'position'`)} AS pos,
          bool_or((e.p->>'removed') IS NOT NULL) OVER (PARTITION BY r.match_id) AS any_removed
        FROM lane_rec r CROSS JOIN LATERAL jsonb_array_elements(r.participants) AS e(p)
      ),
      sr AS MATERIALIZED (
        SELECT s.*, CASE WHEN s.has_tp THEN CASE WHEN s.tp IS NOT NULL THEN 'tp' WHEN s.ip IS NOT NULL THEN 'ip' END WHEN s.pos IS NOT NULL THEN 'pos' END AS reading FROM s
      ),
      pair AS (
        SELECT a.match_id, a.queue_id, a.patch, a.p AS ap, b.p AS bp
        FROM sr a JOIN sr b ON b.match_id = a.match_id AND b.team IS DISTINCT FROM a.team
        WHERE a.champ = ${input.lo} AND b.champ = ${input.hi} AND NOT a.removed AND NOT b.removed
          AND ${opponentIs("a", "b")} AND ${opponentIs("b", "a")}
      )
      SELECT coalesce(json_agg(json_build_object(
        'patch', x.patch, 'queue', x.queue_id, 'loWon', x.lo_won, 'member', x.member,
        't', x.t, 'lo', x.lo, 'hi', x.hi, 'loKills', x.lo_kills, 'loDeaths', x.lo_deaths, 'hiKills', x.hi_kills, 'hiDeaths', x.hi_deaths,
        'deaths', x.deaths, 'loFirstBlood', x.lo_fb, 'hiFirstBlood', x.hi_fb)), '[]') AS games
      FROM (
        SELECT pair.patch, pair.queue_id, (pair.ap->>'win')::boolean AS lo_won,
          (${isMember("pair.ap")} OR ${isMember("pair.bp")}) AS member,
          CASE WHEN jsonb_typeof(t.frames->'t') = 'array' THEN jsonb_path_query_array(t.frames->'t', ${frames}) END AS t,
          ${series("pair.ap")} AS lo, ${series("pair.bp")} AS hi,
          ${before10("ta.x", "kills")} AS lo_kills, ${before10("ta.x", "deaths")} AS lo_deaths,
          ${before10("tb.x", "kills")} AS hi_kills, ${before10("tb.x", "deaths")} AS hi_deaths,
          CASE WHEN t.participants IS NOT NULL THEN (
            SELECT coalesce(jsonb_agg(v), '[]'::jsonb) FROM jsonb_array_elements(t.participants) AS o(x)
            CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.x->'deaths') = 'array' THEN o.x->'deaths' ELSE '[]'::jsonb END) AS v
            WHERE jsonb_typeof(v) = 'number' AND (v #>> '{}')::bigint < ${LANE_MS}) END AS deaths,
          ${firstBlood("pair.ap")} AS lo_fb, ${firstBlood("pair.bp")} AS hi_fb
        FROM pair
        LEFT JOIN match_timelines t ON t.match_id = pair.match_id
        LEFT JOIN LATERAL (SELECT ea.e FROM jsonb_array_elements(t.participants) AS ea(e) WHERE ea.e->>'puuid' = pair.ap->>'puuid' LIMIT 1) AS ta(x) ON true
        LEFT JOIN LATERAL (SELECT eb.e FROM jsonb_array_elements(t.participants) AS eb(e) WHERE eb.e->>'puuid' = pair.bp->>'puuid' LIMIT 1) AS tb(x) ON true
      ) AS x`);
  });
  const [answer] = rowsOf<{ games: unknown }>(result);
  const nums = (v: unknown): number[] | null => (Array.isArray(v) && v.every((n) => typeof n === "number") ? (v as number[]) : null);
  const ser = (v: unknown): LaneSeries | null => {
    const o = v as { g?: unknown; x?: unknown; c?: unknown } | null;
    const g = nums(o?.g);
    const x = nums(o?.x);
    const c = nums(o?.c);
    return g && x && c ? { g, x, c } : null;
  };
  type Raw = Record<keyof LaneGameRow, unknown>;
  return parse<Raw[]>(answer?.games ?? [])
    .filter((r) => typeof r.patch === "string" && typeof r.queue === "number")
    .map((r) => ({
      patch: r.patch as string,
      queue: r.queue as number,
      loWon: r.loWon === true,
      member: r.member === true,
      t: nums(r.t),
      lo: ser(r.lo),
      hi: ser(r.hi),
      loKills: nums(r.loKills),
      loDeaths: nums(r.loDeaths),
      hiKills: nums(r.hiKills),
      hiDeaths: nums(r.hiDeaths),
      deaths: nums(r.deaths),
      loFirstBlood: typeof r.loFirstBlood === "boolean" ? r.loFirstBlood : null,
      hiFirstBlood: typeof r.hiFirstBlood === "boolean" ? r.hiFirstBlood : null,
    }));
}

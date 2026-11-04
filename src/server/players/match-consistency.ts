import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { CONTRADICTION_MIN } from "@/domain/match-analysis";

/*
  How each stored game's record and its timeline agree (counts only, nobody named; run by the
  read-only data audit). Match History reads the scoreboard, the Analysis and the cards from the
  record and draws the Timeline from the timeline, so the two must describe the same game: for
  every stored timeline with frames, each player's gold and CS at the last frame (the end of the
  game, where Riot reads goldEarned) against the record, the gold difference at the end against
  the teams' recorded gold, each player's kills on the timeline against the record, and the
  towers, dragons and barons each side took. Computed in the database: one row of counts leaves it.
*/

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const n = (v: unknown) => Number(v ?? 0);

export interface MatchViewConsistency {
  /** Stored timelines with frames, joined to their game's record. */
  timelines: number;
  /** Of them, games of two teams of five with every player's frames (the gold difference can be drawn). */
  complete: number;
  /** Complete games whose gold difference at the end points the other way from the recorded gold, both by CONTRADICTION_MIN or more (the Timeline does not draw these). */
  contradicting: number;
  /** The largest and the median gap between the two, in gold, over complete games. */
  largestGap: number;
  medianGap: number;
  /** Players whose gold at the last frame is more than 5% (and 100 gold) from their recorded gold. */
  playersGoldOff: number;
  /** Players whose CS at the last frame is more than 5 from their recorded CS. */
  playersCsOff: number;
  /** Players whose kills on the timeline differ from their recorded kills (timelines that keep kill times only). */
  playersKillsOff: number;
  /** Games whose timeline keeps objectives, and of them those where a side's towers, dragons (with the Elder) or barons differ from the record. */
  withObjectives: number;
  objectivesOff: number;
}

export async function matchViewConsistency(db: Db): Promise<MatchViewConsistency> {
  // Each stored timeline is read once: its players' last frames (jsonb_each) and kill times are
  // unpacked per game and joined to the record's players by PUUID.
  const [g] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      WITH timelines AS (
        SELECT match_id, frames, participants FROM match_timelines
        WHERE jsonb_typeof(frames->'t') = 'array' AND jsonb_array_length(frames->'t') > 0
      ),
      at_end AS (
        SELECT t.match_id, f.key AS puuid, (f.value->'g'->>-1)::numeric AS gold, (f.value->'c'->>-1)::numeric AS cs
        FROM timelines t CROSS JOIN LATERAL jsonb_each(t.frames->'p') f
      ),
      kill_times AS (
        SELECT t.match_id, tp->>'puuid' AS puuid, max(jsonb_array_length(tp->'kills')) AS kills
        FROM timelines t CROSS JOIN LATERAL jsonb_array_elements(t.participants) tp
        WHERE jsonb_typeof(tp->'kills') = 'array'
        GROUP BY 1, 2
      ),
      p AS (
        SELECT d.match_id, (x->>'teamId')::int AS team,
          NULLIF(x->>'gold', '')::numeric AS gold, NULLIF(x->>'cs', '')::numeric AS cs, NULLIF(x->>'kills', '')::int AS kills,
          e.gold AS end_gold, e.cs AS end_cs, k.kills AS timeline_kills
        FROM match_details d
        CROSS JOIN LATERAL jsonb_array_elements(d.participants) x
        LEFT JOIN at_end e ON e.match_id = d.match_id AND e.puuid = x->>'puuid'
        LEFT JOIN kill_times k ON k.match_id = d.match_id AND k.puuid = x->>'puuid'
        WHERE d.match_id IN (SELECT match_id FROM timelines)
          AND coalesce(x->>'removed', '') <> 'true' AND coalesce(x->>'puuid', '') <> ''
      ),
      games AS (
        SELECT match_id, count(*) AS players, count(end_gold) AS framed, count(DISTINCT team) AS teams,
          sum(CASE WHEN team = 100 THEN gold ELSE -gold END) AS recorded,
          sum(CASE WHEN team = 100 THEN end_gold ELSE -end_gold END) AS at_end,
          count(*) FILTER (WHERE end_gold IS NOT NULL AND gold IS NOT NULL AND abs(end_gold - gold) > greatest(100, gold * 0.05)) AS gold_off,
          count(*) FILTER (WHERE end_cs IS NOT NULL AND cs IS NOT NULL AND abs(end_cs - cs) > 5) AS cs_off,
          count(*) FILTER (WHERE timeline_kills IS NOT NULL AND kills IS NOT NULL AND timeline_kills <> kills) AS kills_off
        FROM p GROUP BY match_id
      ),
      complete AS (SELECT * FROM games WHERE players = 10 AND framed = 10 AND teams = 2 AND recorded IS NOT NULL)
      SELECT (SELECT count(*) FROM games) AS timelines,
        (SELECT count(*) FROM complete) AS complete,
        (SELECT count(*) FROM complete WHERE sign(recorded) <> sign(at_end) AND least(abs(recorded), abs(at_end)) >= ${CONTRADICTION_MIN}) AS contradicting,
        (SELECT coalesce(max(abs(recorded - at_end)), 0) FROM complete) AS largest_gap,
        (SELECT coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY abs(recorded - at_end)), 0) FROM complete) AS median_gap,
        (SELECT coalesce(sum(gold_off), 0) FROM games) AS gold_off,
        (SELECT coalesce(sum(cs_off), 0) FROM games) AS cs_off,
        (SELECT coalesce(sum(kills_off), 0) FROM games) AS kills_off`),
  );
  // Each side's towers, dragons (with the Elder) and barons: the timeline's objectives counted once
  // per game and side, against the record's team objectives (a side that took none has no row).
  const [o] = rowsOf<Record<string, unknown>>(
    await db.execute(sql`
      WITH taken AS (
        SELECT t.match_id, (e->>'team')::int AS team,
          count(*) FILTER (WHERE e->>'kind' = 'tower') AS tower,
          count(*) FILTER (WHERE e->>'kind' IN ('dragon', 'elder')) AS dragon,
          count(*) FILTER (WHERE e->>'kind' = 'baron') AS baron
        FROM match_timelines t CROSS JOIN LATERAL jsonb_array_elements(t.events->'objectives') e
        WHERE jsonb_typeof(t.events->'objectives') = 'array'
        GROUP BY 1, 2
      ),
      sides AS (
        SELECT d.match_id, (team->>'teamId')::int AS team, team->'objectives' AS recorded
        FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.teams) team
        WHERE d.match_id IN (SELECT match_id FROM match_timelines WHERE jsonb_typeof(events->'objectives') = 'array')
          AND jsonb_typeof(team->'objectives') = 'object' AND team->'objectives' <> '{}'::jsonb
      ),
      cmp AS (
        SELECT s.match_id,
          coalesce((s.recorded->>'tower')::int, 0) <> coalesce(k.tower, 0)
          OR coalesce((s.recorded->>'dragon')::int, 0) <> coalesce(k.dragon, 0)
          OR coalesce((s.recorded->>'baron')::int, 0) <> coalesce(k.baron, 0) AS off
        FROM sides s LEFT JOIN taken k ON k.match_id = s.match_id AND k.team = s.team
      )
      SELECT count(DISTINCT match_id) AS games, count(DISTINCT match_id) FILTER (WHERE off) AS off FROM cmp`),
  );
  return {
    timelines: n(g?.timelines),
    complete: n(g?.complete),
    contradicting: n(g?.contradicting),
    largestGap: Math.round(n(g?.largest_gap)),
    medianGap: Math.round(n(g?.median_gap)),
    playersGoldOff: n(g?.gold_off),
    playersCsOff: n(g?.cs_off),
    playersKillsOff: n(g?.kills_off),
    withObjectives: n(o?.games),
    objectivesOff: n(o?.off),
  };
}

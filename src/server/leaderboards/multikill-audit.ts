import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { getOrCreateTeam } from "@/server/repositories/team";
import { loadCountingReading } from "@/server/accounts/multikill-counting";
import { buildMultikillBoard, multikillCountsOf, seasonGames, type MultikillBoard } from "@/domain/leaderboard-records";
import { buildMultikillBaseline } from "@/domain/multikill-score";
import { KILLS_CAP, PACE_EDGES, auditSummary, evaluateMultikillModels, type AuditAggregates, type AuditMember, type Evaluation, type MultikillAuditSummary } from "@/domain/multikill-models";
import { readBaseline } from "./multikill-baseline";
import { activePlayerIds, recordsSeason } from "./recent-view";
import { readLeaderboardSnapshot } from "./service";

/*
  The multikill score's fairness check on the stored games (domain/multikill-models; Data jobs
  `multikill-audit`, read only, by hand). The board exactly as the page builds it (the same members,
  games, comparison and counting rule), and one statement over the players' multikill counters
  (match_multikills, migration 0070): aggregates of the comparison players by position, by own kills,
  queue and game pace, the other players in each member's own games, and each member game's lane
  opponent as cells with no identity. Nothing is written; no PUUID, name or match id leaves the
  statement (members are numbers, games come back in the order they were asked for); the printed
  summary holds anonymous aggregates only.
*/

/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parse = <T,>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export interface AuditStatementAnswer {
  aggregates: AuditAggregates;
  /** For each asked game, in the order asked: both sides' champion kills (null when unknown) and its split-half half. */
  games: Array<{ gameKills: number | null; half: 0 | 1 }>;
  /** The answer's size as text, KB. */
  kb: number;
}

/**
 * The audit's one statement. `matchIds`: the season's member games; `members`: each member account's
 * PUUID with its member's index (every member's accounts, so the comparison leaves them all out, as
 * the page's does); `nested`: the counting rule (each multikill once, at its largest).
 */
export async function readMultikillAudit(db: Db, matchIds: readonly string[], members: ReadonlyArray<{ puuid: string; member: number }>, nested: boolean): Promise<AuditStatementAnswer> {
  const asked = matchIds.filter((m) => m && !m.includes(","));
  const ids = asked.join(",");
  const own = members.filter((m) => m.puuid && !m.puuid.includes(","));
  const puuids = own.map((m) => m.puuid).join(",");
  const owners = own.map((m) => String(m.member)).join(",");
  const points = sql.raw(nested ? "2 * greatest(mm.doubles - mm.triples, 0) + 3 * greatest(mm.triples - mm.quadras, 0) + 4 * greatest(mm.quadras - mm.pentas, 0) + 5 * mm.pentas" : "2 * mm.doubles + 3 * mm.triples + 4 * mm.quadras + 5 * mm.pentas");
  const cap = sql.raw(String(KILLS_CAP));
  const edges = PACE_EDGES.join(",");
  const result = await db.transaction(async (tx) => {
    // As for the comparison's earlier statement: Postgres may plan this over its JIT threshold, and compiling would take longer than running it.
    await tx.execute(sql`SET LOCAL jit = off`);
    return tx.execute(sql`
      WITH ids AS (SELECT u.id AS match_id, u.ord FROM unnest(string_to_array(${ids}, ',')) WITH ORDINALITY AS u(id, ord)),
      e AS MATERIALIZED (
        SELECT mm.match_id, mm.position, mm.champion_id AS champion, mm.team_id AS side, mm.kills, mm.queue_id, mm.duration_s, mm.team_kills,
          (string_to_array(${owners}, ','))[array_position(string_to_array(${puuids}, ','), mm.puuid)]::int AS member,
          ${points} AS pts
        FROM match_multikills mm WHERE mm.match_id = ANY (string_to_array(${ids}, ','))
      ),
      g AS (
        SELECT match_id, CASE WHEN count(DISTINCT side) = 2 THEN sum(team_kills)::int END AS game_kills
        FROM (SELECT DISTINCT match_id, side, team_kills FROM e WHERE side IS NOT NULL AND team_kills IS NOT NULL) s GROUP BY match_id
      ),
      eg AS MATERIALIZED (SELECT e.*, g.game_kills, get_byte(decode(md5(e.match_id), 'hex'), 0) % 2 AS half FROM e LEFT JOIN g USING (match_id)),
      pace AS (SELECT avg(game_kills - kills)::float8 AS mean FROM eg WHERE member IS NULL AND game_kills IS NOT NULL AND kills IS NOT NULL),
      ob AS MATERIALIZED (
        SELECT eg.*, least(greatest(eg.kills, 0), ${cap}) AS kc,
          CASE WHEN eg.game_kills IS NOT NULL AND eg.kills IS NOT NULL AND (SELECT mean FROM pace) > 0
            THEN width_bucket((eg.game_kills - eg.kills) / (SELECT mean FROM pace), string_to_array(${edges}, ',')::float8[]) END AS pb
        FROM eg WHERE eg.member IS NULL
      ),
      m AS (SELECT * FROM eg WHERE member IS NOT NULL)
      SELECT
        (SELECT mean FROM pace) AS pace_mean,
        (SELECT coalesce(json_agg(json_build_array(position, kc, games, pts)), '[]') FROM (
           SELECT position, kc, count(*)::int AS games, sum(pts)::int AS pts FROM ob WHERE kc IS NOT NULL GROUP BY 1, 2) a) AS by_kills,
        (SELECT coalesce(json_agg(json_build_array(position, queue_id, games, pts, seconds)), '[]') FROM (
           SELECT position, queue_id, count(*)::int AS games, sum(pts)::int AS pts, sum(duration_s)::bigint AS seconds FROM ob GROUP BY 1, 2) a) AS by_queue,
        (SELECT coalesce(json_agg(json_build_array(position, pb, games, pts)), '[]') FROM (
           SELECT position, pb, count(*)::int AS games, sum(pts)::int AS pts FROM ob WHERE pb IS NOT NULL GROUP BY 1, 2) a) AS by_pace,
        (SELECT coalesce(json_agg(json_build_array(member, ally, position, champion, games, pts)), '[]') FROM (
           SELECT m.member, (ob.side = m.side) AS ally, ob.position, ob.champion, count(*)::int AS games, sum(ob.pts)::int AS pts
           FROM m JOIN ob ON ob.match_id = m.match_id WHERE m.side IS NOT NULL AND ob.side IS NOT NULL GROUP BY 1, 2, 3, 4) a) AS own_games,
        (SELECT coalesce(json_agg(json_build_array(member, half, position, champion, kc, queue_id, pb, minutes, games, pts, pts2)), '[]') FROM (
           SELECT m.member, m.half, ob.position, ob.champion, ob.kc, ob.queue_id, ob.pb, round(ob.duration_s / 60.0)::int AS minutes,
             count(*)::int AS games, sum(ob.pts)::int AS pts, sum(ob.pts * ob.pts)::int AS pts2
           FROM m JOIN ob ON ob.match_id = m.match_id AND ob.side <> m.side AND ob.position = m.position
           GROUP BY 1, 2, 3, 4, 5, 6, 7, 8) a) AS opponents,
        (SELECT coalesce(json_agg(json_build_array(g.game_kills, get_byte(decode(md5(ids.match_id), 'hex'), 0) % 2) ORDER BY ids.ord), '[]')
           FROM ids LEFT JOIN g ON g.match_id = ids.match_id) AS games`);
  });
  const [row] = rowsOf<Record<string, unknown>>(result);
  const kb = Math.round(JSON.stringify(row ?? {}).length / 102.4) / 10;
  type Cells = unknown[][];
  const list = (k: string) => parse<Cells>(row?.[k] ?? []);
  const text = (v: unknown) => (v === null || v === undefined ? null : String(v));
  const gamesAsked = list("games").map(([k, h]) => ({ gameKills: num(k), half: (Number(h) === 1 ? 1 : 0) as 0 | 1 }));
  return {
    aggregates: {
      paceMean: num(row?.pace_mean),
      byKills: list("by_kills").map(([position, kills, games, points]) => ({ position: text(position), kills: Number(kills), games: Number(games), points: Number(points) })),
      byQueue: list("by_queue").map(([position, queueId, games, points, seconds]) => ({ position: text(position), queueId: num(queueId), games: Number(games), points: Number(points), seconds: Number(seconds) })),
      byPace: list("by_pace").map(([position, bucket, games, points]) => ({ position: text(position), bucket: Number(bucket), games: Number(games), points: Number(points) })),
      ownGames: list("own_games").map(([member, ally, position, championId, games, points]) => ({ member: Number(member), ally: ally === true || ally === "t", position: text(position), championId: text(championId), games: Number(games), points: Number(points) })),
      opponents: list("opponents").map(([member, half, position, championId, kills, queueId, bucket, minutes, games, points, pointsSq]) => ({ member: Number(member), half: (Number(half) === 1 ? 1 : 0) as 0 | 1, position: text(position), championId: text(championId), kills: num(kills), queueId: num(queueId), bucket: num(bucket), minutes: Number(minutes), games: Number(games), points: Number(points), pointsSq: Number(pointsSq) })),
    },
    games: asked.length === matchIds.length ? gamesAsked : matchIds.map(() => ({ gameKills: null, half: 0 as const })),
    kb,
  };
}

export interface MultikillAuditRun {
  summary: MultikillAuditSummary;
  /** Internal: each model's scores per ranked member (never printed; the tests compare M0 with the page's board). */
  evaluation: Evaluation;
  /** The ranked members' player ids, in the evaluation's order (internal only). */
  rankedIds: string[];
  board: MultikillBoard;
}

/** The whole check: the board as the page builds it, the audit's statement, every model and the anonymous summary. */
export async function runMultikillAudit(db: Db, options: { now?: Date } = {}): Promise<MultikillAuditRun> {
  const started = performance.now();
  const team = await getOrCreateTeam(db);
  const snap = await readLeaderboardSnapshot(db, team.id);
  const now = options.now ?? new Date();
  const season = recordsSeason(snap, {});
  const season_ = seasonGames(snap.games, season);
  const matchIds = [...new Set(season_.map((g) => g.matchId))].sort();
  const reading = await loadCountingReading(db);
  const rows = matchIds.length ? await readBaseline(db, matchIds, snap.memberPuuids ?? []) : [];
  const names = new Map(snap.players.map((p) => [p.id, p.name]));
  const allIds = snap.players.map((p) => p.id);
  // The board exactly as the page builds it (its active players, its comparison or the team's own games when under 1,000).
  const board = buildMultikillBoard({ games: snap.games, playerIds: allIds, visible: activePlayerIds(snap, now), season, baseline: buildMultikillBaseline(rows, reading.evidence), nameOf: (id) => names.get(id) ?? "" });
  const rankedIds = board.rows.filter((r) => r.status === "ranked").map((r) => r.playerId);
  const indexOf = new Map(allIds.map((id, i) => [id, i]));
  const accounts = snap.memberAccounts.flatMap((a) => (indexOf.has(a.playerId) ? [{ puuid: a.puuid, member: indexOf.get(a.playerId)! }] : []));
  const dbStart = performance.now();
  const answer = await readMultikillAudit(db, matchIds, accounts, board.baseline.reading.rule === "nested");
  const databaseMs = performance.now() - dbStart;
  const computeStart = performance.now();
  const byMatch = new Map(matchIds.map((id, i) => [id, answer.games[i]!]));
  const members: AuditMember[] = rankedIds.map((id) => ({
    id,
    index: indexOf.get(id)!,
    games: season_.flatMap((g) => {
      if (g.playerId !== id) return [];
      const counts = multikillCountsOf(g);
      if (!counts) return [];
      const m = byMatch.get(g.matchId);
      return [{ role: g.role, championId: g.championId, counts, queueId: g.queueId, kills: g.kills, durationS: g.durationS, gameKills: m?.gameKills ?? null, half: m?.half ?? 0 }];
    }),
  }));
  const evaluation = evaluateMultikillModels({ baseline: board.baseline, aggregates: answer.aggregates, members });
  const computeMs = performance.now() - computeStart;
  const summary = auditSummary(evaluation, {
    season,
    counting: board.baseline.reading.shown ? board.baseline.reading.rule : "assumed nested",
    cost: { totalMs: Math.round(performance.now() - started), databaseMs: Math.round(databaseMs), computeMs: Math.round(computeMs), answerKb: answer.kb },
  });
  return { summary, evaluation, rankedIds, board };
}

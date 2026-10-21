import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { FIRST_SEASON } from "@/domain/season";
import { SEASON_MODES, seasonModeInfo, type SeasonMode } from "@/domain/season-stats";
import { INSIGHT_MIN_GAMES, type EncounterGame, type EncounterInsight, type EncounterRelation, type EncounterSort, type EncounterSummary, type WinLoss } from "@/domain/encounters";

/*
  A player's Encounters (their profile → Match History → Players met): the other players in that
  player's own recorded games, how often they met, on which side, and the player's results with
  and against them. Stored data only, no Riot request.

  Which games: exactly the ones Match History lists for the same season, game mode and account
  (account_matches with a champion, one per match however many of the player's accounts stored it,
  the season read from the patch). Who: anyone with a recorded Riot ID in those games' stored
  details who is not linked to a UNIIVERSE profile (teammates are in Team → Matches → Played
  together). A player is identified by their account, never by name; the name shown is the most
  recently recorded one, and the account (PUUID) never leaves the database: the page gets an
  opaque key computed there (the same key as the earlier Team Encounters).

  Everything is counted in the database, for this one player's games, and only the page of
  players shown (and four highlights) is sent back: a few kilobytes whatever the history's size.
*/

const list = (ids: readonly string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

/**
 * Joined to account_matches am: pv.season, the season of the game's patch as seasonOfPatch reads
 * it ("16.20" and its public name "26.20" are 16; anything unreadable is null).
 */
const SEASON_OF_PATCH = sql`CROSS JOIN LATERAL (
  SELECT CASE WHEN major >= 25 THEN major - 10 ELSE major END AS season
  FROM (SELECT substring(btrim(am.patch, ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)) FROM '^([0-9]{1,9})[.][0-9]+$')::int AS major) m
) pv`;

/** The opaque key of an account (the PUUID never leaves the database). */
const keyOf = (puuid: SQL) => sql`left(translate(encode(sha256(convert_to('uniiverse-encounter:' || (${puuid}), 'UTF8')), 'base64'), '+/', '-_'), 16)`;

export interface EncounterScope {
  /** The player's linked accounts, or the one account chosen. */
  accountIds: readonly string[];
  /** A season (game-version major), read from each game's patch as Match History does. */
  season: number;
  mode: SeasonMode;
}

/**
 * The player's games in the scope, then everyone met in them, one row per player and game:
 * whether they were on the player's side, on the other, or (duplicated records) both, and the
 * side, name and champion of their first record in the game. `onlyKey` narrows to one player's
 * games (the player's window).
 */
function encounterCtes(scope: EncounterScope, onlyKey?: string): SQL {
  const queues = seasonModeInfo(scope.mode).queues;
  return sql`
    WITH mine AS (
      SELECT DISTINCT ON (am.match_id) am.match_id, am.game_creation, am.queue_id, am.win, am.team_id, am.champion_id
      FROM account_matches am ${SEASON_OF_PATCH}
      WHERE am.account_id IN (${list(scope.accountIds)}) AND am.champion_id IS NOT NULL
        AND am.queue_id IN (${sql.join(queues.map((q) => sql`${q}`), sql`, `)})
        AND pv.season = ${scope.season}
      ORDER BY am.match_id, am.account_id
    ),
    met AS (
      SELECT m.match_id, m.game_creation, m.queue_id, m.win, m.champion_id AS mine, p.n,
        p.v->>'puuid' AS puuid, p.v->>'name' AS name, p.v->>'championId' AS theirs,
        coalesce(NULLIF(p.v->>'teamId', '')::int = m.team_id, false) AS ally
      FROM mine m
      JOIN match_details d ON d.match_id = m.match_id
      CROSS JOIN LATERAL jsonb_array_elements(d.participants) WITH ORDINALITY p(v, n)
      WHERE m.team_id IS NOT NULL AND coalesce(p.v->>'puuid', '') <> '' AND coalesce(p.v->>'name', '') <> ''
        AND NOT EXISTS (SELECT 1 FROM riot_accounts l WHERE l.owner_type = 'player' AND l.puuid = p.v->>'puuid')
        ${onlyKey ? sql`AND ${keyOf(sql`p.v->>'puuid'`)} = ${onlyKey}` : sql``}
    ),
    per_game AS (
      SELECT puuid, match_id, min(game_creation) AS at, min(queue_id) AS queue_id, bool_and(win) AS win,
        bool_or(ally) AS ally, bool_or(NOT ally) AS opponent, (array_agg(ally ORDER BY n))[1] AS side, min(mine) AS mine,
        (array_agg(theirs ORDER BY n))[1] AS theirs, (array_agg(name ORDER BY n))[1] AS name
      FROM met GROUP BY puuid, match_id
    ),
    players AS (
      SELECT ${keyOf(sql`puuid`)} AS key,
        (array_agg(name ORDER BY at DESC, match_id COLLATE "C" DESC))[1] AS name,
        count(*)::int AS games,
        count(*) FILTER (WHERE ally)::int AS ag, count(*) FILTER (WHERE ally AND win)::int AS aw, count(*) FILTER (WHERE ally AND NOT win)::int AS al,
        count(*) FILTER (WHERE opponent)::int AS og, count(*) FILTER (WHERE opponent AND win)::int AS ow, count(*) FILTER (WHERE opponent AND NOT win)::int AS ol,
        max(at) AS last_at,
        (array_agg(match_id ORDER BY at DESC, match_id COLLATE "C" DESC))[1] AS last_match
      FROM per_game GROUP BY puuid
    )`;
}

/** The record a relation is about, as SQL over the players CTE: its games, wins and losses. */
const RECORD: Record<EncounterRelation, { games: SQL; wins: SQL; losses: SQL }> = {
  opponents: { games: sql`og`, wins: sql`ow`, losses: sql`ol` },
  allies: { games: sql`ag`, wins: sql`aw`, losses: sql`al` },
  everyone: { games: sql`games`, wins: sql`(aw + ow)`, losses: sql`(al + ol)` },
};

/** Row → JSON for one player summary (compact arrays: key, name, games, ally W-L, opponent W-L, last). */
const SUMMARY_JSON = sql`json_build_array(key, name, games, ag, aw, al, og, ow, ol, last_at, last_match)`;
type SummaryRow = [string, string, number, number, number, number, number, number, number, number | string, string];

function summaryOf(r: SummaryRow): EncounterSummary {
  return {
    key: r[0],
    name: r[1],
    games: Number(r[2]),
    ally: { games: Number(r[3]), wins: Number(r[4]), losses: Number(r[5]) },
    opponent: { games: Number(r[6]), wins: Number(r[7]), losses: Number(r[8]) },
    lastPlayedAt: Number(r[9]),
    lastMatchId: r[10],
  };
}

export interface EncounterListOptions {
  relation: EncounterRelation;
  /** Games in the relation, at least (and decided games, for the record orders). */
  min: number;
  sort: EncounterSort;
  /** Part of a Riot ID (case-insensitive). */
  q: string;
  limit: number;
}

export interface EncounterPage {
  /** The player's games in the scope: the same count as Match History's. */
  games: number;
  /** Of those, the games whose other players are recorded (the rest cannot show anyone). */
  withPlayers: number;
  list: EncounterSummary[];
  /** Players matching the list's choices (the list shows the first `limit`). */
  total: number;
  insights: EncounterInsight[];
}

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const parsed = <T,>(value: unknown): T => (typeof value === "string" ? (JSON.parse(value) as T) : (value as T));

/**
 * One page of the list, the base counts and the highlights, in one statement. Highlights ignore the
 * list's own choices (relation, minimum, search): they describe the whole scope.
 */
export async function loadEncounterPage(db: Db, scope: EncounterScope, o: EncounterListOptions): Promise<EncounterPage> {
  if (!scope.accountIds.length) return { games: 0, withPlayers: 0, list: [], total: 0, insights: [] };
  const rec = RECORD[o.relation];
  const q = o.q.trim().toLowerCase();
  const rate = sql`(${rec.wins}::float8 / nullif(${rec.wins} + ${rec.losses}, 0))`;
  const shown = sql`${rec.games} >= ${o.min} ${q ? sql`AND strpos(lower(name), ${q}) > 0` : sql``} ${o.sort === "games" ? sql`` : sql`AND ${rec.wins} + ${rec.losses} >= ${o.min}`}`;
  const byGames = sql`${rec.games} DESC, last_at DESC, key COLLATE "C"`;
  const order = o.sort === "best" ? sql`${rate} DESC, ${byGames}` : o.sort === "worst" ? sql`${rate} ASC, ${byGames}` : byGames;
  const highlight = (where: SQL, orderBy: SQL) => sql`(SELECT ${SUMMARY_JSON} FROM players WHERE ${where} ORDER BY ${orderBy}, games DESC, last_at DESC, key COLLATE "C" LIMIT 1)`;
  const pct = (w: SQL, l: SQL) => sql`(${w}::float8 / nullif(${w} + ${l}, 0))`;
  // Postgres plans many more participants a game than the ten there are, which can put this over
  // its JIT threshold; compiling would take longer than running it (as for the team query before).
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL jit = off`);
    return tx.execute(sql`${encounterCtes(scope)}
      SELECT json_build_object(
        'games', (SELECT count(*) FROM mine),
        'withPlayers', (SELECT count(DISTINCT match_id) FROM met),
        'total', (SELECT count(*) FROM players WHERE ${shown}),
        'list', (SELECT json_agg(s) FROM (SELECT ${SUMMARY_JSON} AS s FROM players WHERE ${shown} ORDER BY ${order} LIMIT ${o.limit}) page),
        'insights', json_build_array(
          ${highlight(sql`og >= ${INSIGHT_MIN_GAMES.frequent}`, sql`og DESC`)},
          ${highlight(sql`ag >= ${INSIGHT_MIN_GAMES.frequent}`, sql`ag DESC`)},
          ${highlight(sql`aw + al >= ${INSIGHT_MIN_GAMES.record}`, sql`${pct(sql`aw`, sql`al`)} DESC`)},
          ${highlight(sql`ow + ol >= ${INSIGHT_MIN_GAMES.record}`, sql`${pct(sql`ow`, sql`ol`)} ASC`)}
        )
      ) AS payload`);
  });
  const payload = parsed<{ games: number | string; withPlayers: number | string; total: number | string; list: SummaryRow[] | null; insights: Array<SummaryRow | null> }>(rowsOf<{ payload: unknown }>(result)[0]?.payload);
  const [frequentOpponent, frequentAlly, bestAlly, toughestOpponent] = payload.insights.map((r) => (r ? summaryOf(r) : null));
  const insights: EncounterInsight[] = [];
  const add = (kind: EncounterInsight["kind"], s: EncounterSummary | null, record: (s: EncounterSummary) => WinLoss) => s && insights.push({ kind, summary: s, record: record(s) });
  add("frequent-opponent", frequentOpponent ?? null, (s) => s.opponent);
  add("frequent-ally", frequentAlly ?? null, (s) => s.ally);
  add("best-ally", bestAlly ?? null, (s) => s.ally);
  add("toughest-opponent", toughestOpponent ?? null, (s) => s.opponent);
  return { games: Number(payload.games), withPlayers: Number(payload.withPlayers), list: (payload.list ?? []).map(summaryOf), total: Number(payload.total), insights };
}

/** The games shown in a player's window (the newest; the summary counts them all). */
export const ENCOUNTER_GAMES_SHOWN = 100;

export interface EncounterDetail {
  summary: EncounterSummary;
  /** The newest games, at most ENCOUNTER_GAMES_SHOWN. */
  games: EncounterGame[];
  /**
   * The Riot ID the account had in the newest stored game anyone played with it after the last
   * game here (null when there is none): a rename is followed, so a link never opens a name the
   * account has given up (domain/opgg opggLinkFor; server/players/riot-names does the same for
   * Match History).
   */
  newer: { riotId: string; matchId: string } | null;
}

/** One encountered player in the scope: their summary and the games, newest first. Null when not met there. */
export async function loadEncounterDetail(db: Db, scope: EncounterScope, key: string): Promise<EncounterDetail | null> {
  if (!scope.accountIds.length) return null;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL jit = off`);
    return tx.execute(sql`${encounterCtes(scope, key)}
      SELECT json_build_object(
        'summary', (SELECT ${SUMMARY_JSON} FROM players LIMIT 1),
        'games', (SELECT json_agg(json_build_array(match_id, at, queue_id, CASE WHEN win THEN 1 WHEN NOT win THEN 0 END, mine, theirs, CASE WHEN side THEN 1 ELSE 0 END) ORDER BY at DESC, match_id COLLATE "C" DESC)
          FROM (SELECT * FROM per_game ORDER BY at DESC, match_id COLLATE "C" DESC LIMIT ${ENCOUNTER_GAMES_SHOWN}) g),
        -- Only games newer than the last one here are opened.
        'newer', (SELECT json_build_array(p->>'name', d.match_id)
          FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) p
          WHERE d.game_creation > (SELECT max(at) FROM per_game) AND p->>'puuid' = (SELECT min(puuid) FROM per_game) AND strpos(coalesce(p->>'name', ''), '#') > 0
          ORDER BY d.game_creation DESC, d.match_id COLLATE "C" DESC LIMIT 1)
      ) AS payload`);
  });
  const payload = parsed<{ summary: SummaryRow | null; games: Array<[string, number | string, number | null, 1 | 0 | null, string | null, string | null, 1 | 0]> | null; newer: [string, string] | null }>(rowsOf<{ payload: unknown }>(result)[0]?.payload);
  if (!payload.summary) return null;
  return {
    summary: summaryOf(payload.summary),
    newer: payload.newer ? { riotId: payload.newer[0], matchId: payload.newer[1] } : null,
    games: (payload.games ?? []).map(([matchId, at, queueId, win, mine, theirs, ally]) => ({ matchId, playedAt: Number(at), queueId: queueId === null ? null : Number(queueId), memberChampion: mine, otherChampion: theirs, relation: ally === 1 ? "ally" : "opponent", win: win === null ? null : win === 1 })),
  };
}

/** A player's games in one season and queue (one per match); `chosen` counts the chosen account's alone. */
export interface SeasonQueueGames {
  season: number;
  queueId: number | null;
  games: number;
  chosen: number;
}

/**
 * The games behind the season choice and the game-mode counts, per season and queue: a few rows
 * whatever the history's size (Match History reads them from the games it lists).
 */
export async function loadGamesBySeason(db: Db, accountIds: readonly string[], chosen: string | null): Promise<SeasonQueueGames[]> {
  if (!accountIds.length) return [];
  const result = await db.execute(sql`
    SELECT pv.season, am.queue_id, count(DISTINCT am.match_id)::int AS games,
      count(DISTINCT am.match_id) FILTER (WHERE am.account_id = ${chosen}::uuid)::int AS chosen
    FROM account_matches am ${SEASON_OF_PATCH}
    WHERE am.account_id IN (${list(accountIds)}) AND am.champion_id IS NOT NULL AND pv.season IS NOT NULL
    GROUP BY pv.season, am.queue_id`);
  type Row = { season: number | string; queue_id: number | string | null; games: number | string; chosen: number | string };
  return rowsOf<Row>(result).map((r) => ({ season: Number(r.season), queueId: r.queue_id === null ? null : Number(r.queue_id), games: Number(r.games), chosen: Number(r.chosen) }));
}

/**
 * The game-mode counts of a season and, for the chosen mode, the other seasons holding its games
 * (what Match History's modeBreakdown gives), from loadGamesBySeason's rows.
 */
export function modeCounts(rows: readonly SeasonQueueGames[], o: { season: number; mode: SeasonMode; account: boolean }): { counts: Record<SeasonMode, number>; elsewhere: Array<{ season: number; games: number }> } {
  const n = (r: SeasonQueueGames) => (o.account ? r.chosen : r.games);
  const inMode = (mode: SeasonMode, season: number) => {
    const queues = new Set(seasonModeInfo(mode).queues);
    return rows.reduce((t, r) => t + (r.season === season && r.queueId !== null && queues.has(r.queueId) ? n(r) : 0), 0);
  };
  const counts = Object.fromEntries(SEASON_MODES.map((m) => [m.key, inMode(m.key, o.season)])) as Record<SeasonMode, number>;
  const seasons = [...new Set(rows.filter((r) => n(r) > 0).map((r) => r.season))].sort((a, b) => b - a);
  const elsewhere = seasons
    .filter((s) => s !== o.season && s >= FIRST_SEASON)
    .map((season) => ({ season, games: inMode(o.mode, season) }))
    .filter((e) => e.games > 0);
  return { counts, elsewhere };
}

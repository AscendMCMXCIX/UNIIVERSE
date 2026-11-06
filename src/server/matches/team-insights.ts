import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { registerLocalCache } from "@/server/observability/cache";
import { riotAccounts } from "@/server/db/schema";
import { summariseMatches } from "@/server/accounts/match-summary";
import { SYNC_QUEUE_IDS, currentSeason, seasonListStart } from "@/server/accounts/sync";
import { listPlayers } from "@/server/repositories/team";
import { seasonOfGame, seasonStartUnix } from "@/domain/season";
import { isoDay } from "@/lib/format";
import { teamInsights, type InsightGame, type InsightPresence, type TeamInsights } from "@/domain/team-insights";

/*
  Team insights (docs/TEAM_INSIGHTS.md): the team's own games of the season, read once and handed
  to domain/team-insights for the comparisons. No Riot request is made.

  Two reads:
  - the current members' stored games of the season (their own linked accounts; remakes and
    unsupported queues have no champion and are never read);
  - who of the members was in each of those games, and on which side: from each member's own
    stored game (the side copied from the record, which survives a change of Riot key) and from
    the stored match record itself (every player's account in it, which finds a member whose own
    history does not reach back that far), expanded inside the database so only the members'
    places leave it: a few bytes per member per game, never the records.
  Both come back as one compact JSON answer (as Team Leaderboards reads its games).

  Cached per team: dropped as soon as the members, their accounts, or the season's stored games and
  records change, at the start of each day ("the last 30 days" moves on), and after six hours.
  Routine syncs that find nothing new do not recompute it.
*/

export interface TeamInsightsView {
  insights: TeamInsights;
  /** Display names of the current members, by player id. */
  names: Record<string, string>;
  computedAt: number;
}

/** New games and records change the key; this only bounds how long one server instance keeps an answer. */
const TTL_MS = 6 * 3_600_000;
/** Games are given a season by their patch; reading from a month before 1 January keeps any early patch in. */
const SEASON_LEAD_MS = 31 * 86_400_000;
const cache = new Map<string, { key: string; at: number; value: TeamInsightsView }>();
registerLocalCache(() => cache.clear());
/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export function invalidateTeamInsightsCache() {
  cache.clear();
}

/**
 * The members' games and places for a season, straight from the database (no cache), in one
 * compact answer: each member's game once (two linked accounts in one game are one game), and the
 * members found in each game's stored record with their side. Matches and members travel as small
 * numbers, not as ids: about 50 bytes per member game (the records never leave the database).
 */
export async function readInsightInputs(db: Db, accounts: ReadonlyArray<{ id: string; playerId: string }>, season: number): Promise<{ games: InsightGame[]; presences: InsightPresence[] }> {
  if (accounts.length === 0) return { games: [], presences: [] };
  const playerIds = [...new Set(accounts.map((a) => a.playerId))].sort();
  const idList = sql.join(accounts.map((a) => sql`${a.id}::uuid`), sql`, `);
  const playerList = sql.join(playerIds.map((id) => sql`${id}::uuid`), sql`, `);
  const since = seasonStartUnix(season) * 1000 - SEASON_LEAD_MS;
  const result = await db.execute(sql`
    WITH acc AS (
      SELECT ra.id, ra.puuid, array_position(ARRAY[${playerList}]::uuid[], ra.player_id) - 1 AS p
      FROM riot_accounts ra WHERE ra.id IN (${idList})
    ),
    own AS (
      SELECT DISTINCT ON (am.match_id, acc.p) am.match_id, acc.p, am.queue_id, am.role, am.win, am.game_creation, am.game_duration, am.patch
      FROM account_matches am JOIN acc ON acc.id = am.account_id
      WHERE am.champion_id IS NOT NULL AND am.game_creation >= ${since}
      ORDER BY am.match_id, acc.p, am.account_id
    ),
    matches AS (
      SELECT match_id, (row_number() OVER (ORDER BY match_id) - 1)::int AS m FROM (SELECT DISTINCT match_id FROM own) d
    ),
    places AS (
      -- Each member's own stored games, with the side copied from the record when it was
      -- summarised: this survives a change of Riot key, which gives everyone new PUUIDs that
      -- the stored records do not carry.
      SELECT x.m, acc.p, am.team_id AS side
      FROM account_matches am
      JOIN acc ON acc.id = am.account_id
      JOIN matches x ON x.match_id = am.match_id
      WHERE am.champion_id IS NOT NULL AND am.team_id IN (100, 200)
      UNION
      -- The stored record: finds a member whose own history does not reach back to the game.
      SELECT x.m, acc.p, (pt.value->>'teamId')::int AS side
      FROM matches x
      JOIN match_details md ON md.match_id = x.match_id
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(md.participants) = 'array' THEN md.participants ELSE '[]'::jsonb END) AS pt(value)
      JOIN acc ON acc.puuid = pt.value->>'puuid' AND acc.puuid <> ''
      WHERE pt.value->>'teamId' IN ('100', '200')
    )
    SELECT
      (SELECT coalesce(json_agg(json_build_array(x.m, o.p, o.queue_id, o.role, CASE WHEN o.win THEN 1 WHEN NOT o.win THEN 0 END, o.game_creation, o.game_duration, o.patch)), '[]')
         FROM own o JOIN matches x USING (match_id)) AS games,
      (SELECT coalesce(json_agg(json_build_array(m, p, side)), '[]') FROM places) AS places`);
  const [answer] = rowsOf<{ games: unknown; places: unknown }>(result);
  const parse = <T,>(v: unknown): T[] => (typeof v === "string" ? JSON.parse(v) : (v ?? [])) as T[];
  type Game = [number, number, number | null, string | null, 0 | 1 | null, number | string, number | null, string | null];
  const games: InsightGame[] = parse<Game>(answer?.games).map(([m, p, queueId, role, win, gameCreation, durationS, patch]) => ({
    matchId: String(m),
    playerId: playerIds[p]!,
    queueId: queueId === null ? null : Number(queueId),
    role,
    win: win === null ? null : win === 1,
    gameCreation: Number(gameCreation),
    durationS: durationS === null ? null : Number(durationS),
    patch,
  }));
  const presences: InsightPresence[] = parse<[number, number, number]>(answer?.places).map(([m, p, side]) => ({ matchId: String(m), playerId: playerIds[p]!, teamId: Number(side) }));
  return { games, presences };
}

/**
 * What changes when the inputs change: the accounts and their ids, and the season's stored games
 * and records (a record that arrives later marks its games summarised). Unlike Played Together's
 * fingerprint it ignores routine syncs that found nothing new, so the page is not recomputed for them.
 */
async function insightFingerprint(db: Db, accounts: ReadonlyArray<{ id: string; puuid: string | null }>, season: number): Promise<string> {
  const idList = sql.join(accounts.map((a) => sql`${a.id}::uuid`), sql`, `);
  const since = seasonStartUnix(season) * 1000 - SEASON_LEAD_MS;
  const result = await db.execute(sql`
    SELECT count(*)::int AS games, max(game_creation) AS newest, max(summarised_at)::text AS summarised
    FROM account_matches WHERE account_id IN (${idList}) AND champion_id IS NOT NULL AND game_creation >= ${since}`);
  const [r] = rowsOf<{ games: number; newest: number | string | null; summarised: string | null }>(result);
  return [accounts.map((a) => `${a.id}:${a.puuid ?? ""}`).join(","), r?.games, r?.newest, r?.summarised].join("|");
}

/** The current members' linked player accounts with a resolved PUUID. */
async function memberAccounts(db: Db, memberIds: readonly string[]) {
  if (memberIds.length === 0) return [];
  const rows = await db
    .select({ id: riotAccounts.id, playerId: riotAccounts.playerId, puuid: riotAccounts.puuid })
    .from(riotAccounts)
    .where(and(inArray(riotAccounts.playerId, [...memberIds]), eq(riotAccounts.ownerType, "player"), isNotNull(riotAccounts.puuid)));
  return rows.filter((r): r is { id: string; playerId: string; puuid: string } => !!r.playerId).sort((a, b) => a.id.localeCompare(b.id));
}

/** Team insights for the current season (cached per team; see above). */
export async function loadTeamInsights(db: Db, teamId: string, now: Date = new Date()): Promise<TeamInsightsView> {
  const [members, season] = await Promise.all([listPlayers(db, teamId), currentSeason(db, now)]);
  const names = Object.fromEntries(members.map((m) => [m.id, m.displayName]));
  const memberIds = members.map((m) => m.id).sort();
  const accounts = await memberAccounts(db, memberIds);
  if (accounts.length === 0) {
    return { insights: teamInsights({ games: [], presences: [], memberIds, season, now: now.getTime() }), names, computedAt: now.getTime() };
  }
  // The same bookkeeping Played Together does first: a record that arrived since marks its games.
  await summariseMatches(db, { accountIds: accounts.map((a) => a.id) });
  // The day is in the key so "the last 30 days" moves on even when no game arrives.
  const key = `${season}#${isoDay(now)}#${memberIds.join(",")}#${await insightFingerprint(db, accounts, season)}`;
  const hit = cache.get(teamId);
  if (hit && hit.key === key && now.getTime() - hit.at < TTL_MS) return { ...hit.value, names };
  const inputs = await readInsightInputs(db, accounts, season);
  const value: TeamInsightsView = { insights: teamInsights({ ...inputs, memberIds, season, now: now.getTime() }), names, computedAt: now.getTime() };
  cache.set(teamId, { key, at: now.getTime(), value });
  return value;
}

/** A member's place in a stored record that their own history lacks, counted by what the history holds for it. */
export interface MissingPlaceReasons {
  /**
   * Places whose game is this season by its patch. The insights read from a month before the
   * season's start (SEASON_LEAD_MS), where a longer-stored teammate's history holds last season's
   * games that a newer account's season list never covered: those are not gaps in this season.
   */
  thisSeason: number;
  byReason: {
    /** No ledger row at all for the game under any of the member's accounts. */
    noRow: {
      places: number;
      /** The game started before the season's list start (seasonListStart): no account's list of this season names it. */
      beforeSeasonStart: number;
      /** The game is older than the member's earliest stored game: their history does not reach back to it. */
      beforeOwnFirstGame: number;
      /** The game's queue is not one the sync collects (the teammate's row came from an earlier queue list). */
      queueNotCollected: number;
      /** One of the member's accounts has not finished collecting the season. */
      historyIncomplete: number;
    };
    /** A ledger row exists but without a champion, which every reader skips. */
    row: {
      places: number;
      /** Recorded as a game Riot refused for good (no start time: game_creation 0). */
      refusedForGood: number;
      /** Shorter than five minutes, as a remake is stored. */
      remake: number;
      /** A queue the sync does not count. */
      otherQueue: number;
      /** Nothing of the above: the champion was not in the champion list when the game was stored. */
      championUnknown: number;
      /** A row with a champion (not expected: such a row is the member's own game). */
      withChampion: number;
    };
  };
  /** Places by the game's queue (the teammate's row), as strings; "none" when unknown. */
  byQueue: Record<string, number>;
}

/**
 * Why each missing place is missing, from the ledger alone (counts only, no ids): whether the
 * member has any row for the game, and when they have one without a champion, what kind.
 */
export async function missingPlaceReasons(db: Db, accounts: ReadonlyArray<{ id: string; playerId: string }>, season: number): Promise<MissingPlaceReasons> {
  const out: MissingPlaceReasons = {
    thisSeason: 0,
    byReason: { noRow: { places: 0, beforeSeasonStart: 0, beforeOwnFirstGame: 0, queueNotCollected: 0, historyIncomplete: 0 }, row: { places: 0, refusedForGood: 0, remake: 0, otherQueue: 0, championUnknown: 0, withChampion: 0 } },
    byQueue: {},
  };
  if (accounts.length === 0) return out;
  const idList = sql.join(accounts.map((a) => sql`${a.id}::uuid`), sql`, `);
  const since = seasonStartUnix(season) * 1000 - SEASON_LEAD_MS;
  const listStartMs = (await seasonListStart(db, season)) * 1000;
  const result = await db.execute(sql`
    WITH acc AS (
      SELECT ra.id, ra.puuid, ra.player_id, (ra.history_backfill->>'completedAt') IS NOT NULL AS complete
      FROM riot_accounts ra WHERE ra.id IN (${idList})
    ),
    own AS (
      SELECT am.match_id, acc.player_id, min(am.game_creation) AS game_creation, min(am.queue_id) AS queue_id, min(am.patch) AS patch
      FROM account_matches am JOIN acc ON acc.id = am.account_id
      WHERE am.champion_id IS NOT NULL AND am.game_creation >= ${since}
      GROUP BY am.match_id, acc.player_id
    ),
    matches AS (SELECT match_id, min(game_creation) AS game_creation, min(queue_id) AS queue_id, min(patch) AS patch FROM own GROUP BY match_id),
    record_places AS (
      SELECT DISTINCT x.match_id, acc.player_id
      FROM matches x
      JOIN match_details md ON md.match_id = x.match_id
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(md.participants) = 'array' THEN md.participants ELSE '[]'::jsonb END) AS pt(value)
      JOIN acc ON acc.puuid = pt.value->>'puuid' AND acc.puuid <> ''
      WHERE pt.value->>'teamId' IN ('100', '200')
    ),
    missing AS (
      SELECT rp.match_id, rp.player_id FROM record_places rp
      LEFT JOIN own o ON o.match_id = rp.match_id AND o.player_id = rp.player_id
      WHERE o.match_id IS NULL
    )
    SELECT
      x.queue_id AS match_queue, x.game_creation AS match_creation, x.patch AS match_patch,
      x.game_creation < (SELECT min(o2.game_creation) FROM own o2 WHERE o2.player_id = m.player_id) AS before_own_first,
      (SELECT bool_and(a3.complete) FROM acc a3 WHERE a3.player_id = m.player_id) AS history_complete,
      r.found AS row_found, r.has_champion AS row_champion, r.game_creation AS row_creation, r.game_duration AS row_duration, r.queue_id AS row_queue
    FROM missing m
    JOIN matches x ON x.match_id = m.match_id
    LEFT JOIN LATERAL (
      SELECT true AS found, am.champion_id IS NOT NULL AS has_champion, am.game_creation, am.game_duration, am.queue_id
      FROM account_matches am JOIN acc a4 ON a4.id = am.account_id
      WHERE a4.player_id = m.player_id AND am.match_id = m.match_id
      ORDER BY am.account_id LIMIT 1
    ) r ON true`);
  type Row = { match_queue: number | string | null; match_creation: number | string; match_patch: string | null; before_own_first: boolean | null; history_complete: boolean | null; row_found: boolean | null; row_champion: boolean | null; row_creation: number | string | null; row_duration: number | null; row_queue: number | string | null };
  const collected = new Set<number>(SYNC_QUEUE_IDS);
  for (const r of rowsOf<Row>(result)) {
    const queue = r.match_queue === null ? "none" : String(r.match_queue);
    out.byQueue[queue] = (out.byQueue[queue] ?? 0) + 1;
    const creation = Number(r.match_creation);
    if (seasonOfGame(r.match_patch, creation) === season) out.thisSeason += 1;
    if (!r.row_found) {
      const n = out.byReason.noRow;
      n.places += 1;
      if (creation < listStartMs) n.beforeSeasonStart += 1;
      if (r.before_own_first === true) n.beforeOwnFirstGame += 1;
      if (r.match_queue === null || !collected.has(Number(r.match_queue))) n.queueNotCollected += 1;
      if (r.history_complete !== true) n.historyIncomplete += 1;
    } else {
      const w = out.byReason.row;
      w.places += 1;
      if (r.row_champion) w.withChampion += 1;
      else if (Number(r.row_creation) === 0) w.refusedForGood += 1;
      else if (r.row_duration !== null && Number(r.row_duration) < 300) w.remake += 1;
      else if (r.row_queue === null || !collected.has(Number(r.row_queue))) w.otherQueue += 1;
      else w.championUnknown += 1;
    }
  }
  return out;
}

/**
 * For data-audit (read only, counts and anonymous labels only): what Team insights would show on
 * this database, and how many members' places in the season's stored records are missing from
 * that member's own history (a history gap; Played Together, which reads the histories, misses
 * those games), and why (missingPlaceReasons).
 */
export async function teamInsightsAudit(db: Db, teamId: string, labelOf: (playerId: string) => string, now: Date = new Date()) {
  const [members, season] = await Promise.all([listPlayers(db, teamId), currentSeason(db, now)]);
  const memberIds = members.map((m) => m.id).sort();
  const accounts = await memberAccounts(db, memberIds);
  const inputs = await readInsightInputs(db, accounts, season);
  const r = teamInsights({ ...inputs, memberIds, season, now: now.getTime() });
  const own = new Set(inputs.games.map((g) => `${g.matchId}|${g.playerId}`));
  const missing = inputs.presences.filter((p) => !own.has(`${p.matchId}|${p.playerId}`));
  const reasons = await missingPlaceReasons(db, accounts, season);
  const round = (v: number | null, digits: number) => (v === null ? null : Number(v.toFixed(digits)));
  return {
    season,
    rules: { minGamesEachSide: 20, falseDiscoveryRate: 0.05, minFindingPoints: 5 },
    members: r.members,
    memberGames: r.memberGames,
    teamGames: r.teamGames,
    excluded: r.excluded,
    tested: r.tested,
    findings: r.findings.length,
    typicalMarginPoints: round(r.typicalMargin === null ? null : r.typicalMargin * 100, 1),
    placesMissingFromOwnHistory: { places: missing.length, matches: new Set(missing.map((p) => p.matchId)).size, members: new Set(missing.map((p) => p.playerId)).size, ...reasons },
    comparisons: r.comparisons.map((c) => ({
      kind: c.kind,
      member: c.playerId ? labelOf(c.playerId) : null,
      teammate: c.teammateId ? labelOf(c.teammateId) : null,
      games: { exposed: c.result.exposed.games, other: c.result.other.games, compared: c.result.comparedGames },
      tested: c.tested,
      untestedReason: c.untestedReason,
      points: round(c.result.difference === null ? null : c.result.difference * 100, 1),
      interval: c.result.low === null || c.result.high === null ? null : [round(c.result.low * 100, 1), round(c.result.high * 100, 1)],
      q: round(c.qValue, 4),
      finding: c.finding,
    })),
  };
}

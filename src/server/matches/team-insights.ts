import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { registerLocalCache } from "@/server/observability/cache";
import { riotAccounts } from "@/server/db/schema";
import { summariseMatches } from "@/server/accounts/match-summary";
import { currentSeason } from "@/server/accounts/sync";
import { listPlayers } from "@/server/repositories/team";
import { seasonStartUnix } from "@/domain/season";
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

/**
 * For data-audit (read only, counts and anonymous labels only): what Team insights would show on
 * this database, and how many members' places in the season's stored records are missing from
 * that member's own history (a history gap; Played Together, which reads the histories, misses
 * those games).
 */
export async function teamInsightsAudit(db: Db, teamId: string, labelOf: (playerId: string) => string, now: Date = new Date()) {
  const [members, season] = await Promise.all([listPlayers(db, teamId), currentSeason(db, now)]);
  const memberIds = members.map((m) => m.id).sort();
  const accounts = await memberAccounts(db, memberIds);
  const inputs = await readInsightInputs(db, accounts, season);
  const r = teamInsights({ ...inputs, memberIds, season, now: now.getTime() });
  const own = new Set(inputs.games.map((g) => `${g.matchId}|${g.playerId}`));
  const missing = inputs.presences.filter((p) => !own.has(`${p.matchId}|${p.playerId}`));
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
    placesMissingFromOwnHistory: { places: missing.length, matches: new Set(missing.map((p) => p.matchId)).size, members: new Set(missing.map((p) => p.playerId)).size },
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

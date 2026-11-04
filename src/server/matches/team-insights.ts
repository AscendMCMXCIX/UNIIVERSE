import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { registerLocalCache } from "@/server/observability/cache";
import { riotAccounts } from "@/server/db/schema";
import { summariseMatches } from "@/server/accounts/match-summary";
import { currentSeason } from "@/server/accounts/sync";
import { historyFingerprint } from "@/server/leaderboards/service";
import { listPlayers } from "@/server/repositories/team";
import { seasonStartUnix } from "@/domain/season";
import { teamInsights, type InsightGame, type InsightPresence, type TeamInsights } from "@/domain/team-insights";

/*
  Team insights (docs/TEAM_INSIGHTS.md): the team's own games of the season, read once and handed
  to domain/team-insights for the comparisons. No Riot request is made.

  Two reads:
  - the current members' stored games of the season (their own linked accounts; remakes and
    unsupported queues have no champion and are never read);
  - who of the members was in each of those games, and on which side, from the stored match
    record itself (every player's account in it), expanded inside the database so only the
    members' places leave it: a few bytes per member per game, never the records.

  Cached per team like Played Together: dropped as soon as the members, their accounts, games or
  syncs change (the same fingerprint), and after 15 minutes so "the last 30 days" keeps moving.
*/

export interface TeamInsightsView {
  insights: TeamInsights;
  /** Display names of the current members, by player id. */
  names: Record<string, string>;
  computedAt: number;
}

const TTL_MS = 15 * 60_000;
/** Games are given a season by their patch; reading from a month before 1 January keeps any early patch in. */
const SEASON_LEAD_MS = 31 * 86_400_000;
const cache = new Map<string, { key: string; at: number; value: TeamInsightsView }>();
registerLocalCache(() => cache.clear());
/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export function invalidateTeamInsightsCache() {
  cache.clear();
}

interface GameRow {
  match_id: string;
  player_id: string;
  queue_id: number | null;
  role: string | null;
  win: boolean | null;
  game_creation: string | number;
  game_duration: number | null;
  patch: string | null;
}

interface PresenceRow {
  match_id: string;
  player_id: string;
  team_id: number | string;
}

/** The members' games and places for a season, straight from the database (no cache). */
export async function readInsightInputs(db: Db, accounts: ReadonlyArray<{ id: string; playerId: string }>, season: number): Promise<{ games: InsightGame[]; presences: InsightPresence[] }> {
  if (accounts.length === 0) return { games: [], presences: [] };
  const idList = sql.join(accounts.map((a) => sql`${a.id}::uuid`), sql`, `);
  const since = seasonStartUnix(season) * 1000 - SEASON_LEAD_MS;
  const [gameResult, presenceResult] = await Promise.all([
    db.execute(sql`
      SELECT am.match_id, ra.player_id, am.queue_id, am.role, am.win, am.game_creation, am.game_duration, am.patch
      FROM account_matches am
      JOIN riot_accounts ra ON ra.id = am.account_id
      WHERE am.account_id IN (${idList}) AND am.champion_id IS NOT NULL AND am.game_creation >= ${since}`),
    db.execute(sql`
      WITH member_accounts AS (
        SELECT ra.puuid, ra.player_id FROM riot_accounts ra
        WHERE ra.id IN (${idList}) AND ra.puuid IS NOT NULL AND ra.puuid <> ''
      ),
      season_matches AS (
        SELECT DISTINCT am.match_id FROM account_matches am
        WHERE am.account_id IN (${idList}) AND am.champion_id IS NOT NULL AND am.game_creation >= ${since}
      )
      SELECT md.match_id, ma.player_id, p.value->>'teamId' AS team_id
      FROM match_details md
      JOIN season_matches s ON s.match_id = md.match_id
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(md.participants) = 'array' THEN md.participants ELSE '[]'::jsonb END) AS p(value)
      JOIN member_accounts ma ON ma.puuid = p.value->>'puuid'
      WHERE p.value->>'teamId' IN ('100', '200')`),
  ]);
  const games: InsightGame[] = rowsOf<GameRow>(gameResult).map((r) => ({
    matchId: r.match_id,
    playerId: r.player_id,
    queueId: r.queue_id === null ? null : Number(r.queue_id),
    role: r.role,
    win: r.win,
    gameCreation: Number(r.game_creation),
    durationS: r.game_duration === null ? null : Number(r.game_duration),
    patch: r.patch,
  }));
  const presences: InsightPresence[] = rowsOf<PresenceRow>(presenceResult).map((r) => ({ matchId: r.match_id, playerId: r.player_id, teamId: Number(r.team_id) }));
  return { games, presences };
}

/** The current members' linked player accounts with a resolved PUUID. */
async function memberAccounts(db: Db, memberIds: readonly string[]) {
  if (memberIds.length === 0) return [];
  const rows = await db
    .select({ id: riotAccounts.id, playerId: riotAccounts.playerId })
    .from(riotAccounts)
    .where(and(inArray(riotAccounts.playerId, [...memberIds]), eq(riotAccounts.ownerType, "player"), isNotNull(riotAccounts.puuid)));
  return rows.filter((r): r is { id: string; playerId: string } => !!r.playerId).sort((a, b) => a.id.localeCompare(b.id));
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
  const accountIds = accounts.map((a) => a.id);
  // The same bookkeeping Played Together does first, so both read the history at the same point.
  await summariseMatches(db, { accountIds });
  const key = `${season}#${memberIds.join(",")}#${await historyFingerprint(db, accountIds)}`;
  const hit = cache.get(teamId);
  if (hit && hit.key === key && now.getTime() - hit.at < TTL_MS) return { ...hit.value, names };
  const inputs = await readInsightInputs(db, accounts, season);
  const value: TeamInsightsView = { insights: teamInsights({ ...inputs, memberIds, season, now: now.getTime() }), names, computedAt: now.getTime() };
  cache.set(teamId, { key, at: now.getTime(), value });
  return value;
}

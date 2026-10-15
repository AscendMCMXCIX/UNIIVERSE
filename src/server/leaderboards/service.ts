import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMastery, riotAccounts } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { getCurrentLineup, listPlayers } from "@/server/repositories/team";
import { cardLookFor, type CardLook } from "@/domain/card-style";
import { isLeaderboardRole, type LeaderboardExtra, type LeaderboardGame, type LeaderboardMastery } from "@/domain/leaderboards";
import { seasonOfPatch } from "@/domain/season";
import type { Role } from "@/domain/roles";
import type { CompactRank } from "@/components/players/rank-emblem";

/*
  The data behind Team Leaderboards, from what UNIIVERSE already stores: every linked account's
  games (account_matches), the per-player figures inside the stored match details (gold, wards,
  the team's kills and damage, and the extra figures kept from Phase 14 on), and Riot mastery.
  No Riot request is made here.

  Who is on the board: team members with a finished account and a player profile (listPlayers'
  defaults: archived, unfinished and personal-use profiles are left out). The Owner's admin
  account has no player profile, so it never appears.

  The games and mastery are cached per team and reused until something that changes them moves:
  the number of stored games or match details for these accounts, the newest game, the last
  account sync, or the set of accounts itself (a link added or removed, a member joining or
  leaving). A short time limit backs that up.
*/

export interface LeaderboardPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  look: CardLook;
  rank: CompactRank | null;
  primaryRole: Role;
}

export interface LeaderboardData {
  players: LeaderboardPlayer[];
  games: LeaderboardGame[];
  mastery: LeaderboardMastery[];
  lineupIds: string[];
  currentSeason: number;
  seasons: number[];
  /** Newest successful sync of any member's account (the board is as fresh as this). */
  lastUpdated: string | null;
  /** First game carrying the extra figures (multikills, wards cleared, objectives…), if any. */
  extraSince: number | null;
  /** Stored games before de-duplication across a player's accounts (for the page's footnote). */
  rawGames: number;
}

interface Cached {
  key: string;
  at: number;
  games: LeaderboardGame[];
  mastery: LeaderboardMastery[];
  rawGames: number;
}

const TTL_MS = 15 * 60_000;
/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const cache = new Map<string, Cached>();

/** Forget cached games (tests, or after a change the fingerprint cannot see). */
export function invalidateLeaderboardCache() {
  cache.clear();
}

export async function loadLeaderboardData(db: Db, teamId: string): Promise<LeaderboardData> {
  const [members, lineup, avatars, season] = await Promise.all([listPlayers(db, teamId), getCurrentLineup(db, teamId), avatarUrlsByPlayer(db), currentSeason(db)]);
  const ids = members.map((p) => p.id);
  const accounts = ids.length
    ? await db
        .select({ id: riotAccounts.id, playerId: riotAccounts.playerId, puuid: riotAccounts.puuid, label: riotAccounts.label, tier: riotAccounts.tier, division: riotAccounts.division, leaguePoints: riotAccounts.leaguePoints, rankQueue: riotAccounts.rankQueue, lastSyncAt: riotAccounts.lastSyncAt })
        .from(riotAccounts)
        .where(and(inArray(riotAccounts.playerId, ids), eq(riotAccounts.ownerType, "player")))
    : [];
  const accountIds = accounts.map((a) => a.id).sort();
  const { games, mastery, rawGames } = await gamesFor(db, teamId, accountIds, new Map(accounts.map((a) => [a.id, a.playerId!])));

  const rankOf = (playerId: string): CompactRank | null => {
    const mine = accounts.filter((a) => a.playerId === playerId && a.tier);
    const pick = mine.find((a) => a.label === "main") ?? mine[0];
    return pick?.tier ? { tier: pick.tier, division: pick.division, leaguePoints: pick.leaguePoints ?? 0, queue: pick.rankQueue === "flex" ? "flex" : pick.rankQueue === "solo" ? "solo" : null } : null;
  };
  const lastSync = accounts.reduce<number>((m, a) => Math.max(m, a.lastSyncAt?.getTime() ?? 0), 0);
  const seasons = [...new Set([season, ...games.map((g) => seasonOfPatch(g.patch)).filter((s): s is number => s !== null)])].sort((a, b) => b - a);
  const extraSince = games.reduce<number | null>((m, g) => (g.extra && (m === null || g.gameCreation < m) ? g.gameCreation : m), null);
  return {
    players: members.map((p) => ({ id: p.id, name: p.displayName, avatarUrl: avatars[p.id] ?? null, look: cardLookFor(p), rank: rankOf(p.id), primaryRole: p.primaryRole })),
    games,
    mastery,
    lineupIds: Object.values(lineup.slots).filter((id): id is string => !!id),
    currentSeason: season,
    seasons,
    lastUpdated: lastSync ? new Date(lastSync).toISOString() : null,
    extraSince,
    rawGames,
  };
}

async function fingerprint(db: Db, accountIds: string[]): Promise<string> {
  if (accountIds.length === 0) return "none";
  const ids = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM account_matches WHERE account_id IN (${ids})) AS games,
      (SELECT max(game_creation) FROM account_matches WHERE account_id IN (${ids})) AS newest,
      (SELECT count(*)::int FROM account_matches am JOIN match_details md ON md.match_id = am.match_id WHERE am.account_id IN (${ids})) AS details,
      (SELECT max(last_sync_at)::text FROM riot_accounts WHERE id IN (${ids})) AS synced`);
  const [r] = rowsOf<{ games: number; newest: number | string | null; details: number; synced: string | null }>(result);
  return [accountIds.join(","), r?.games, r?.newest, r?.details, r?.synced].join("|");
}

interface GameRow {
  match_id: string;
  account_id: string;
  queue_id: number | null;
  champion_id: string;
  role: string | null;
  win: boolean | null;
  patch: string | null;
  game_creation: string | number;
  game_duration: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  damage: number | null;
  vision_score: number | null;
  gold: number | null;
  wards_placed: number | null;
  team_kills: number | null;
  team_damage: string | number | null;
  stats: LeaderboardExtra | null;
}

async function gamesFor(db: Db, teamId: string, accountIds: string[], playerOf: Map<string, string>): Promise<Pick<Cached, "games" | "mastery" | "rawGames">> {
  if (accountIds.length === 0) return { games: [], mastery: [], rawGames: 0 };
  const key = await fingerprint(db, accountIds);
  const hit = cache.get(teamId);
  if (hit && hit.key === key && Date.now() - hit.at < TTL_MS) return hit;

  const ids = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  // One row per stored game: the account's own figures, plus this player's entry in the stored
  // match details (read inside the database, so only the few numbers needed travel back). The
  // team's damage is left empty when any teammate's damage is missing.
  const result = await db.execute(sql`
    SELECT am.match_id, am.account_id, am.queue_id, am.champion_id, am.role, am.win, am.patch, am.game_creation, am.game_duration,
           am.kills, am.deaths, am.assists, am.cs, am.damage, am.vision_score,
           d.gold, d.wards_placed, d.team_kills, d.team_damage, d.stats
    FROM account_matches am
    JOIN riot_accounts ra ON ra.id = am.account_id
    LEFT JOIN LATERAL (
      SELECT NULLIF(p->>'gold', '')::int AS gold,
             NULLIF(p->>'wardsPlaced', '')::int AS wards_placed,
             p->'stats' AS stats,
             (SELECT sum((q->>'kills')::int)::int FROM jsonb_array_elements(md.participants) q WHERE q->>'teamId' = p->>'teamId') AS team_kills,
             (SELECT CASE WHEN bool_and(q->>'damage' IS NOT NULL) THEN sum((q->>'damage')::bigint) END FROM jsonb_array_elements(md.participants) q WHERE q->>'teamId' = p->>'teamId') AS team_damage
      FROM match_details md, jsonb_array_elements(md.participants) p
      WHERE md.match_id = am.match_id AND ra.puuid IS NOT NULL AND p->>'puuid' = ra.puuid
      LIMIT 1
    ) d ON true
    WHERE am.account_id IN (${ids}) AND am.champion_id IS NOT NULL`);
  const rows = rowsOf<GameRow>(result);

  // One game per match per player: a match seen from two of a player's accounts counts once
  // (the newest row first; within a match the copy that found this player in the stored match
  // details, so gold, wards and the extra figures are not lost; then by account).
  const hasDetails = (r: GameRow) => (r.team_kills !== null || r.gold !== null ? 1 : 0);
  const sorted = [...rows].sort((a, b) => Number(b.game_creation) - Number(a.game_creation) || hasDetails(b) - hasDetails(a) || a.account_id.localeCompare(b.account_id));
  const seen = new Set<string>();
  const games: LeaderboardGame[] = [];
  for (const r of sorted) {
    const playerId = playerOf.get(r.account_id);
    if (!playerId) continue;
    const k = `${playerId}|${r.match_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const unavailable = typeof r.kills === "number" && r.kills < 0;
    const stats = r.stats && typeof r.stats === "object" && Object.keys(r.stats).length > 0 ? r.stats : null;
    games.push({
      matchId: r.match_id,
      playerId,
      championId: r.champion_id,
      role: isLeaderboardRole(r.role) ? r.role : null,
      queueId: r.queue_id,
      patch: r.patch,
      win: r.win,
      gameCreation: Number(r.game_creation),
      durationS: r.game_duration,
      kills: unavailable ? null : r.kills,
      deaths: unavailable ? null : r.deaths,
      assists: unavailable ? null : r.assists,
      cs: r.cs,
      damage: r.damage,
      vision: r.vision_score,
      gold: r.gold,
      wardsPlaced: r.wards_placed,
      teamKills: r.team_kills,
      teamDamage: r.team_damage === null ? null : Number(r.team_damage),
      extra: stats,
    });
  }

  const masteryRows = await db.select({ accountId: accountMastery.accountId, championId: accountMastery.championId, points: accountMastery.points }).from(accountMastery).where(and(inArray(accountMastery.accountId, accountIds), isNotNull(accountMastery.championId)));
  const mastery = masteryRows.filter((m) => m.points > 0 && playerOf.has(m.accountId)).map((m) => ({ playerId: playerOf.get(m.accountId)!, championId: m.championId, points: m.points }));

  const entry: Cached = { key, at: Date.now(), games, mastery, rawGames: rows.length };
  cache.set(teamId, entry);
  return entry;
}

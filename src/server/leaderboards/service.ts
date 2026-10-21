import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMastery, riotAccounts } from "@/server/db/schema";
import { currentSeason } from "@/server/accounts/sync";
import { summariseMatches } from "@/server/accounts/match-summary";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { getCurrentLineup, listPlayers } from "@/server/repositories/team";
import { cardLookFor, type CardLook } from "@/domain/card-style";
import { cardArt, type CardArt } from "@/domain/player-card";
import { isLeaderboardRole, type LeaderboardExtra, type LeaderboardGame, type LeaderboardMastery } from "@/domain/leaderboards";
import { offeredSeasons, seasonOfPatch } from "@/domain/season";
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
  the number of stored games or newly summarised match details, the newest game, the last
  account sync, or the set of accounts itself (a link added or removed, a member joining or
  leaving). A short time limit backs that up.
*/

export interface LeaderboardPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  look: CardLook;
  /** The player's card artwork (their featured champion and skin), for identity on the boards. */
  art: CardArt | null;
  rank: CompactRank | null;
  /** Null until the member chooses a role during setup. */
  primaryRole: Role | null;
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
  const seasons = offeredSeasons(season, games.map((g) => seasonOfPatch(g.patch)));
  const extraSince = games.reduce<number | null>((m, g) => (g.extra && (m === null || g.gameCreation < m) ? g.gameCreation : m), null);
  return {
    players: members.map((p) => ({ id: p.id, name: p.displayName, avatarUrl: avatars[p.id] ?? null, look: cardLookFor(p), art: cardArt(p), rank: rankOf(p.id), primaryRole: p.primaryRole })),
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

/** What changes when the stored history of these accounts changes (the set of accounts, games, summaries, syncs). */
export async function historyFingerprint(db: Db, accountIds: string[]): Promise<string> {
  if (accountIds.length === 0) return "none";
  const ids = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM account_matches WHERE account_id IN (${ids})) AS games,
      (SELECT max(game_creation) FROM account_matches WHERE account_id IN (${ids})) AS newest,
      (SELECT max(summarised_at)::text FROM account_matches WHERE account_id IN (${ids})) AS summarised,
      (SELECT max(last_sync_at)::text FROM riot_accounts WHERE id IN (${ids})) AS synced`);
  const [r] = rowsOf<{ games: number; newest: number | string | null; summarised: string | null; synced: string | null }>(result);
  return [accountIds.join(","), r?.games, r?.newest, r?.summarised, r?.synced].join("|");
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

/** The extra figures a stored game can carry (ParticipantExtraStats), in the order the compact answer lists them. */
const EXTRA_KEYS = ["doubleKills", "tripleKills", "quadraKills", "pentaKills", "largestMultiKill", "largestKillingSpree", "firstBloodKill", "firstBloodAssist", "wardsKilled", "controlWardsBought", "objectiveDamage", "buildingDamage", "turretTakedowns", "ccSeconds", "soloKills"] as const;

/**
 * Every stored game of these accounts, from one compact answer: a game is an array, its account is
 * its place in `accountIds` and its extra figures are an array in EXTRA_KEYS order. Column names,
 * the account's id and the figures' names were most of the bytes when each game was a row
 * (about 835 KB a read in production, 21 Oct 2026). A game's extra figures are null when it has
 * none, as before; a figure that is absent or null is left out.
 */
async function storedGames(db: Db, accountIds: string[]): Promise<{ rows: GameRow[]; raw: number }> {
  const ids = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  const extra = sql.raw(EXTRA_KEYS.map((k) => `extra_stats->'${k}'`).join(", "));
  const result = await db.execute(sql`
    SELECT count(*)::int AS raw, coalesce(json_agg(json_build_array(
             match_id, array_position(ARRAY[${ids}]::uuid[], account_id) - 1, queue_id, champion_id, role,
             CASE WHEN win THEN 1 WHEN NOT win THEN 0 END, patch, game_creation, game_duration,
             kills, deaths, assists, cs, damage, vision_score, gold, wards_placed, team_kills, team_damage,
             CASE WHEN jsonb_typeof(extra_stats) = 'object' AND extra_stats <> '{}'::jsonb THEN json_build_array(${extra}) END)), '[]') AS games
    FROM account_matches
    WHERE account_id IN (${ids}) AND champion_id IS NOT NULL`);
  const [answer] = rowsOf<{ raw: number; games: unknown }>(result);
  type Game = [string, number, number | null, string, string | null, 0 | 1 | null, string | null, number, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, unknown[] | null];
  const games = (typeof answer?.games === "string" ? JSON.parse(answer.games) : (answer?.games ?? [])) as Game[];
  const rows = games.map(([matchId, account, queueId, championId, role, win, patch, gameCreation, duration, kills, deaths, assists, cs, damage, vision, gold, wardsPlaced, teamKills, teamDamage, figures]): GameRow => ({
    match_id: matchId,
    account_id: accountIds[account]!,
    queue_id: queueId,
    champion_id: championId,
    role,
    win: win === null ? null : win === 1,
    patch,
    game_creation: gameCreation,
    game_duration: duration,
    kills,
    deaths,
    assists,
    cs,
    damage,
    vision_score: vision,
    gold,
    wards_placed: wardsPlaced,
    team_kills: teamKills,
    team_damage: teamDamage,
    stats: figures ? (Object.fromEntries(EXTRA_KEYS.flatMap((k, i) => (figures[i] === null || figures[i] === undefined ? [] : [[k, figures[i]]]))) as LeaderboardExtra) : null,
  }));
  return { rows, raw: Number(answer?.raw ?? 0) };
}

async function gamesFor(db: Db, teamId: string, accountIds: string[], playerOf: Map<string, string>): Promise<Pick<Cached, "games" | "mastery" | "rawGames">> {
  if (accountIds.length === 0) return { games: [], mastery: [], rawGames: 0 };
  // Games whose details arrived without their figures being copied yet (normally none; once,
  // after this feature first deploys): copy them now, so nothing reads as missing.
  await summariseMatches(db, { accountIds });
  const key = await historyFingerprint(db, accountIds);
  const hit = cache.get(teamId);
  if (hit && hit.key === key && Date.now() - hit.at < TTL_MS) return hit;

  // Every stored game, with this player's figures from the match details already copied onto it
  // (see match-summary).
  const { rows, raw } = await storedGames(db, accountIds);

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
    const stats = r.stats;
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

  const entry: Cached = { key, at: Date.now(), games, mastery, rawGames: raw };
  cache.set(teamId, entry);
  return entry;
}

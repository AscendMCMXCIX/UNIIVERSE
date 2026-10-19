import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { riotAccounts } from "@/server/db/schema";
import { summariseMatches } from "@/server/accounts/match-summary";
import { historyFingerprint } from "@/server/leaderboards/service";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { listPlayers } from "@/server/repositories/team";
import { seasonOfGame } from "@/domain/season";
import { cardLookFor, type CardLook } from "@/domain/card-style";
import { groupPlayedTogether, type TogetherGame, type TogetherPair, type TogetherRow } from "@/domain/played-together";

/*
  Team → Matches → Played together: Riot games in which two or more current team members were on
  the same side, found in their stored match histories (see domain/played-together for the rules).
  No Riot request is made: the side of each game is copied from the stored match details when
  they are stored (match-summary).

  Cached per team, and dropped as soon as the members' accounts, games, copied sides or syncs
  change (the same fingerprint as Team Leaderboards), or the membership itself changes.
*/

export interface TogetherPlayer {
  id: string;
  name: string;
  avatarUrl: string | null;
  look: CardLook;
}

export interface PlayedTogether {
  games: TogetherGame[];
  pairs: TogetherPair[];
  /** Games with two or more members whose side is not known yet (no stored match details). */
  unknownSide: number;
  players: Record<string, TogetherPlayer>;
}

const TTL_MS = 15 * 60_000;
const cache = new Map<string, { key: string; at: number; value: PlayedTogether }>();
/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export function invalidatePlayedTogetherCache() {
  cache.clear();
}

interface Row {
  match_id: string;
  player_id: string;
  team_id: number | null;
  queue_id: number | null;
  game_creation: string | number;
  patch: string | null;
  game_duration: number | null;
  win: boolean | null;
  champion_id: string;
  role: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  damage: number | null;
  vision_score: number | null;
}

export async function loadPlayedTogether(db: Db, teamId: string): Promise<PlayedTogether> {
  // Current team members only: archived, unfinished and personal-use profiles are left out.
  const [members, avatars] = await Promise.all([listPlayers(db, teamId), avatarUrlsByPlayer(db)]);
  const players: Record<string, TogetherPlayer> = Object.fromEntries(members.map((p) => [p.id, { id: p.id, name: p.displayName, avatarUrl: avatars[p.id] ?? null, look: cardLookFor(p) }]));
  const ids = members.map((p) => p.id);
  const accounts = ids.length ? await db.select({ id: riotAccounts.id, playerId: riotAccounts.playerId }).from(riotAccounts).where(and(inArray(riotAccounts.playerId, ids), eq(riotAccounts.ownerType, "player"))) : [];
  if (accounts.length === 0) return { games: [], pairs: [], unknownSide: 0, players };
  const accountIds = accounts.map((a) => a.id).sort();
  await summariseMatches(db, { accountIds });
  const key = `${ids.slice().sort().join(",")}#${await historyFingerprint(db, accountIds)}`;
  const hit = cache.get(teamId);
  if (hit && hit.key === key && Date.now() - hit.at < TTL_MS) return { ...hit.value, players };

  // Only games another member also has (one indexed pass over the members' games), with each
  // account's player and side.
  const idList = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  const result = await db.execute(sql`
    WITH mine AS (
      SELECT am.match_id, ra.player_id, am.team_id, am.queue_id, am.game_creation, am.patch, am.game_duration, am.win, am.champion_id, am.role,
             CASE WHEN am.kills < 0 THEN NULL ELSE am.kills END AS kills, am.deaths, am.assists, am.cs, am.damage, am.vision_score
      FROM account_matches am
      JOIN riot_accounts ra ON ra.id = am.account_id
      WHERE am.account_id IN (${idList}) AND am.champion_id IS NOT NULL
    ),
    shared AS (
      SELECT match_id FROM mine GROUP BY match_id HAVING count(DISTINCT player_id) >= 2
    )
    SELECT m.* FROM mine m JOIN shared s ON s.match_id = m.match_id`);
  const rows: TogetherRow[] = rowsOf<Row>(result).map((r) => ({
    matchId: r.match_id,
    playerId: r.player_id,
    teamId: r.team_id === null ? null : Number(r.team_id),
    queueId: r.queue_id,
    gameCreation: Number(r.game_creation),
    season: seasonOfGame(r.patch, Number(r.game_creation)),
    durationS: r.game_duration,
    win: r.win,
    championId: r.champion_id,
    role: r.role,
    kills: r.kills,
    deaths: r.deaths,
    assists: r.assists,
    cs: r.cs,
    damage: r.damage,
    vision: r.vision_score,
  }));
  const grouped = groupPlayedTogether(rows, (id) => players[id]?.name ?? "Player");

  const value: PlayedTogether = { games: grouped.games, pairs: grouped.pairs, unknownSide: grouped.unknownSide, players };
  cache.set(teamId, { key, at: Date.now(), value });
  return value;
}

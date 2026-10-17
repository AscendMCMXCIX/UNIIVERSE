import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { riotAccounts } from "@/server/db/schema";
import { summariseMatches } from "@/server/accounts/match-summary";
import { historyFingerprint } from "@/server/leaderboards/service";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { listPlayers } from "@/server/repositories/team";
import { seasonOfGame } from "@/domain/season";
import { cardLookFor, type CardLook } from "@/domain/card-style";
import type { EncounterRow } from "@/domain/encounters";

/*
  Team → Matches → Encounters: the other players in team members' recorded games (rules in
  domain/encounters). Stored data only: account_matches gives each member's games (one row per
  member and game, however many linked accounts stored it) with their side and result, and the
  stored match details give the other nine players. No Riot request.

  Who counts as "another player": anyone with a recorded Riot ID who is not linked to a UNIIVERSE
  profile (current members are in Played together; personal-use and archived profiles are never
  listed as strangers). Players met in only one recorded game are dropped in the database, since
  every view needs two. Accounts (PUUIDs) never leave the server: each player is an opaque key.

  Kept per team for a while and dropped as soon as the members' games, syncs or membership change
  (the same fingerprint as Played together and Team Leaderboards).
*/

export interface EncounterMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  look: CardLook;
  accounts: Array<{ id: string; label: string }>;
}

export interface EncounterData {
  rows: EncounterRow[];
  members: Record<string, EncounterMember>;
  /** Distinct recorded games of the members (the base the encounters come from). */
  memberGames: number;
}

const TTL_MS = 15 * 60_000;
const cache = new Map<string, { key: string; at: number; value: EncounterData }>();
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export function invalidateEncountersCache() {
  cache.clear();
}

/** An account as the page sees it: a short stable key, not the PUUID. */
export const encounterKey = (puuid: string) => createHash("sha256").update(`uniiverse-encounter:${puuid}`).digest("base64url").slice(0, 16);

interface Row {
  player_id: string;
  account_id: string;
  match_id: string;
  game_creation: string | number;
  queue_id: number | null;
  patch: string | null;
  win: boolean | null;
  team_id: number;
  champion_id: string | null;
  puuid: string;
  name: string;
  other_team: number;
  other_champion: string | null;
}

export async function loadEncounters(db: Db, teamId: string, options: { cache?: boolean } = {}): Promise<EncounterData> {
  const [roster, avatars] = await Promise.all([listPlayers(db, teamId), avatarUrlsByPlayer(db)]);
  const ids = roster.map((p) => p.id);
  const accounts = ids.length ? await db.select({ id: riotAccounts.id, playerId: riotAccounts.playerId, label: riotAccounts.label, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine }).from(riotAccounts).where(and(inArray(riotAccounts.playerId, ids), eq(riotAccounts.ownerType, "player"))) : [];
  const members: Record<string, EncounterMember> = Object.fromEntries(roster.map((p) => [p.id, { id: p.id, name: p.displayName, avatarUrl: avatars[p.id] ?? null, look: cardLookFor(p), accounts: accounts.filter((a) => a.playerId === p.id).map((a) => ({ id: a.id, label: a.label || `${a.gameName}#${a.tagLine}` })) }]));
  if (!accounts.length) return { rows: [], members, memberGames: 0 };
  const accountIds = accounts.map((a) => a.id).sort();
  await summariseMatches(db, { accountIds });
  const fingerprint = `${ids.slice().sort().join(",")}#${await historyFingerprint(db, accountIds)}`;
  const hit = cache.get(teamId);
  if (options.cache !== false && hit && hit.key === fingerprint && Date.now() - hit.at < TTL_MS) return { ...hit.value, members };

  // Every account linked to any UNIIVERSE profile: never listed as another player.
  const linked = (await db.select({ puuid: riotAccounts.puuid }).from(riotAccounts).where(and(eq(riotAccounts.ownerType, "player"), isNotNull(riotAccounts.puuid)))).map((r) => r.puuid!).filter(Boolean);
  const idList = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  const notLinked = linked.length ? sql`AND p->>'puuid' NOT IN (${sql.join(linked.map((x) => sql`${x}`), sql`, `)})` : sql``;
  const result = await db.execute(sql`
    WITH mine AS (
      SELECT DISTINCT ON (ra.player_id, am.match_id) ra.player_id, am.account_id, am.match_id, am.game_creation, am.queue_id, am.patch, am.win, am.team_id, am.champion_id
      FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id
      WHERE am.account_id IN (${idList}) AND am.champion_id IS NOT NULL AND am.team_id IS NOT NULL
      ORDER BY ra.player_id, am.match_id, am.account_id
    ),
    enc AS (
      SELECT m.*, p->>'puuid' AS puuid, p->>'name' AS name, (p->>'teamId')::int AS other_team, p->>'championId' AS other_champion
      FROM mine m
      JOIN match_details d ON d.match_id = m.match_id
      CROSS JOIN LATERAL jsonb_array_elements(d.participants) p
      WHERE coalesce(p->>'puuid', '') <> '' AND coalesce(p->>'name', '') <> '' ${notLinked}
    ),
    repeated AS (SELECT puuid FROM enc GROUP BY puuid HAVING count(DISTINCT match_id) >= 2)
    SELECT enc.* FROM enc JOIN repeated USING (puuid)`);
  const [counted] = rowsOf<{ games: number | string }>(await db.execute(sql`SELECT count(DISTINCT match_id) AS games FROM account_matches WHERE account_id IN (${idList}) AND champion_id IS NOT NULL`));
  const keys = new Map<string, string>();
  const rows: EncounterRow[] = rowsOf<Row>(result).map((r) => {
    let key = keys.get(r.puuid);
    if (!key) keys.set(r.puuid, (key = encounterKey(r.puuid)));
    const gameCreation = Number(r.game_creation);
    return {
      matchId: r.match_id,
      playerId: r.player_id,
      accountId: r.account_id,
      gameCreation,
      queueId: r.queue_id === null ? null : Number(r.queue_id),
      season: seasonOfGame(r.patch, gameCreation),
      win: r.win,
      memberChampion: r.champion_id,
      key,
      name: r.name,
      relation: Number(r.other_team) === Number(r.team_id) ? "ally" : "opponent",
      otherChampion: r.other_champion,
    };
  });
  // One name per player, whatever the filters: the most recently recorded Riot ID.
  const latest = new Map<string, { at: number; name: string }>();
  for (const r of rows) if ((latest.get(r.key)?.at ?? -Infinity) < r.gameCreation) latest.set(r.key, { at: r.gameCreation, name: r.name });
  for (const r of rows) r.name = latest.get(r.key)!.name;
  const value: EncounterData = { rows, members, memberGames: Number(counted?.games ?? 0) };
  if (options.cache !== false) cache.set(teamId, { key: fingerprint, at: Date.now(), value });
  return value;
}

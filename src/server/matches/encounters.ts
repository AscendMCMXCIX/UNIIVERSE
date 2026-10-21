import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { riotAccounts } from "@/server/db/schema";
import { summariseMatches } from "@/server/accounts/match-summary";
import { historyFingerprint } from "@/server/leaderboards/service";
import { avatarUrlsByPlayer } from "@/server/repositories/profile";
import { listPlayers } from "@/server/repositories/team";
import { seasonOfGame } from "@/domain/season";
import { cardLookFor, type CardLook } from "@/domain/card-style";
import { filterEncounterRows, summariseEncounters, type EncounterFilter, type EncounterRow, type EncounterSummary } from "@/domain/encounters";

/*
  Team → Matches → Encounters: the other players in team members' recorded games (rules in
  domain/encounters). Stored data only: account_matches gives each member's games (one row per
  member and game, however many linked accounts stored it) with their side and result, and the
  stored match details give the other nine players. No Riot request.

  Who counts as "another player": anyone with a recorded Riot ID who is not linked to a UNIIVERSE
  profile (current members are in Played together; personal-use and archived profiles are never
  listed as strangers). Accounts (PUUIDs) never leave the database: each player is an opaque key,
  computed there (encounterKey).

  The database sends one compact answer, about a sixth of the bytes of the rows it replaced (21 Oct 2026):
  - only players some view can show: twice or more as allies, twice or more as opponents, or in
    two or more games with two or more members. A filter only removes games, so a player outside
    these never appears in any season, mode, member or account view, nor in an insight;
  - each member game once, with the players met in it: no account, id or name repeated.
  The page's rows are rebuilt from it, so every count and filter works as before.

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

/*
  The players' summaries for one set of row filters (season, mode, member, account), kept with the
  cached rows they come from, so switching the list, minimum, order or search, or showing more,
  only re-lists them. A few filter sets per team; replaced rows take their summaries with them.
*/
const summaryCache = new WeakMap<readonly EncounterRow[], Map<string, EncounterSummary[]>>();
const SUMMARY_SETS = 12;

export function encounterSummaries(rows: readonly EncounterRow[], f: EncounterFilter): EncounterSummary[] {
  const id = JSON.stringify([f.season, f.queues, f.playerId, f.accountId]);
  let sets = summaryCache.get(rows);
  if (!sets) summaryCache.set(rows, (sets = new Map()));
  const hit = sets.get(id);
  if (hit) return hit;
  const value = summariseEncounters(filterEncounterRows(rows, f));
  if (sets.size >= SUMMARY_SETS) sets.delete(sets.keys().next().value!);
  sets.set(id, value);
  return value;
}

/** An account as the page sees it: a short stable key, not the PUUID. The SQL below computes the same key. */
export const encounterKey = (puuid: string) => createHash("sha256").update(`uniiverse-encounter:${puuid}`).digest("base64url").slice(0, 16);

/** The database's answer: the players by index, then each member game with the players met in it. */
interface Payload {
  memberGames: number | string;
  /** [key, the most recently recorded Riot ID] */
  players: Array<[string, string]> | null;
  /** [member, account, match, created (ms), queue, patch, win (1, 0 or null), member's champion, [[player, ally (1 or 0), their champion]]] */
  games: Array<[number, number, string, number | string, number | null, string | null, 1 | 0 | null, string | null, Array<[number, 1 | 0, string | null]>]> | null;
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

  const value: EncounterData = { ...(await encounterRows(db, ids, accountIds)), members };
  if (options.cache !== false) cache.set(teamId, { key: fingerprint, at: Date.now(), value });
  return value;
}

/** The encounter rows of the members' games, rebuilt from the database's compact answer (Payload). */
async function encounterRows(db: Db, memberIds: string[], accountIds: string[]): Promise<{ rows: EncounterRow[]; memberGames: number }> {
  const list = (ids: string[]) => sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
  // Postgres plans for 100 participants a game where there are 10, which puts this query over its
  // JIT threshold; compiling it took longer than running it (0.1 to 1.7 s more, measured 21 Oct 2026).
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL jit = off`);
    return tx.execute(sql`
      WITH mine AS (
        SELECT DISTINCT ON (ra.player_id, am.match_id) ra.player_id, am.account_id, am.match_id, am.game_creation, am.queue_id, am.patch, am.win, am.team_id, am.champion_id
        FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id
        WHERE am.account_id IN (${list(accountIds)}) AND am.champion_id IS NOT NULL AND am.team_id IS NOT NULL
        ORDER BY ra.player_id, am.match_id, am.account_id
      ),
      enc AS (
        SELECT m.player_id, m.account_id, m.match_id, m.game_creation, m.queue_id, m.patch, m.win, m.champion_id,
          p.n, p.v->>'puuid' AS puuid, p.v->>'name' AS name, p.v->>'championId' AS champion, coalesce(NULLIF(p.v->>'teamId', '')::int = m.team_id, false) AS ally
        FROM mine m
        JOIN match_details d ON d.match_id = m.match_id
        CROSS JOIN LATERAL jsonb_array_elements(d.participants) WITH ORDINALITY p(v, n)
        WHERE coalesce(p.v->>'puuid', '') <> '' AND coalesce(p.v->>'name', '') <> ''
          AND NOT EXISTS (SELECT 1 FROM riot_accounts l WHERE l.owner_type = 'player' AND l.puuid = p.v->>'puuid')
      ),
      per_game AS (
        SELECT puuid, bool_or(ally) AS ally, bool_or(NOT ally) AS opponent, min(player_id::text) AS first_member, max(player_id::text) AS last_member
        FROM enc GROUP BY puuid, match_id
      ),
      shown AS (
        SELECT puuid FROM per_game GROUP BY puuid
        HAVING count(*) FILTER (WHERE ally) >= 2 OR count(*) FILTER (WHERE opponent) >= 2 OR (count(*) >= 2 AND min(first_member) <> max(last_member))
      ),
      kept AS (SELECT enc.*, (dense_rank() OVER (ORDER BY enc.puuid) - 1)::int AS i FROM enc JOIN shown USING (puuid))
      SELECT json_build_object(
        'memberGames', (SELECT count(DISTINCT match_id) FROM account_matches WHERE account_id IN (${list(accountIds)}) AND champion_id IS NOT NULL),
        'players', (
          SELECT json_agg(json_build_array(left(translate(encode(sha256(convert_to('uniiverse-encounter:' || puuid, 'UTF8')), 'base64'), '+/', '-_'), 16), name) ORDER BY i)
          FROM (SELECT DISTINCT ON (i) i, puuid, name FROM kept ORDER BY i, game_creation DESC) latest
        ),
        'games', (
          SELECT json_agg(json_build_array(array_position(ARRAY[${list(memberIds)}]::uuid[], player_id) - 1, array_position(ARRAY[${list(accountIds)}]::uuid[], account_id) - 1, match_id, game_creation, queue_id, patch, CASE WHEN win THEN 1 WHEN NOT win THEN 0 END, champion_id, met))
          FROM (
            SELECT player_id, account_id, match_id, game_creation, queue_id, patch, win, champion_id, json_agg(json_build_array(i, CASE WHEN ally THEN 1 ELSE 0 END, champion) ORDER BY n) AS met
            FROM kept GROUP BY player_id, account_id, match_id, game_creation, queue_id, patch, win, champion_id
          ) games
        )
      ) AS payload`);
  });
  const raw = rowsOf<{ payload: Payload | string }>(result)[0]?.payload;
  const data: Payload = typeof raw === "string" ? (JSON.parse(raw) as Payload) : (raw ?? { memberGames: 0, players: null, games: null });
  const players = data.players ?? [];
  const rows: EncounterRow[] = [];
  for (const [member, account, matchId, created, queueId, patch, win, memberChampion, met] of data.games ?? []) {
    const gameCreation = Number(created);
    const game = { matchId, playerId: memberIds[member]!, accountId: accountIds[account]!, gameCreation, queueId: queueId === null ? null : Number(queueId), season: seasonOfGame(patch, gameCreation), win: win === null ? null : win === 1, memberChampion };
    for (const [player, ally, theirs] of met) {
      const [key, name] = players[player]!;
      rows.push({ ...game, key, name, relation: ally === 1 ? "ally" : "opponent", otherChampion: theirs });
    }
  }
  return { rows, memberGames: Number(data.memberGames) };
}

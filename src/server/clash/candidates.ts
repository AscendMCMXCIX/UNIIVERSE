import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { candidateKey } from "@/domain/clash-scout/identity";
import type { ScoutPlayer } from "@/domain/clash-scout/types";

/*
  DISCOVERY: which accounts UNIIVERSE already knows by a name, on one server. Only data it holds
  lawfully; nothing is searched anywhere else, no tag is ever tried:

  1. accounts a member verified in the team's earlier scouts (clash_scout_accounts), by the name of
     the Riot ID verified then, with what that scout's screenshots showed of them;
  2. players of the team members' recorded games (match_details), by the name they had in that
     game. Only the members' own linked accounts are left out (a team never scouts itself); an
     account of the retired Draft's opponent lists is a player like any other.

  Names are compared without case or spaces (NFKC). The database narrows the rows twice over, by
  its lower() and by the name as given, because lower() leaves non-Latin capitals alone where the
  database's locale is C; every row is then checked with the same key here.

  Bounded: for a scout's five names, at most 60 rows of earlier scouts and 60 accounts from games
  (one row per account, most games first), and `perName` accounts a name. Discovery only proposes
  accounts: identify.ts reads each one's Riot ID now and its mastery, and judges them.
*/

export const PER_NAME = 3;

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export interface DiscoveredAccount {
  /** Server only: never sent to a browser. */
  puuid: string;
  /** The name it was found under, as it was then ("Jettos#AU1"). */
  nameSeen: string;
  scouts: Array<{ opponentName: string; scoutedAt: Date; player: ScoutPlayer | null }>;
  games: { games: number; lastPlayedAt: Date; champions: string[] } | null;
}

export interface Discovery {
  accounts: DiscoveredAccount[];
  /** More accounts had this name than were kept. */
  capped: boolean;
}

/** The two forms the database compares a name by: lower-cased, and as given (spaces removed in both). */
function sqlKeys(names: string[]): { lowered: string[]; asGiven: string[] } {
  const asGiven = [...new Set(names.flatMap((n) => [n.replace(/\s+/g, ""), n.normalize("NFKC").replace(/\s+/g, "")]))];
  return { lowered: [...new Set(names.map((n) => candidateKey(n)))], asGiven };
}

async function fromScouts(db: Db, teamId: string, platform: string, keys: { lowered: string[]; asGiven: string[] }) {
  const part = sql`replace(split_part(s.content->'players'->(a.slot::int)->>'riotId', '#', 1), ' ', '')`;
  const result = await db.execute(sql`
    SELECT a.puuid, s.opponent_name, s.scouted_at, s.content->'players'->(a.slot::int) AS player
    FROM clash_scout_accounts a JOIN clash_scouts s ON s.id = a.scout_id
    WHERE a.team_id = ${teamId} AND s.team_id = ${teamId} AND s.platform = ${platform}
      AND (lower(${part}) IN (${sql.join(keys.lowered.map((k) => sql`${k}`), sql`, `)}) OR ${part} IN (${sql.join(keys.asGiven.map((k) => sql`${k}`), sql`, `)}))
    ORDER BY s.scouted_at DESC
    LIMIT 60`);
  return rowsOf<{ puuid: string; opponent_name: string; scouted_at: string | Date; player: ScoutPlayer | null }>(result);
}

async function fromGames(db: Db, teamId: string, platform: string, keys: { lowered: string[]; asGiven: string[] }) {
  const part = sql`replace(split_part(x->>'name', '#', 1), ' ', '')`;
  const result = await db.execute(sql`
    SELECT x->>'puuid' AS puuid,
      (array_agg(x->>'name' ORDER BY d.game_creation DESC))[1] AS name,
      count(*) AS games,
      max(d.game_creation) AS last_played,
      jsonb_agg(DISTINCT x->>'championId') AS champions
    FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) AS p(x)
    WHERE d.platform = ${platform} AND x->>'puuid' IS NOT NULL
      AND (lower(${part}) IN (${sql.join(keys.lowered.map((k) => sql`${k}`), sql`, `)}) OR ${part} IN (${sql.join(keys.asGiven.map((k) => sql`${k}`), sql`, `)}))
      AND d.match_id IN (SELECT am.match_id FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id JOIN players pl ON pl.id = ra.player_id WHERE pl.team_id = ${teamId})
      AND NOT EXISTS (SELECT 1 FROM riot_accounts own WHERE own.owner_type = 'player' AND own.puuid = x->>'puuid')
    GROUP BY x->>'puuid'
    ORDER BY count(*) DESC, max(d.game_creation) DESC
    LIMIT 60`);
  return rowsOf<{ puuid: string; name: string | null; games: string | number; last_played: string | number; champions: Array<string | null> | null }>(result);
}

const gamePart = (riotId: string) => riotId.split("#")[0] ?? "";

/** The accounts known by each name, best known first: verified in more scouts, then more games together. */
export async function discoverAccounts(db: Db, teamId: string, platform: string, names: Array<{ slot: number; name: string }>, perName = PER_NAME): Promise<Map<number, Discovery>> {
  const out = new Map<number, Discovery>();
  const wanted = names.filter((n) => n.name.trim()).slice(0, 5);
  if (!wanted.length) return out;
  const keys = sqlKeys(wanted.map((n) => n.name.trim()));
  const [scouts, games] = await Promise.all([fromScouts(db, teamId, platform, keys), fromGames(db, teamId, platform, keys)]);

  // Everything known of each account, by the name key it was seen under.
  const byKey = new Map<string, Map<string, DiscoveredAccount>>();
  const entry = (key: string, puuid: string, nameSeen: string) => {
    const accounts = byKey.get(key) ?? new Map<string, DiscoveredAccount>();
    byKey.set(key, accounts);
    const a = accounts.get(puuid) ?? { puuid, nameSeen, scouts: [], games: null };
    accounts.set(puuid, a);
    return a;
  };
  for (const r of scouts) {
    const riotId = r.player?.riotId ?? "";
    entry(candidateKey(gamePart(riotId)), r.puuid, riotId).scouts.push({ opponentName: r.opponent_name, scoutedAt: new Date(r.scouted_at), player: r.player });
  }
  for (const r of games) {
    if (!r.puuid || !r.name) continue;
    const a = entry(candidateKey(gamePart(r.name)), r.puuid, r.name);
    a.games = { games: Number(r.games), lastPlayedAt: new Date(Number(r.last_played)), champions: (r.champions ?? []).filter((c): c is string => !!c) };
  }

  for (const n of wanted) {
    const accounts = [...(byKey.get(candidateKey(n.name)) ?? new Map<string, DiscoveredAccount>()).values()].sort(
      (a, b) => b.scouts.length - a.scouts.length || (b.games?.games ?? 0) - (a.games?.games ?? 0) || (b.games?.lastPlayedAt.getTime() ?? 0) - (a.games?.lastPlayedAt.getTime() ?? 0),
    );
    out.set(n.slot, { accounts: accounts.slice(0, perName), capped: accounts.length > perName });
  }
  return out;
}

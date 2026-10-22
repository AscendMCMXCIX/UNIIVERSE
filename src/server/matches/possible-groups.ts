import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { registerLocalCache } from "@/server/observability/cache";
import { accountMatches, matchDetails, riotAccounts } from "@/server/db/schema";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { queueLabel } from "@/server/players/match-history";
import { analysePossibleGroups, GROUP_WINDOW_DAYS, type Appearance, type MatchPlayer } from "@/domain/possible-groups";

/*
  Possible groups for one completed match in a player's history, read when its details are opened
  (never while the Match History list loads). Only matches UNIIVERSE already stores are searched: no
  Riot request, nothing new stored. Players linked to a UNIIVERSE profile are never assessed: only
  the other players of the match can be labelled. One query reads, from the stored records of the games played in
  the GROUP_WINDOW_DAYS before this match, the appearances of this match's ten players; the rules
  are in domain/possible-groups. Accounts (PUUIDs) stay on the server: the page gets the players'
  positions in the scoreboard ("slots"), the counts and the dates of the evidence games, never a
  name from another game (so no earlier Riot ID is exposed).

  Kept per match for a while: the answer only changes when an older game is stored late.
*/

export interface MatchGroupView {
  slots: number[];
  label: string;
  games: number;
  opposed: number;
  evidence: Array<{ playedAt: number; queue: string; win: boolean }>;
}

export interface MatchGroupsTeam {
  teamId: number;
  groups: MatchGroupView[];
  note: "clash" | "not-assessed" | null;
  /** Players on this side outside UNIIVERSE with a recorded Riot ID (the only ones assessed). */
  assessed: number;
}

export type MatchGroupsResult = { status: "ok"; teams: MatchGroupsTeam[]; gamesSearched: number; windowDays: number } | { status: "not-found" | "unavailable"; message: string };

const TTL_MS = 30 * 60_000;
const MAX_CACHED = 300;
const cache = new Map<string, { at: number; value: MatchGroupsResult & { status: "ok" } }>();
registerLocalCache(() => cache.clear());
/** postgres-js returns the rows; PGlite wraps them in { rows }. */
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export function invalidatePossibleGroupsCache() {
  cache.clear();
}

interface Row {
  match_id: string;
  game_creation: string | number;
  queue_id: number | null;
  puuid: string;
  team_id: number;
  win: boolean | null;
}

export async function getMatchGroups(db: Db, playerId: string, matchId: string, options: { cache?: boolean } = {}): Promise<MatchGroupsResult> {
  // The same rule as the match window: the match must be one of this player's stored games.
  const accounts = await listAccountsForPlayer(db, playerId);
  const own = accounts.length ? await db.select({ id: accountMatches.accountId }).from(accountMatches).where(and(eq(accountMatches.matchId, matchId), inArray(accountMatches.accountId, accounts.map((a) => a.id)), isNotNull(accountMatches.championId))).limit(1) : [];
  if (!own.length) return { status: "not-found", message: "This match is not in this player's history." };
  const [d] = await db.select({ queueId: matchDetails.queueId, gameCreation: matchDetails.gameCreation, participants: matchDetails.participants }).from(matchDetails).where(eq(matchDetails.matchId, matchId));
  if (!d || !d.participants.length) return { status: "unavailable", message: "Possible groups need the full record of this game." };
  // Which of the ten are linked to a UNIIVERSE profile (read every time: a newly linked account is
  // never labelled from a cached answer).
  const puuids = [...new Set(d.participants.map((p) => p.puuid).filter(Boolean))];
  const linked = new Set(puuids.length ? (await db.select({ puuid: riotAccounts.puuid }).from(riotAccounts).where(and(eq(riotAccounts.ownerType, "player"), inArray(riotAccounts.puuid, puuids)))).map((r) => r.puuid!) : []);
  const cacheKey = `${matchId}|${[...linked].sort().join(",")}`;
  const hit = cache.get(cacheKey);
  if (options.cache !== false && hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const players: MatchPlayer[] = d.participants.map((p, slot) => ({ slot, key: p.puuid, teamId: p.teamId, named: !!p.puuid && !!p.name, registered: linked.has(p.puuid) }));
  const keys = [...new Set(players.filter((p) => p.named && !p.registered).map((p) => p.key))];
  const from = d.gameCreation - GROUP_WINDOW_DAYS * 86_400_000;
  const rows = keys.length
    ? rowsOf<Row>(
        await db.execute(sql`
          SELECT d.match_id, d.game_creation, d.queue_id, p->>'puuid' AS puuid, (p->>'teamId')::int AS team_id, (p->>'win')::boolean AS win
          FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) p
          WHERE d.game_creation >= ${from} AND d.game_creation < ${d.gameCreation} AND d.match_id <> ${matchId}
            AND p->>'puuid' IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`),
      )
    : [];
  const appearances: Appearance[] = rows.map((r) => ({ matchId: r.match_id, gameCreation: Number(r.game_creation), queueId: r.queue_id === null ? null : Number(r.queue_id), key: r.puuid, teamId: Number(r.team_id), win: r.win === true }));
  const analysis = analysePossibleGroups({ matchId, gameCreation: d.gameCreation, queueId: d.queueId }, players, appearances);
  const value = {
    status: "ok" as const,
    teams: analysis.teams.map((t) => ({
      teamId: t.teamId,
      note: t.note,
      assessed: t.assessed,
      groups: t.groups.map((g) => ({ slots: g.slots, label: g.label, games: g.games, opposed: g.opposed, evidence: g.evidence.map((e) => ({ playedAt: e.playedAt, queue: queueLabel(e.queueId), win: e.win })) })),
    })),
    gamesSearched: analysis.gamesSearched,
    windowDays: analysis.windowDays,
  };
  if (options.cache !== false) {
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { at: Date.now(), value });
  }
  return value;
}

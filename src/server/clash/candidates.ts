import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import type { RiotIdentityClient } from "@/server/riot/verify-identity";
import { RiotApiError } from "@/server/riot/api/client";
import { candidateKey, judgeCandidate, rankCandidates, type CandidateEvidence, type CandidateView, type Evidence } from "@/domain/clash-scout/identity";
import type { ScoutPlayer } from "@/domain/clash-scout/types";

/*
  Potential matches for the names of a scout (domain/clash-scout/identity.ts), from data UNIIVERSE
  already holds lawfully, nothing else:

  1. accounts a member verified in the team's earlier scouts (clash_scout_accounts, with what that
     scout's screenshots showed of them), whose Riot ID then had this name;
  2. players of the team members' recorded games (match_details) whose Riot ID in that game had
     this name, on this server (the team's own accounts left out).

  Each candidate's Riot ID is then asked of Riot by its PUUID (ACCOUNT-V1), and kept only when it
  still has exactly this name: a candidate is shown under its current Riot ID, never an older one,
  and a renamed or deleted account is not offered. PUUIDs never leave the server.

  Bounded: five names, three candidates a name, one Riot request a candidate (kept ten minutes).
*/

const PER_NAME = 3;
const TTL_MS = 10 * 60_000;
const current = new Map<string, { at: number; riotId: string | null }>();
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
// What the database compares names by (case and spaces ignored), checked again exactly by candidateKey.
const dbKey = (name: string) => name.toLowerCase().replace(/\s+/g, "");

export interface CandidateQuery {
  slot: number;
  name: string;
  evidence: Evidence;
}

/** The Riot ID an account has now, or null when it no longer exists (kept a while: one request per account per ten minutes). */
async function riotIdNow(client: RiotIdentityClient, platform: string, puuid: string): Promise<string | null> {
  const key = `${platform}:${puuid}`;
  const hit = current.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.riotId;
  try {
    const a = await client.accountByPuuid!(platform, puuid);
    const riotId = a.gameName && a.tagLine ? `${a.gameName}#${a.tagLine}` : null;
    current.set(key, { at: Date.now(), riotId });
    return riotId;
  } catch (err) {
    // An account Riot does not know any more is no candidate; anything else is simply not known now.
    if (err instanceof RiotApiError && err.status === 404) current.set(key, { at: Date.now(), riotId: null });
    return null;
  }
}

/** Accounts verified in the team's earlier scouts on this server, by the name they had then. */
async function fromScouts(db: Db, teamId: string, platform: string, keys: string[]) {
  const result = await db.execute(sql`
    SELECT a.puuid, s.opponent_name, s.scouted_at, s.content->'players'->(a.slot::int) AS player
    FROM clash_scout_accounts a JOIN clash_scouts s ON s.id = a.scout_id
    WHERE a.team_id = ${teamId} AND s.team_id = ${teamId} AND s.platform = ${platform}
      AND lower(replace(split_part(s.content->'players'->(a.slot::int)->>'riotId', '#', 1), ' ', '')) IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})
    ORDER BY s.scouted_at DESC
    LIMIT 60`);
  return rowsOf<{ puuid: string; opponent_name: string; scouted_at: string | Date; player: ScoutPlayer | null }>(result);
}

/** Players of the members' recorded games on this server, by the name they had in that game. */
async function fromGames(db: Db, teamId: string, platform: string, keys: string[]) {
  const result = await db.execute(sql`
    SELECT x->>'puuid' AS puuid, x->>'name' AS name, x->>'championId' AS champion, d.game_creation
    FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) AS p(x)
    WHERE d.platform = ${platform}
      AND lower(replace(split_part(x->>'name', '#', 1), ' ', '')) IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})
      AND d.match_id IN (SELECT am.match_id FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id JOIN players pl ON pl.id = ra.player_id WHERE pl.team_id = ${teamId})
      AND NOT EXISTS (SELECT 1 FROM riot_accounts own WHERE own.puuid = x->>'puuid')
    ORDER BY d.game_creation DESC
    LIMIT 400`);
  return rowsOf<{ puuid: string; name: string | null; champion: string | null; game_creation: string | number }>(result);
}

const evidenceOfStored = (p: ScoutPlayer | null): Evidence => ({
  rank: p?.rank ?? null,
  totalMastery: p?.totalMastery ?? null,
  ranked: (p?.ranked ?? []).filter((c) => c.championId).map((c) => ({ championId: c.championId, games: c.games })),
  mastery: (p?.mastery ?? []).filter((c) => c.championId).map((c) => ({ championId: c.championId, points: c.points, level: c.level })),
});

/** Potential matches for each name, best first (empty when nothing UNIIVERSE holds names the account). */
export async function findCandidates(db: Db, teamId: string, platform: string, queries: CandidateQuery[], client: RiotIdentityClient | null, championName: (id: string) => string, now = new Date()): Promise<Record<number, CandidateView[]>> {
  const out: Record<number, CandidateView[]> = {};
  const wanted = queries.filter((q) => q.name.trim()).slice(0, 5);
  if (!wanted.length || !client?.accountByPuuid) return out;
  const keys = [...new Set(wanted.map((q) => dbKey(q.name)))];
  const [scouts, games] = await Promise.all([fromScouts(db, teamId, platform, keys), fromGames(db, teamId, platform, keys)]);

  // Everything known of each account, by the name key it was seen under.
  const known = new Map<string, Map<string, CandidateEvidence>>();
  const entry = (key: string, puuid: string) => {
    const byName = known.get(key) ?? new Map<string, CandidateEvidence>();
    known.set(key, byName);
    const e = byName.get(puuid) ?? { riotId: "", scouts: [], games: null };
    byName.set(puuid, e);
    return e;
  };
  for (const r of scouts) {
    const riotId = r.player?.riotId ?? "";
    entry(candidateKey(riotId.split("#")[0] ?? ""), r.puuid).scouts.push({ opponentName: r.opponent_name, scoutedAt: new Date(r.scouted_at), evidence: evidenceOfStored(r.player) });
  }
  for (const r of games) {
    if (!r.puuid || !r.name) continue;
    const e = entry(candidateKey(r.name.split("#")[0] ?? ""), r.puuid);
    const at = new Date(Number(r.game_creation));
    e.games ??= { games: 0, lastPlayedAt: at, champions: [] };
    e.games.games++;
    if (at > e.games.lastPlayedAt) e.games.lastPlayedAt = at;
    if (r.champion && !e.games.champions.includes(r.champion)) e.games.champions.push(r.champion);
  }

  for (const q of wanted) {
    const byName = known.get(candidateKey(q.name));
    if (!byName) continue;
    // Accounts verified in an earlier scout first, then the most played with or against.
    const accounts = [...byName.entries()].sort(([, a], [, b]) => b.scouts.length - a.scouts.length || (b.games?.games ?? 0) - (a.games?.games ?? 0)).slice(0, PER_NAME);
    const views = [];
    for (const [puuid, evidence] of accounts) {
      const riotId = await riotIdNow(client, platform, puuid);
      // Renamed since, or gone: not this name any more, so not a candidate for it.
      if (!riotId || candidateKey(riotId.split("#")[0]!) !== candidateKey(q.name)) continue;
      views.push(judgeCandidate(q.evidence, { ...evidence, riotId }, now, championName));
    }
    if (views.length) out[q.slot] = rankCandidates(views);
  }
  return out;
}

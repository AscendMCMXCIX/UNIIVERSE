import { createRiotClient, RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import type { ClashTeam, ClashTournament } from "@/server/riot/api/schemas";
import { cachedFor, invalidateCache, registerLocalCache } from "@/server/observability/cache";
import { createFakeClashSource, fakeClashSettings } from "./fake-clash";
import { ClashApiError, CLASH_FAILURE_TEXT, type ClashSource } from "./source-types";

export { ClashApiError, CLASH_FAILURE_TEXT, type ClashFailure, type ClashSource } from "./source-types";

/*
  What Clash Scout asks Riot about Clash, behind one small interface: the real client
  (CLASH-V1 and ACCOUNT-V1 with the server's key) and the browser tests' stand-in both answer it.

  Bounded and cheap:
  - every answer is kept a while on this server instance (tournaments half an hour, registrations
    and teams five minutes, Riot IDs ten), and a question already on its way is joined, not asked
    twice;
  - a refused or failed call keeps the last answer for one more period;
  - interactive calls wait for Riot at most 8 seconds and try once more at most; Riot's 429 is
    honoured (Retry-After) by the shared rate limiter, which every Riot call of the process uses.
  Nothing here runs in the background: only a member opening Clash Scout or checking a roster.
*/

function failure(err: unknown): ClashApiError {
  if (err instanceof ClashApiError) return err;
  if (err instanceof RiotApiError) {
    if (err.status === 401 || err.status === 403) return new ClashApiError("forbidden", CLASH_FAILURE_TEXT.forbidden);
    if (err.status === 429) return new ClashApiError("rate-limited", CLASH_FAILURE_TEXT["rate-limited"]);
  }
  return new ClashApiError("unavailable", CLASH_FAILURE_TEXT.unavailable);
}

/** Riot's own answers; "not found" is an answer (nothing registered), anything else a failure. */
export function riotClashSource(client: RiotApiClient): ClashSource {
  const ask = async <T,>(call: () => Promise<T>, notFound: T): Promise<T> => {
    try {
      return await call();
    } catch (err) {
      if (err instanceof RiotApiError && err.status === 404) return notFound;
      throw failure(err);
    }
  };
  return {
    tournaments: (platform) => ask(() => client.clashTournaments(platform), []),
    registrations: (platform, puuid) => ask(() => client.clashPlayersByPuuid(platform, puuid), []),
    team: (platform, teamId) => ask<ClashTeam | null>(() => client.clashTeam(platform, teamId), null),
    tournamentOfTeam: (platform, teamId) => ask<ClashTournament | null>(() => client.clashTournamentByTeam(platform, teamId), null),
    riotId: (platform, puuid) =>
      ask(async () => {
        const a = await client.accountByPuuid(platform, puuid);
        return a.gameName && a.tagLine ? `${a.gameName}#${a.tagLine}` : null;
      }, null),
    get requests() {
      return client.requestCount;
    },
  };
}

const MIN = 60_000;
export const CLASH_TTL = { tournaments: 30 * MIN, registrations: 5 * MIN, team: 5 * MIN, tournamentOfTeam: 30 * MIN, riotId: 10 * MIN } as const;

/**
 * Keeps answers for their period on this instance and joins questions already asked. `scope`
 * separates sources that must not share answers (each browser-test scenario has its own).
 */
export function cachedClashSource(inner: ClashSource, scope = "riot"): ClashSource {
  let misses = 0;
  const kept = <T,>(key: string, ttl: number, load: () => Promise<T>) =>
    cachedFor(`clash:${scope}:${key}`, ttl, () => {
      misses++;
      return load();
    });
  return {
    tournaments: (p) => kept(`t:${p}`, CLASH_TTL.tournaments, () => inner.tournaments(p)),
    registrations: (p, puuid) => kept(`r:${p}:${puuid}`, CLASH_TTL.registrations, () => inner.registrations(p, puuid)),
    team: (p, id) => kept(`team:${p}:${id}`, CLASH_TTL.team, () => inner.team(p, id)),
    tournamentOfTeam: (p, id) => kept(`tt:${p}:${id}`, CLASH_TTL.tournamentOfTeam, () => inner.tournamentOfTeam(p, id)),
    riotId: (p, puuid) => kept(`id:${p}:${puuid}`, CLASH_TTL.riotId, () => inner.riotId(p, puuid)),
    get requests() {
      return misses;
    },
  };
}

// A personal-data erasure clears every kept answer at once (server/privacy).
registerLocalCache(() => invalidateCache("clash"));

/**
 * The source for this request: Riot through the cache, or the browser tests' stand-in (in-memory
 * demo only); null when the server has no Riot key. Callers check the switches first.
 */
export async function clashSource(): Promise<ClashSource | null> {
  const fake = await fakeClashSettings();
  if (fake) return cachedClashSource(createFakeClashSource(fake.scenario), `fake-${fake.scenario}`);
  const client = createRiotClient({ maxRetries: 1, timeoutMs: 8_000 });
  return client ? cachedClashSource(riotClashSource(client)) : null;
}

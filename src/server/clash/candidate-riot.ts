import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { createRiotClient, RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { cachedFor } from "@/server/observability/cache";
import { listChampions } from "@/server/repositories/champions";
import type { MasterySnapshot } from "@/domain/clash-scout/mastery-match";
import type { ScoutPlayer } from "@/domain/clash-scout/types";
import { browserTestRiot } from "@/server/riot/browser-test";

/*
  Riot's figures for accounts UNIIVERSE already knows (Clash Scout's candidates, the Testing Lab's
  accounts): an account's Riot ID now (ACCOUNT-V1 by-puuid) and its champion mastery now
  (CHAMPION-MASTERY-V4 by-puuid: the whole list, so a champion absent from it has never been
  played, and its levels add up to the total mastery score). Both APIs are the ones the app already
  uses for members' accounts. And, when a tester typed a full Riot ID, the account with exactly
  that Riot ID (ACCOUNT-V1 by-riot-id, as Clash Scout's "Check"): nothing is guessed or tried.

  - Only when a member asks (a scout's lookup, a test), never in the background.
  - Bounded by the callers: a scout asks about three accounts a name at most.
  - Kept a while on this instance (Riot IDs ten minutes, mastery half an hour), and a question
    already on its way is joined. The process-wide rate limiter honours Riot's 429 (Retry-After).
  - UNIIVERSE_CLASH_LIVE_MASTERY=off stops the mastery calls without a code change: candidates are
    then compared with earlier scouts only, as before.

  Browser tests and the in-memory demo have no Riot key: a stand-in answers there, and every place
  that shows its figures says they are the stand-in's, never Riot's.
*/

export type MasteryLookup = { ok: true; snapshot: MasterySnapshot } | { ok: false; reason: MasteryUnavailable };
export type MasteryUnavailable = "off" | "not-found" | "busy" | "unavailable";

export const MASTERY_UNAVAILABLE_TEXT: Record<MasteryUnavailable, string> = {
  off: "Live mastery lookups are switched off on this server",
  "not-found": "Riot has no mastery for this account",
  busy: "Riot asked the app to slow down: mastery not fetched",
  unavailable: "Riot's mastery could not be fetched right now",
};

export type ExactAccount = { ok: true; puuid: string; riotId: string } | { ok: false; reason: "not-found" | "unavailable" };

export interface CandidateRiot {
  /** True for the browser tests' stand-in: its figures are never shown as Riot's. */
  readonly standIn: boolean;
  /** An account's Riot ID now ("Name#TAG"), or null when it no longer exists or cannot be read now. */
  riotIdNow(platform: string, puuid: string): Promise<string | null>;
  /** The account with exactly this Riot ID, as typed in full by a member (never a guessed tag). */
  accountOf(platform: string, gameName: string, tagLine: string): Promise<ExactAccount>;
  mastery(platform: string, puuid: string): Promise<MasteryLookup>;
  /** Questions that reached Riot (or the stand-in) through this object: cached answers cost nothing. */
  counts(): { accounts: number; mastery: number };
}

export function liveMasteryEnabled(): boolean {
  return process.env.UNIIVERSE_CLASH_LIVE_MASTERY?.trim().toLowerCase() !== "off";
}

const TEN_MIN = 10 * 60_000;
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const HALF_HOUR = 30 * 60_000;

function masteryFailure(err: unknown): MasteryUnavailable {
  if (err instanceof RiotApiError && err.status === 404) return "not-found";
  if (err instanceof RiotApiError && err.status === 429) return "busy";
  return "unavailable";
}

/** Riot's own answers, through the cache. */
export function riotCandidateSource(client: RiotApiClient, championIdByKey: ReadonlyMap<number, string>, now: () => number = Date.now): CandidateRiot {
  let accounts = 0, mastery = 0;
  return {
    standIn: false,
    async riotIdNow(platform, puuid) {
      try {
        return await cachedFor(`clash-id:${platform}:${puuid}`, TEN_MIN, async () => {
          accounts++;
          try {
            const a = await client.accountByPuuid(platform, puuid);
            return a.gameName && a.tagLine ? `${a.gameName}#${a.tagLine}` : null;
          } catch (err) {
            if (err instanceof RiotApiError && err.status === 404) return null;
            throw err;
          }
        });
      } catch {
        return null;
      }
    },
    async accountOf(platform, gameName, tagLine) {
      try {
        const found = await cachedFor(`clash-rid:${platform}:${gameName.normalize("NFC").toLowerCase()}#${tagLine.normalize("NFC").toLowerCase()}`, TEN_MIN, async () => {
          accounts++;
          try {
            const a = await client.accountByRiotId(platform, gameName, tagLine);
            return { puuid: a.puuid, riotId: `${a.gameName?.trim() || gameName}#${a.tagLine?.trim() || tagLine}` };
          } catch (err) {
            if (err instanceof RiotApiError && err.status === 404) return null;
            throw err;
          }
        });
        return found ? { ok: true, ...found } : { ok: false, reason: "not-found" };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
    async mastery(platform, puuid) {
      if (!liveMasteryEnabled()) return { ok: false, reason: "off" };
      try {
        const snapshot = await cachedFor(`clash-mastery:${platform}:${puuid}`, HALF_HOUR, async () => {
          mastery++;
          const list = await client.championMasteries(platform, puuid);
          return {
            champions: list
              .map((m) => ({ championId: championIdByKey.get(m.championId) ?? "", points: m.championPoints }))
              .filter((c) => c.championId)
              .sort((a, b) => b.points - a.points),
            coverage: "full" as const,
            totalScore: list.reduce((n, m) => n + m.championLevel, 0),
            capturedAt: now(),
            label: "Riot, now",
          } satisfies MasterySnapshot;
        });
        return { ok: true, snapshot };
      } catch (err) {
        return { ok: false, reason: masteryFailure(err) };
      }
    },
    counts: () => ({ accounts, mastery }),
  };
}

/** Browser tests and the in-memory demo only (the same rule as the account stand-in in server/riot/verify-identity.ts). */
export function standInMode(): boolean {
  return browserTestRiot();
}

/** The source for this request: Riot through the cache, the stand-in, or null without a Riot key. */
export async function candidateRiot(db: Db): Promise<CandidateRiot | null> {
  if (standInMode()) return standInCandidateSource(db, (await listChampions(db)).map((c) => c.id));
  const client = createRiotClient({ maxRetries: 1, timeoutMs: 8_000 });
  if (!client) return null;
  const byKey = new Map((await listChampions(db)).map((c) => [c.key, c.id]));
  return riotCandidateSource(client, byKey);
}

/*
  THE STAND-IN (browser tests and the demo): accounts are named as the account stand-in names them
  ("browser-test-<name>-<tag>") or as the demo's recorded games name them, and each account's
  mastery is made up from its PUUID, the same every time: a main pool drawn from one of a few
  role-like groups (so several accounts share champions, as real players do), points falling from
  the first champion to the last, and a tail of champions played a little. An account a member
  verified in one of the team's scouts has what that scout's screen showed instead (as if nothing
  were played since), so a later screen of the same player agrees with it, as Riot's figures would.
  Never presented as Riot's.
*/

const POOLS = [
  ["Riven", "Ambessa", "Gwen", "Camille", "Olaf", "Fiora", "Jax", "Irelia"],
  ["Ahri", "Syndra", "Orianna", "Viktor", "Akali"],
  ["Jinx", "Kaisa", "Ezreal", "Caitlyn", "Jhin"],
  ["Thresh", "Nautilus", "Lulu", "Senna", "Braum", "Yuumi"],
  ["LeeSin", "Khazix", "Viego", "Graves", "Kindred"],
];

/** A small seeded random number generator (mulberry32). */
function seeded(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STAND_IN_LABEL = "Stand-in data (test environment)";

/** The stand-in's mastery for an account: the same for the same PUUID, every time. */
export function standInMastery(puuid: string, allChampions: readonly string[], capturedAt: number): MasterySnapshot {
  const rand = seeded(puuid);
  const pool = POOLS[Math.floor(rand() * POOLS.length)]!.filter((id) => allChampions.includes(id));
  const order = [...pool].sort(() => rand() - 0.5);
  const others = allChampions.filter((id) => !pool.includes(id));
  const mains = order.slice(0, 4 + Math.floor(rand() * 2));
  while (mains.length < 6 && others.length) mains.push(others.splice(Math.floor(rand() * others.length), 1)[0]!);
  let points = Math.round(Math.exp(Math.log(80_000) + rand() * Math.log(900_000 / 80_000)));
  const champions: Array<{ championId: string; points: number }> = [];
  for (const id of mains) {
    champions.push({ championId: id, points });
    points = Math.max(2_000, Math.round(points * (0.45 + rand() * 0.47)));
  }
  const tail = 15 + Math.floor(rand() * 25);
  for (let i = 0; i < tail && others.length; i++) champions.push({ championId: others.splice(Math.floor(rand() * others.length), 1)[0]!, points: 200 + Math.floor(rand() * Math.min(points, 20_000)) });
  champions.sort((a, b) => b.points - a.points);
  const level = (p: number) => Math.max(1, Math.min(60, 1 + Math.floor(p / 12_000)));
  return { champions, coverage: "full", totalScore: champions.reduce((n, c) => n + level(c.points), 0), capturedAt, label: STAND_IN_LABEL };
}

/** An account verified in one of the team's scouts: the five champions its latest scout showed, then a tail played less. */
async function scoutedMastery(db: Db, puuid: string, allChampions: readonly string[], capturedAt: number): Promise<MasterySnapshot | null> {
  const result = await db.execute(sql`
    SELECT s.content->'players'->(a.slot::int) AS player
    FROM clash_scout_accounts a JOIN clash_scouts s ON s.id = a.scout_id
    WHERE a.puuid = ${puuid} ORDER BY s.scouted_at DESC LIMIT 1`);
  const player = rowsOf<{ player: ScoutPlayer | null }>(result)[0]?.player;
  const shown = (player?.mastery ?? []).flatMap((c) => (c.championId && c.points !== null ? [{ championId: c.championId, points: c.points }] : []));
  if (!shown.length) return null;
  const rand = seeded(puuid);
  const lowest = Math.min(...shown.map((c) => c.points));
  const others = allChampions.filter((id) => !shown.some((c) => c.championId === id));
  const champions = [...shown];
  const tail = 15 + Math.floor(rand() * 25);
  for (let i = 0; i < tail && others.length && lowest > 1; i++) champions.push({ championId: others.splice(Math.floor(rand() * others.length), 1)[0]!, points: 1 + Math.floor(rand() * Math.min(20_000, lowest - 1)) });
  champions.sort((a, b) => b.points - a.points);
  return { champions, coverage: "full", totalScore: player?.totalMastery ?? null, capturedAt, label: STAND_IN_LABEL };
}

export function standInCandidateSource(db: Db, allChampions: readonly string[], now: () => number = Date.now): CandidateRiot {
  let accounts = 0, mastery = 0;
  return {
    standIn: true,
    async riotIdNow(_platform, puuid) {
      accounts++;
      const named = /^browser-test-(.+)-([^-]+)$/.exec(puuid);
      if (named) return `${named[1]}#${named[2]!.toUpperCase()}`;
      // The demo's own accounts: the name its recorded games give it (the demo has no renames).
      const result = await db.execute(sql`
        SELECT x->>'name' AS name FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) AS p(x)
        WHERE x->>'puuid' = ${puuid} ORDER BY d.game_creation DESC LIMIT 1`);
      const name = rowsOf<{ name: string | null }>(result)[0]?.name;
      return name?.includes("#") ? name : null;
    },
    async accountOf(_platform, gameName, tagLine) {
      accounts++;
      // A demo account by the name its recorded games give it; otherwise, as the account stand-in
      // has it, every well-formed Riot ID exists (server/riot/verify-identity.ts).
      const result = await db.execute(sql`
        SELECT x->>'puuid' AS puuid, x->>'name' AS name FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) AS p(x)
        WHERE lower(x->>'name') = lower(${`${gameName}#${tagLine}`}) AND x->>'puuid' IS NOT NULL ORDER BY d.game_creation DESC LIMIT 1`);
      const row = rowsOf<{ puuid: string; name: string }>(result)[0];
      if (row) return { ok: true, puuid: row.puuid, riotId: row.name };
      return { ok: true, puuid: `browser-test-${gameName.toLowerCase()}-${tagLine.toLowerCase()}`, riotId: `${gameName}#${tagLine.toUpperCase()}` };
    },
    async mastery(_platform, puuid) {
      if (!liveMasteryEnabled()) return { ok: false, reason: "off" };
      mastery++;
      return { ok: true, snapshot: (await scoutedMastery(db, puuid, allChampions, now())) ?? standInMastery(puuid, allChampions, now()) };
    },
    counts: () => ({ accounts, mastery }),
  };
}

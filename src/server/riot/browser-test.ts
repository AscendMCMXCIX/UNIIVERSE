import { RiotApiClient } from "./api/client";
import { RateLimiter } from "./api/rate-limiter";
import fixture from "./fixtures/champions.fixture.json";
import { seasonForDate } from "@/domain/season";

/*
  Browser tests only: with UNIIVERSE_FAKE_RIOT_IDS=1 on the in-memory demo database (never a real
  database, never a deployment), Riot is played by stand-ins, so account creation and a profile's
  Refresh can be tested end to end without a Riot key. Real data never meets them.

  The Refresh stand-in knows only the accounts the account check's stand-in made up
  ("browser-test-<name>-<tag>", server/riot/verify-identity.ts): each has played three Ranked
  Solo/Duo games, an hour apart, ending an hour before the stand-in was first asked about it. Any
  other account does not exist, and demo accounts are never asked (server/accounts/refresh.ts).

  A match window's rank checks (server/players/participant-ranks.ts) on the demo games get a
  made-up LEAGUE-V4 answer per player, fixed by their id: most ranked in Solo/Duo, some in Flex
  too or only, some unranked, and one in ten failing (Riot error 503).
*/

export function browserTestRiot(): boolean {
  return process.env.UNIIVERSE_FAKE_RIOT_IDS === "1" && process.env.UNIIVERSE_DB_MODE === "memory" && !process.env.VERCEL;
}

const PREFIX = "browser-test-";
const HOUR = 3_600_000;
const CHAMPIONS = ["Ahri", "Orianna", "Syndra"].map((id) => Number(fixture.champions.find((c) => c.id === id)!.key));

/** When the stand-in first heard of each account: its games are placed before that, so they never move. */
const firstAsked = new Map<string, number>();

function hashOf(s: string): number {
  let hash = 2_166_136_261;
  for (const ch of s) hash = Math.imul(hash ^ ch.charCodeAt(0), 16_777_619) >>> 0;
  return hash;
}

function gamesOf(puuid: string): Array<{ matchId: string; created: number; champion: number; win: boolean }> {
  if (!puuid.startsWith(PREFIX)) return [];
  if (!firstAsked.has(puuid)) firstAsked.set(puuid, Date.now());
  const base = firstAsked.get(puuid)! - HOUR;
  // Riot's match ids are a platform and a number; this account's number comes from its PUUID.
  const hash = hashOf(puuid);
  return [0, 1, 2].map((i) => ({ matchId: `OC1_9${hash}${3 - i}`, created: base - i * HOUR, champion: CHAMPIONS[i]!, win: i !== 1 }));
}

const DEMO_TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER"];

/** A demo player's ranked entries (the rank checks' stand-in): null for a failed request. */
function demoLeague(puuid: string): unknown[] | null {
  const h = hashOf(puuid);
  const tier = DEMO_TIERS[h % DEMO_TIERS.length]!;
  const entry = (queueType: string, lp: number) => ({ queueType, tier, rank: tier === "MASTER" ? "I" : ["I", "II", "III", "IV"][(h >>> 4) % 4], leaguePoints: lp, wins: 40 + (h % 30), losses: 38 + ((h >>> 3) % 30) });
  const kind = (h >>> 8) % 10;
  if (kind === 9) return null;
  if (kind === 8) return [];
  if (kind === 7) return [entry("RANKED_FLEX_SR", (h >>> 2) % 100)];
  if (kind >= 5) return [entry("RANKED_SOLO_5x5", (h >>> 2) % 100), entry("RANKED_FLEX_SR", (h >>> 5) % 100)];
  return [entry("RANKED_SOLO_5x5", (h >>> 2) % 100)];
}

function participants(puuid: string, game: { champion: number; win: boolean }, first: boolean) {
  return Array.from({ length: 10 }, (_, i) => ({
    puuid: i === 0 ? puuid : `${PREFIX}other-${i}`,
    teamId: i < 5 ? 100 : 200,
    championId: i === 0 ? game.champion : CHAMPIONS[0]! + 1 + i,
    teamPosition: ["MIDDLE", "TOP", "JUNGLE", "BOTTOM", "UTILITY"][i % 5],
    win: i < 5 ? game.win : !game.win,
    kills: 6,
    deaths: 3,
    assists: 7,
    totalMinionsKilled: 190,
    neutralMinionsKilled: 12,
    totalDamageDealtToChampions: 24_000,
    visionScore: 22,
    doubleKills: i === 0 && first ? 1 : 0,
    tripleKills: 0,
    quadraKills: 0,
    pentaKills: 0,
    largestMultiKill: i === 0 && first ? 2 : 1,
  }));
}

/** Riot as a profile's Refresh sees it, for the made-up accounts only. */
async function browserTestFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const puuidIn = (marker: string) => decodeURIComponent(url.split(marker)[1]!.split(/[/?]/)[0]!);
  if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid: puuidIn("/by-puuid/"), game: "lol", region: "oc1" });
  if (url.includes("/riot/account/v1/accounts/by-puuid/")) {
    const m = /^browser-test-(.+)-([^-]+)$/.exec(puuidIn("/by-puuid/"));
    return m ? json({ puuid: puuidIn("/by-puuid/"), gameName: m[1], tagLine: m[2]!.toUpperCase() }) : json({}, 404);
  }
  if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
    const [name, tag] = url.split("/by-riot-id/")[1]!.split("/").map((p) => decodeURIComponent(p.split("?")[0]!));
    return json({ puuid: `${PREFIX}${name!.toLowerCase()}-${tag!.toLowerCase()}`, gameName: name, tagLine: tag });
  }
  if (url.includes("/lol/league/v4/entries/by-puuid/")) {
    const puuid = puuidIn("/by-puuid/");
    if (puuid.startsWith(PREFIX)) return json([]);
    const entries = demoLeague(puuid);
    return entries ? json(entries) : json({}, 503);
  }
  if (url.includes("/lol/champion-mastery/v4/")) return json([]);
  if (url.includes("/lol/match/v5/matches/by-puuid/")) {
    const puuid = puuidIn("/by-puuid/");
    const q = new URL(url).searchParams;
    const since = Number(q.get("startTime") ?? 0) * 1000;
    const start = Number(q.get("start") ?? 0);
    const count = Number(q.get("count") ?? 20);
    const queue = Number(q.get("queue") ?? 420);
    const ids = queue === 420 ? gamesOf(puuid).filter((g) => g.created >= since).map((g) => g.matchId) : [];
    return json(ids.slice(start, start + count));
  }
  const match = /\/lol\/match\/v5\/matches\/([^/?]+)$/.exec(url);
  if (match) {
    const id = decodeURIComponent(match[1]!);
    for (const [puuid] of firstAsked) {
      const games = gamesOf(puuid);
      const game = games.find((g) => g.matchId === id);
      if (game) return json({ metadata: { matchId: id }, info: { gameCreation: game.created, gameDuration: 1_800, gameVersion: `${seasonForDate(new Date(game.created))}.20.1.1`, queueId: 420, teams: [{ teamId: 100, win: game.win, bans: [] }, { teamId: 200, win: !game.win, bans: [] }], participants: participants(puuid, game, game === games[0]) } });
    }
  }
  return json({}, 404);
}

/** The Refresh stand-in, or null outside browser tests. */
export function browserTestRiotClient(): RiotApiClient | null {
  if (!browserTestRiot()) return null;
  return new RiotApiClient({ apiKey: "browser-test", fetchImpl: browserTestFetch as typeof fetch, limiter: new RateLimiter([{ requests: 1_000, seconds: 1 }]), maxRetries: 0, timeoutMs: 5_000, sleep: async () => {} });
}

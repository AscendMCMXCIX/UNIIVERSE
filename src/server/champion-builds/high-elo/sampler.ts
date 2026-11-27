import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";
import { RIOT_PLATFORMS, RIOT_REGIONS, type RiotRegion } from "@/domain/riot-platforms";
import { countDeltas, type CountDelta } from "@/domain/high-elo/counts";
import { hash32, observationWeight, pickWeighted, sampleBySeed, windowFor } from "@/domain/high-elo/sample";
import type { ItemClasses, SkillRanks } from "@/domain/champion-builds";
import { explainRiotError, RiotApiError, RiotDeadlineError } from "@/server/riot/api/client";
import type { RiotMatch, RiotMatchTimeline } from "@/server/riot/api/schemas";
import { observeGame } from "./observe";
import { commitVisit, cursors, populations, savePopulation } from "./store";
import type { HighEloOff } from "./switch";

/*
  The high-elo sampler for Champion Intel's builds (docs/HIGH_ELO_EVIDENCE.md, "How games are
  chosen"; ported from Matchup Intel's 23 Nov 2026 work): one slice, the four regional hosts in
  parallel. PREPARED AND SWITCHED OFF: it refuses to start without the gate on (switch.ts), before it
  makes any client, and no client can read a ladder in this build (sampler-client.ts). For each region it picks a server in proportion to its
  Master+ population, reads its three apex ladders (the PUUIDs stay in memory), samples a few
  players, reads their Solo/Duo games in the server's next window and fetches a few of them, then
  writes the counts and moves the server's cursor in one transaction. A region that runs out of
  time or requests writes nothing and is read again next time, so every window counts once.
  Nothing it returns or logs names a player or a game: counts, servers and hosts only.
*/

/** Players sampled per visit. */
export const SAMPLED_PLAYERS = 6;
/** Games fetched per visit, at most (with their timelines). */
export const GAMES_PER_VISIT = 8;
/** Match ids asked per sampled player (a window holds a day at most). */
const IDS_PER_PLAYER = 20;
/** Riot requests one slice may make, all regions together. */
export const MAX_REQUESTS = 120;
/** Games fetched in one UTC day, at most; the slice stops for the rest of the day after it. */
export const DAILY_GAMES = 1_000;
/** The share of each host's rate-limit windows the sampler may fill: small on sea, which the members' sync uses. */
export const HOST_SHARE: Record<RiotRegion, number> = { americas: 0.5, europe: 0.5, asia: 0.5, sea: 0.25 };

/** An apex ladder as LEAGUE-V4 sends it: its entries' PUUIDs only are read (in memory). */
export interface LeagueList {
  entries: Array<{ puuid: string }>;
}

/** What the sampler asks Riot (RiotApiClient's methods; apexLeague joins the client only in the enabling pull request). */
export interface SamplerClient {
  apexLeague(platform: string, tier: "challenger" | "grandmaster" | "master"): Promise<LeagueList>;
  matchIdsByPuuid(platform: string, puuid: string, options: { startTime?: number; endTime?: number; queue?: number; count?: number }): Promise<string[]>;
  match(platform: string, matchId: string): Promise<RiotMatch>;
  matchTimeline(platform: string, matchId: string): Promise<RiotMatchTimeline>;
}

export interface SliceDeps {
  /** The two keys and the Riot key (switch.ts highEloGate): the slice refuses to start unless on. */
  gate: { on: boolean; off: readonly HighEloOff[] };
  /** A client for a region's hosts (its share set: HOST_SHARE), or null without a key. */
  clientFor: (region: RiotRegion) => SamplerClient | null;
  now: number;
  /** The slice's random seed: which server, players and games (never stored). */
  seed: string;
  keyToId: Map<number, string>;
  /** The item rules (domain/champion-builds itemClasses) of the current game data. */
  items: ItemClasses;
  /** Each champion's ability ranks (its skill order), or null. */
  ranksOf: (champion: string) => SkillRanks | null;
  /** The patches whose counts are kept (the current and the previous one); empty keeps all. */
  keep: readonly string[];
  sampled?: number;
  games?: number;
  maxRequests?: number;
  dailyGames?: number;
}

export interface RegionReport {
  region: RiotRegion;
  /** The server visited ("euw1"): a server, not a person. */
  platform?: string;
  outcome: "written" | "nothing new" | "out of time" | "out of requests" | "taken by another slice" | "storage cap" | "failed" | "no key" | "daily cap";
  ladder?: number;
  sampled?: number;
  found?: number;
  fetched?: number;
  observations?: number;
  requests: number;
  error?: string;
}

/** A client that counts its requests and refuses more than `cap`. */
function counted(client: SamplerClient, cap: number): SamplerClient & { requests: number } {
  const c = { requests: 0 } as SamplerClient & { requests: number };
  const take = () => {
    if (c.requests >= cap) throw new OutOfRequests();
    c.requests += 1;
  };
  c.apexLeague = (p, t) => (take(), client.apexLeague(p, t));
  c.matchIdsByPuuid = (p, u, o) => (take(), client.matchIdsByPuuid(p, u, o));
  c.match = (p, m) => (take(), client.match(p, m));
  c.matchTimeline = (p, m) => (take(), client.matchTimeline(p, m));
  return c;
}

class OutOfRequests extends Error {}

/** A key Riot refuses stops every region: nothing more is asked with it. */
const refusedKey = (err: unknown) => err instanceof RiotApiError && (err.status === 401 || err.status === 403);

/** Games fetched today (UTC), from app_settings "high_elo_day". */
async function gamesToday(db: Db, now: number): Promise<{ day: string; games: number }> {
  const day = new Date(now).toISOString().slice(0, 10);
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "high_elo_day"));
  const value = row?.value as { day?: string; games?: number } | undefined;
  return { day, games: value?.day === day ? (value.games ?? 0) : 0 };
}

async function addGamesToday(db: Db, day: string, games: number): Promise<void> {
  await db.insert(appSettings).values({ key: "high_elo_day", value: { day, games }, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value: { day, games }, updatedAt: new Date() } });
}

/** Thrown when a slice is asked to run with the gate off: no client is made, nothing is read or written. */
export class HighEloOffError extends Error {
  constructor(off: readonly HighEloOff[]) {
    super(`high-elo collection is off (${off.join(", ")})`);
  }
}

/** One slice: every region in parallel, each written on its own. Refuses (HighEloOffError) unless the gate is on. */
export async function runHighEloSlice(db: Db, deps: SliceDeps): Promise<{ regions: RegionReport[]; games: number; observations: number; cpuMs: number }> {
  if (!deps.gate.on) throw new HighEloOffError(deps.gate.off);
  const cpu = process.cpuUsage();
  const today = await gamesToday(db, deps.now);
  const dailyLeft = (deps.dailyGames ?? DAILY_GAMES) - today.games;
  const [pops, cursorOf] = await Promise.all([populations(db), cursors(db)]);
  const perRegion = Math.floor((deps.maxRequests ?? MAX_REQUESTS) / RIOT_REGIONS.length);
  const gamesPerVisit = Math.max(0, Math.min(deps.games ?? GAMES_PER_VISIT, Math.floor(dailyLeft / RIOT_REGIONS.length)));
  let keyRefused: unknown = null;

  const visit = async (region: RiotRegion): Promise<RegionReport> => {
    const base = deps.clientFor(region);
    if (!base) return { region, outcome: "no key", requests: 0 };
    if (gamesPerVisit <= 0) return { region, outcome: "daily cap", requests: 0 };
    const client = counted(base, perRegion);
    const report: RegionReport = { region, outcome: "failed", requests: 0 };
    try {
      // 1. A server of the region, in proportion to its Master+ players (one never read counts as average).
      const servers = RIOT_PLATFORMS.filter((p) => p.region === region);
      const u = hash32(`${deps.seed}|${region}`) / 2 ** 32;
      const platform = pickWeighted(
        servers.map((s) => {
          const p = pops.get(s.id);
          return { item: s.id, weight: p ? p.challenger + p.grandmaster + p.master : null };
        }),
        u,
      )!;
      report.platform = platform;
      // 2. Its three apex ladders, in memory only; their sizes are kept.
      const [challenger, grandmaster, master] = await Promise.all((["challenger", "grandmaster", "master"] as const).map((t) => client.apexLeague(platform, t).catch((err) => (err instanceof RiotApiError && err.status === 404 ? { entries: [] } : Promise.reject(err)))));
      const masterPlus = new Set([...challenger!.entries, ...grandmaster!.entries, ...master!.entries].map((e) => e.puuid));
      await savePopulation(db, { platform, challenger: challenger!.entries.length, grandmaster: grandmaster!.entries.length, master: master!.entries.length, readAt: new Date(deps.now) });
      report.ladder = masterPlus.size;
      // 3. The server's next window.
      const from = cursorOf.get(platform) ?? null;
      const window = windowFor(from, deps.now);
      if (!window || !masterPlus.size) return { ...report, outcome: "nothing new", requests: client.requests };
      // 4–5. A uniform sample of its Master+ players, and their Solo/Duo games in the window.
      const players = sampleBySeed([...masterPlus], deps.sampled ?? SAMPLED_PLAYERS, `${deps.seed}|${platform}`, (p) => p);
      report.sampled = players.length;
      const found = new Set<string>();
      for (const puuid of players) {
        for (const id of await client.matchIdsByPuuid(platform, puuid, { startTime: Math.floor(window.start / 1000), endTime: Math.floor(window.end / 1000), queue: 420, count: IDS_PER_PLAYER })) found.add(id);
      }
      report.found = found.size;
      // 6. At most G of the games found, chosen uniformly, each with its timeline (a missing timeline keeps the record's choices).
      const chosen = sampleBySeed([...found], gamesPerVisit, `${deps.seed}|${platform}|games`, (m) => m);
      const fetched: Array<{ match: RiotMatch; timeline: RiotMatchTimeline | null }> = [];
      for (const id of chosen) {
        const match = await client.match(platform, id);
        const timeline = await client.matchTimeline(platform, id).catch((err) => {
          if (refusedKey(err) || err instanceof RiotDeadlineError || err instanceof OutOfRequests) throw err;
          return null;
        });
        fetched.push({ match, timeline });
      }
      report.fetched = fetched.length;
      // 7. Every Master+ player of each game, weighted by one over the chance the slice included it.
      const merged = new Map<string, CountDelta>();
      let observations = 0;
      for (const g of fetched) {
        const seen = observeGame({
          ...g,
          masterPlus,
          keyToId: deps.keyToId,
          items: deps.items,
          ranksOf: deps.ranksOf,
          weightFor: (inGame) => observationWeight({ population: masterPlus.size, inGame, sampled: players.length, found: found.size, fetched: fetched.length, coverage: window.coverage }),
        });
        if (!seen) continue;
        observations += seen.observations.length;
        for (const d of countDeltas(seen.observations, seen.patch, region)) {
          const key = [d.patch, d.region, d.role, d.champion, d.opponent, d.kind, d.value].join("|");
          const was = merged.get(key);
          merged.set(key, was ? { ...was, n: was.n + d.n, w: was.w + d.w, w2: was.w2 + d.w2, ww: was.ww + d.ww } : d);
        }
      }
      report.observations = observations;
      // The counts and the cursor together, or nothing.
      const written = await commitVisit(db, { platform, from, to: window.end, games: fetched.length, deltas: [...merged.values()], keep: deps.keep });
      return { ...report, outcome: written === "written" ? "written" : written === "taken" ? "taken by another slice" : "storage cap", requests: client.requests };
    } catch (err) {
      if (refusedKey(err)) keyRefused = err;
      const outcome: RegionReport["outcome"] = err instanceof OutOfRequests ? "out of requests" : err instanceof RiotDeadlineError ? "out of time" : "failed";
      return { ...report, outcome, requests: client.requests, ...(outcome === "failed" ? { error: explainRiotError(err) } : {}) };
    }
  };

  const regions = await Promise.all(RIOT_REGIONS.map(visit));
  const games = regions.filter((r) => r.outcome === "written").reduce((s, r) => s + (r.fetched ?? 0), 0);
  if (games) await addGamesToday(db, today.day, today.games + games);
  if (keyRefused) throw keyRefused;
  const used = process.cpuUsage(cpu);
  return { regions, games, observations: regions.reduce((s, r) => s + (r.observations ?? 0), 0), cpuMs: Math.round((used.user + used.system) / 1000) };
}

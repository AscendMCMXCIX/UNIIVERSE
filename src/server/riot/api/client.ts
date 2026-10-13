import type { z } from "zod";
import { parseRateLimits, RateLimiter } from "./rate-limiter";
import { accountSchema, championMasterySchema, leagueEntriesSchema, leagueListSchema, matchIdsSchema, matchSchema, summonerSchema, type ChampionMastery, type LeagueEntry, type LeagueList, type RiotAccount, type RiotMatch } from "./schemas";

export type Platform = "euw1" | "eun1" | "na1" | "kr" | "br1" | "la1" | "la2" | "oc1" | "tr1" | "ru" | "jp1" | "ph2" | "sg2" | "th2" | "tw2" | "vn2" | "me1";
export type Region = "europe" | "americas" | "asia" | "sea";
export type Tier = "CHALLENGER" | "GRANDMASTER" | "MASTER";

const PLATFORM_REGION: Record<string, Region> = {
  euw1: "europe",
  eun1: "europe",
  tr1: "europe",
  ru: "europe",
  me1: "europe",
  na1: "americas",
  br1: "americas",
  la1: "americas",
  la2: "americas",
  kr: "asia",
  jp1: "asia",
  oc1: "sea",
  ph2: "sea",
  sg2: "sea",
  th2: "sea",
  tw2: "sea",
  vn2: "sea",
};

export function regionFor(platform: string): Region {
  const r = PLATFORM_REGION[platform.toLowerCase()];
  if (!r) throw new Error(`Unknown Riot platform "${platform}"`);
  return r;
}

export function parsePlatforms(spec: string | undefined, fallback: string[] = ["euw1", "kr", "na1"]): string[] {
  const list = (spec ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && PLATFORM_REGION[s]);
  return list.length ? list : fallback;
}

export class RiotApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "RiotApiError";
  }
}

/** Plain-language cause of a failed Riot request, for job summaries and the Data health panel. */
export function explainRiotError(err: unknown): string {
  if (!(err instanceof RiotApiError)) return (err as Error)?.message ?? String(err);
  switch (err.status) {
    case 401:
      return "Riot API 401: Riot does not recognise the key that was sent. Compare the key in use (below) with the one shown on developer.riotgames.com; a changed variable applies only after a redeploy and must be set for the Production environment.";
    case 403:
      return "Riot API 403: the key was rejected. Development keys expire after 24 hours; regenerate it at developer.riotgames.com and update RIOT_API_KEY.";
    case 404:
      return "Riot API 404: nothing at that route; check RIOT_PLATFORMS (e.g. euw1, kr, na1).";
    case 429:
      return "Riot API 429: rate limited; the job slows down automatically.";
    case 0:
      return `Riot API unreachable: ${err.message}`;
    default:
      return err.message;
  }
}

export interface RiotClientOptions {
  apiKey: string;
  limiter?: RateLimiter;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  /** Base URL template; `{host}` is replaced by the platform/region host. Overridable for tests. */
  baseUrl?: string;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Minimal Riot Games API client: typed, validated, rate-limited, with Retry-After and exponential
 * backoff handling. The key never leaves the server.
 */
export class RiotApiClient {
  private readonly limiter: RateLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly sleep: (ms: number) => Promise<void>;
  public requestCount = 0;
  /** Set when the configured key does not have the shape Riot issues; appended to failure messages. */
  public keyWarning: string | undefined;
  /** Last characters of the key in use, so an operator can tell which key a deployment carries. */
  public keyFingerprint: string | undefined;

  constructor(private readonly options: RiotClientOptions) {
    this.limiter = options.limiter ?? new RateLimiter(parseRateLimits(process.env.RIOT_RATE_LIMITS));
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 4;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.baseUrl = options.baseUrl ?? "https://{host}.api.riotgames.com";
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private url(host: string, path: string): string {
    return `${this.baseUrl.replace("{host}", host)}${path}`;
  }

  async get<T>(host: string, path: string, schema: z.ZodType<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      await this.limiter.acquire();
      this.requestCount += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(this.url(host, path), { headers: { "X-Riot-Token": this.options.apiKey }, signal: controller.signal });
      } catch (err) {
        clearTimeout(timer);
        if (attempt++ >= this.maxRetries) throw new RiotApiError(`Network error calling ${path}: ${(err as Error).message}`, 0, true);
        await this.sleep(500 * 2 ** attempt);
        continue;
      }
      clearTimeout(timer);

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "2");
        this.limiter.pause(Number.isFinite(retryAfter) ? retryAfter : 2);
        if (attempt++ >= this.maxRetries) throw new RiotApiError(`Rate limited on ${path}`, 429, true);
        continue;
      }
      if (res.status >= 500) {
        if (attempt++ >= this.maxRetries) throw new RiotApiError(`Riot API ${res.status} on ${path}`, res.status, true);
        await this.sleep(500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        throw new RiotApiError(`Riot API ${res.status} on ${path}`, res.status, false);
      }
      const json = await res.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new RiotApiError(`Unexpected response shape on ${path}: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`, res.status, false);
      return parsed.data;
    }
  }

  leagueList(platform: string, tier: Tier, queue = "RANKED_SOLO_5x5"): Promise<LeagueList> {
    const path = tier === "CHALLENGER" ? "challengerleagues" : tier === "GRANDMASTER" ? "grandmasterleagues" : "masterleagues";
    return this.get(platform, `/lol/league/v4/${path}/by-queue/${queue}`, leagueListSchema);
  }

  async puuidBySummonerId(platform: string, summonerId: string): Promise<string> {
    const s = await this.get(platform, `/lol/summoner/v4/summoners/${encodeURIComponent(summonerId)}`, summonerSchema);
    return s.puuid;
  }

  matchIdsByPuuid(platform: string, puuid: string, options: { startTime?: number; queue?: number; count?: number } = {}): Promise<string[]> {
    const params = new URLSearchParams();
    if (options.startTime) params.set("startTime", String(Math.floor(options.startTime)));
    params.set("queue", String(options.queue ?? 420));
    params.set("count", String(options.count ?? 100));
    return this.get(regionFor(platform), `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`, matchIdsSchema);
  }

  match(platform: string, matchId: string): Promise<RiotMatch> {
    return this.get(regionFor(platform), `/lol/match/v5/matches/${encodeURIComponent(matchId)}`, matchSchema);
  }

  /** Riot ID (gameName#tagLine) → account. Names are sent exactly as entered (full Unicode). */
  accountByRiotId(platform: string, gameName: string, tagLine: string): Promise<RiotAccount> {
    return this.get(regionFor(platform), `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, accountSchema);
  }

  /** All match ids for a player (any queue) since a time, newest first. */
  allMatchIdsByPuuid(platform: string, puuid: string, options: { startTime?: number; count?: number; start?: number } = {}): Promise<string[]> {
    const params = new URLSearchParams();
    if (options.startTime) params.set("startTime", String(Math.floor(options.startTime)));
    params.set("count", String(options.count ?? 100));
    if (options.start) params.set("start", String(options.start));
    return this.get(regionFor(platform), `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`, matchIdsSchema);
  }

  championMasteries(platform: string, puuid: string): Promise<ChampionMastery[]> {
    return this.get(platform, `/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}`, championMasterySchema);
  }

  leagueEntriesByPuuid(platform: string, puuid: string): Promise<LeagueEntry[]> {
    return this.get(platform, `/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`, leagueEntriesSchema);
  }
}

/** Trims whitespace and stray quotes that sometimes come along when a key is pasted into a dashboard. */
export function normaliseRiotKey(raw: string | undefined): string | null {
  const key = (raw ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
  return key || null;
}

export const RIOT_KEY_PATTERN = /^RGAPI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Riot keys (development, personal and production alike) are "RGAPI-" followed by a UUID. */
export function riotKeyWarning(key: string): string | undefined {
  return RIOT_KEY_PATTERN.test(key) ? undefined : "RIOT_API_KEY does not look like a Riot key (expected RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx); check the value in the host's environment variables.";
}

/** The key's last four characters, enough to tell which key a deployment is using without revealing it. */
export function riotKeyFingerprint(key: string): string {
  return `…${key.slice(-4)}`;
}

export function createRiotClient(): RiotApiClient | null {
  const apiKey = normaliseRiotKey(process.env.RIOT_API_KEY);
  if (!apiKey) return null;
  const client = new RiotApiClient({ apiKey });
  client.keyWarning = riotKeyWarning(apiKey);
  client.keyFingerprint = riotKeyFingerprint(apiKey);
  return client;
}

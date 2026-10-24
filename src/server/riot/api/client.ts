import type { z } from "zod";
import { parseRateLimits, processRiotLimiters, RateLimiterPool, type Limiter } from "./rate-limiter";
import { accountSchema, activeRegionSchema, championMasterySchema, leagueEntriesSchema, matchIdsSchema, matchSchema, matchTimelineSchema, platformStatusSchema, summonerSchema, type ChampionMastery, type LeagueEntry, type RiotAccount, type RiotMatch, type RiotMatchTimeline } from "./schemas";
import { accountRegionFor, DEFAULT_RIOT_PLATFORM, parsePlatforms as parsePlatformList, regionFor as regionForPlatform, type RiotRegion } from "@/domain/riot-platforms";

export type Region = RiotRegion;

/** Regional routing host for a platform (see src/domain/riot-platforms.ts for the registry). */
export function regionFor(platform: string): Region {
  return regionForPlatform(platform);
}

/** RIOT_PLATFORMS parser (list, "all" or regional shorthands); defaults to the OCE server. */
export function parsePlatforms(spec: string | undefined, fallback: string[] = [DEFAULT_RIOT_PLATFORM]): string[] {
  return parsePlatformList(spec, fallback);
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
      return "Riot API 404: nothing at that route; check RIOT_PLATFORMS (platform ids such as oc1, euw1, kr, na1, or \"all\").";
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
  /** Tests: one limiter shared by every host. Production uses a per-host pool (Riot counts limits per host). */
  limiter?: Limiter;
  /** Per-host limits; defaults to RIOT_RATE_LIMITS or the development-key limits. */
  limiters?: RateLimiterPool;
  /** Share of the key's rate limits this client may use (default 1; background collection 0.8). */
  limitShare?: number;
  /** Never wait for the rate limits: a request with no free slot within `limitShare` fails at once (429). */
  noWait?: boolean;
  /** With `limiters`: still follow the limits Riot reports (the shared process pool does). */
  adoptReportedLimits?: boolean;
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
  private readonly sharedLimiter: Limiter | null;
  public readonly limiters: RateLimiterPool;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limitShare: number;
  public requestCount = 0;
  /** Requests per host, for job summaries (which regions consumed the budget). */
  public readonly requestsByHost = new Map<string, number>();
  /** Set when the configured key does not have the shape Riot issues; appended to failure messages. */
  public keyWarning: string | undefined;
  /** Last characters of the key in use, so an operator can tell which key a deployment carries. */
  public keyFingerprint: string | undefined;

  /** Limits pinned by RIOT_RATE_LIMITS (or a test) are never replaced by the response headers. */
  private readonly pinnedLimits: boolean;

  constructor(private readonly options: RiotClientOptions) {
    this.sharedLimiter = options.limiter ?? null;
    this.pinnedLimits = (!!options.limiters && !options.adoptReportedLimits) || !!options.limiter || !!process.env.RIOT_RATE_LIMITS;
    this.limiters = options.limiters ?? new RateLimiterPool(parseRateLimits(process.env.RIOT_RATE_LIMITS));
    this.limitShare = options.limitShare ?? 1;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 4;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.baseUrl = options.baseUrl ?? "https://{host}.api.riotgames.com";
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  private url(host: string, path: string): string {
    return `${this.baseUrl.replace("{host}", host)}${path}`;
  }

  private limiterFor(host: string): Limiter {
    return this.sharedLimiter ?? this.limiters.for(host);
  }

  async get<T>(host: string, path: string, schema: z.ZodType<T>): Promise<T> {
    let attempt = 0;
    const limiter = this.limiterFor(host);
    for (;;) {
      if (this.options.noWait && limiter.tryAcquire) {
        if (!limiter.tryAcquire(this.limitShare)) throw new RiotApiError(`No room in the rate limits for ${path} now`, 429, true);
      } else await limiter.acquire(this.limitShare);
      this.requestCount += 1;
      this.requestsByHost.set(host, (this.requestsByHost.get(host) ?? 0) + 1);
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
      if (!this.pinnedLimits) {
        // Riot states this key's application limits on every response; follow them.
        const reported = res.headers.get("x-app-rate-limit");
        if (reported) this.limiters.adopt(parseRateLimits(reported, []));
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "2");
        limiter.pause(Number.isFinite(retryAfter) ? retryAfter : 2);
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

  /** Cheapest authenticated call there is: used to check whether the key is accepted at all. */
  platformStatus(platform: string): Promise<{ id: string }> {
    return this.get(platform, `/lol/status/v4/platform-data`, platformStatusSchema);
  }

  async puuidBySummonerId(platform: string, summonerId: string): Promise<string> {
    const s = await this.get(platform, `/lol/summoner/v4/summoners/${encodeURIComponent(summonerId)}`, summonerSchema);
    return s.puuid;
  }

  /** Match ids of one queue, newest first; `start` pages further back through the list. */
  matchIdsByPuuid(platform: string, puuid: string, options: { startTime?: number; endTime?: number; queue?: number; count?: number; start?: number } = {}): Promise<string[]> {
    const params = new URLSearchParams();
    if (options.startTime) params.set("startTime", String(Math.floor(options.startTime)));
    if (options.endTime) params.set("endTime", String(Math.floor(options.endTime)));
    params.set("queue", String(options.queue ?? 420));
    params.set("count", String(options.count ?? 100));
    if (options.start) params.set("start", String(options.start));
    return this.get(regionFor(platform), `/lol/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids?${params.toString()}`, matchIdsSchema);
  }

  match(platform: string, matchId: string): Promise<RiotMatch> {
    return this.get(regionFor(platform), `/lol/match/v5/matches/${encodeURIComponent(matchId)}`, matchSchema);
  }

  /** The match's timeline: who bought what and when, and the order skills were levelled. */
  matchTimeline(platform: string, matchId: string): Promise<RiotMatchTimeline> {
    return this.get(regionFor(platform), `/lol/match/v5/matches/${encodeURIComponent(matchId)}/timeline`, matchTimelineSchema);
  }

  /** Riot ID (gameName#tagLine) → account. Names are sent exactly as entered (full Unicode). */
  accountByRiotId(platform: string, gameName: string, tagLine: string): Promise<RiotAccount> {
    return this.get(accountRegionFor(platform), `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, accountSchema);
  }

  /** PUUID → current Riot ID (follows renames made outside UNIIVERSE). */
  accountByPuuid(platform: string, puuid: string): Promise<RiotAccount> {
    return this.get(accountRegionFor(platform), `/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`, accountSchema);
  }

  /**
   * The platform (game server) a PUUID actively plays League on, from Riot's own records. Any
   * regional host answers for any account; the caller's platform only picks the host to ask.
   */
  async activePlatformByPuuid(platformHint: string, puuid: string): Promise<string | null> {
    const r = await this.get(accountRegionFor(platformHint), `/riot/account/v1/region/by-game/lol/by-puuid/${encodeURIComponent(puuid)}`, activeRegionSchema);
    return r.region ?? null;
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

export function createRiotClient(overrides: Pick<RiotClientOptions, "maxRetries" | "timeoutMs" | "limitShare" | "noWait"> = {}): RiotApiClient | null {
  const apiKey = normaliseRiotKey(process.env.RIOT_API_KEY);
  if (!apiKey) return null;
  // Every client in the process shares one limiter pool, as Riot counts the key as a whole.
  const client = new RiotApiClient({ apiKey, ...overrides, limiters: processRiotLimiters(), adoptReportedLimits: true });
  client.keyWarning = riotKeyWarning(apiKey);
  client.keyFingerprint = riotKeyFingerprint(apiKey);
  return client;
}

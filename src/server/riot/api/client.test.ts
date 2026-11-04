import { describe, expect, it } from "vitest";
import { RiotApiClient, RiotApiError, RiotDeadlineError, riotKeyTier } from "./client";
import { RateLimiter } from "./rate-limiter";

function clientWith(calls: string[]) {
  const fetchImpl = async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) return json({ puuid: "p", gameName: "Name", tagLine: "TAG" });
    if (url.includes("/riot/account/v1/region/by-game/")) return json({ puuid: "p", game: "lol", region: "oc1" });
    if (url.includes("/lol/match/v5/matches/by-puuid/")) return json(["OC1_1"]);
    if (url.includes("/lol/status/v4/platform-data")) return json({ id: "OC1", name: "Oceania", locales: [], maintenances: [], incidents: [] });
    return new Response("{}", { status: 404 });
  };
  return new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
}

describe("Riot API client hosts", () => {
  it("uses a routing value that serves ACCOUNT-V1 for Riot ID and active-region lookups, the platform's own region for matches", async () => {
    const calls: string[] = [];
    const client = clientWith(calls);
    await client.accountByRiotId("oc1", "Name", "TAG");
    await client.activePlatformByPuuid("oc1", "p");
    await client.matchIdsByPuuid("oc1", "p", { count: 1 });
    await client.accountByRiotId("na1", "Name", "TAG");
    await client.accountByRiotId("euw1", "Name", "TAG");
    await client.platformStatus("oc1");
    expect(calls[0]).toMatch(/^https:\/\/asia\.api\.riotgames\.com\/riot\/account\/v1\/accounts\/by-riot-id\/Name\/TAG/);
    expect(calls[1]).toMatch(/^https:\/\/asia\.api\.riotgames\.com\/riot\/account\/v1\/region\/by-game\/lol\/by-puuid\/p/);
    expect(calls[2]).toMatch(/^https:\/\/sea\.api\.riotgames\.com\/lol\/match\/v5\/matches\/by-puuid\/p\/ids/);
    expect(calls[3]).toMatch(/^https:\/\/americas\.api\.riotgames\.com\/riot\/account\/v1/);
    expect(calls[4]).toMatch(/^https:\/\/europe\.api\.riotgames\.com\/riot\/account\/v1/);
    expect(calls[5]).toMatch(/^https:\/\/oc1\.api\.riotgames\.com\/lol\/status\/v4\/platform-data/);
    expect(calls.every((u) => !u.includes("sea.api.riotgames.com/riot/account"))).toBe(true);
  });
});

describe("the key's tier, from the limits Riot states for it", () => {
  it("tells a Production key from a Development or Personal one, and nothing more", () => {
    expect(riotKeyTier("20:1,100:120")).toBe("development or personal");
    expect(riotKeyTier("100:120,20:1")).toBe("development or personal");
    expect(riotKeyTier("500:10,30000:600")).toBe("production");
    expect(riotKeyTier(undefined)).toBe("unknown");
    expect(riotKeyTier("not limits")).toBe("unknown");
    expect(riotKeyTier("10:1,50:120")).toBe("unknown");
  });
});

describe("Riot API client rate limits", () => {
  it("follows the application limits Riot reports unless RIOT_RATE_LIMITS pins them", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ id: "OC1", name: "Oceania", locales: [], maintenances: [], incidents: [] }), { status: 200, headers: { "content-type": "application/json", "x-app-rate-limit": "500:10,30000:600" } });
    const saved = process.env.RIOT_RATE_LIMITS;
    delete process.env.RIOT_RATE_LIMITS;
    try {
      const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, sleep: async () => {}, maxRetries: 0 });
      expect(client.limiters.configured).toEqual([{ requests: 20, seconds: 1 }, { requests: 100, seconds: 120 }]);
      await client.platformStatus("oc1");
      expect(client.limiters.configured).toEqual([{ requests: 500, seconds: 10 }, { requests: 30000, seconds: 600 }]);
      process.env.RIOT_RATE_LIMITS = "20:1,100:120";
      const pinned = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, sleep: async () => {}, maxRetries: 0 });
      await pinned.platformStatus("oc1");
      expect(pinned.limiters.configured).toEqual([{ requests: 20, seconds: 1 }, { requests: 100, seconds: 120 }]);
      // The stated limits are still recorded (they tell the key's tier), pinned or not.
      expect(client.reportedAppLimits).toBe("500:10,30000:600");
      expect(pinned.reportedAppLimits).toBe("500:10,30000:600");
    } finally {
      if (saved === undefined) delete process.env.RIOT_RATE_LIMITS;
      else process.env.RIOT_RATE_LIMITS = saved;
    }
  });

  it("with noWait, a request with no free slot in its share fails at once (429) and nothing is sent", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    };
    let slept = 0;
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 4, seconds: 1 }]), limitShare: 0.5, noWait: true, maxRetries: 0, sleep: async (ms) => void (slept += ms) });
    await client.leagueEntriesByPuuid("oc1", "a");
    await client.leagueEntriesByPuuid("oc1", "b");
    await expect(client.leagueEntriesByPuuid("oc1", "c")).rejects.toMatchObject({ status: 429 });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^https:\/\/oc1\.api\.riotgames\.com\/lol\/league\/v4\/entries\/by-puuid\/a$/);
    expect(slept).toBe(0);
  });
});

describe("Riot API client deadlines", () => {
  /** A fake clock shared by the client and its limiter; sleeping moves it on. */
  function clock() {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms) };
  }
  const ok = () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } });

  it("a request that would wait for a full window past the client's deadline fails at once, before it is sent", async () => {
    const c = clock();
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      calls.push(String(input));
      return ok();
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1, seconds: 120 }], c.now, c.sleep), now: c.now, sleep: c.sleep, deadline: 20_000 });
    await client.leagueEntriesByPuuid("oc1", "a");
    // The two-minute window is full: waiting for it would end about 100 s after the deadline.
    await expect(client.leagueEntriesByPuuid("oc1", "b")).rejects.toMatchObject({ name: "RiotDeadlineError", status: 429, retryable: true });
    expect(calls).toHaveLength(1);
    expect(c.now()).toBe(0);
  });

  it("a 429's Retry-After that ends past the deadline is not waited for; one that ends in time still is", async () => {
    const c = clock();
    const calls: string[] = [];
    // Riot's answers in turn: a 429 with this Retry-After (seconds), or null for the data.
    const answers: Array<number | null> = [90, 2, null];
    const fetchImpl = async (input: string | URL | Request) => {
      calls.push(String(input));
      const retryAfter = answers.shift();
      return retryAfter == null ? ok() : new Response("{}", { status: 429, headers: { "retry-after": String(retryAfter) } });
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline: 30_000 });
    await expect(client.leagueEntriesByPuuid("oc1", "a")).rejects.toMatchObject({ name: "RiotDeadlineError", status: 429 });
    expect(calls).toHaveLength(1);
    expect(c.now()).toBe(0);
    // A 2-second Retry-After ends in time (another limiter: the first one stays paused for 90 s).
    const later = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline: 30_000 });
    await expect(later.leagueEntriesByPuuid("oc1", "b")).resolves.toEqual([]);
    expect(calls).toHaveLength(3);
    expect(c.now()).toBeGreaterThanOrEqual(2_000);
  });

  it("a retry after a Riot error is not waited for past the deadline, and the error is Riot's", async () => {
    const c = clock();
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response("{}", { status: 503 });
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline: 1_500 });
    // The first retry waits 1 s (in time), the second would wait 2 s more (past it). What the
    // caller gets is the outage, not "out of time": a run that met only a failing Riot reports a
    // failure (the account waits as pending), never a clean stop for time.
    const failure = await client.leagueEntriesByPuuid("oc1", "a").catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(RiotApiError);
    expect(failure).toMatchObject({ name: "RiotApiError", status: 503, retryable: true });
    expect(failure).not.toBeInstanceOf(RiotDeadlineError);
    expect(calls).toHaveLength(2);
    expect(c.now()).toBe(1_000);
  });

  it("a network failure with no time left to retry is reported as a network failure", async () => {
    const c = clock();
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      calls.push(String(input));
      throw new Error("ECONNRESET");
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline: 500 });
    const failure = await client.leagueEntriesByPuuid("oc1", "a").catch((err: unknown) => err);
    expect(failure).toMatchObject({ name: "RiotApiError", status: 0, retryable: true });
    expect(String((failure as Error).message)).toContain("ECONNRESET");
    expect(calls).toHaveLength(1);
    expect(c.now()).toBe(0);
  });
});

describe("Riot API client after its deadline", () => {
  function clock() {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms) };
  }

  it("starts no request once the deadline has passed", async () => {
    const c = clock();
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response("[]", { status: 200 });
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline: 0 });
    await expect(client.leagueEntriesByPuuid("oc1", "a")).rejects.toMatchObject({ name: "RiotDeadlineError" });
    expect(calls).toHaveLength(0);
  });

  it("a request whose retries reach the deadline answers with Riot's failure, not with running out of time", async () => {
    const c = clock();
    const sent: number[] = [];
    const fetchImpl = async () => {
      sent.push(c.now());
      await c.sleep(15_000);
      throw new Error("This operation was aborted");
    };
    const client = new RiotApiClient({ apiKey: "RGAPI-test", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }], c.now, c.sleep), now: c.now, sleep: c.sleep, maxRetries: 4, deadline: 75_000 });
    const failure = await client.leagueEntriesByPuuid("oc1", "a").catch((err: unknown) => err);
    expect(failure).not.toBeInstanceOf(RiotDeadlineError);
    expect(failure).toMatchObject({ name: "RiotApiError", status: 0, retryable: true });
    expect(Math.max(...sent)).toBeLessThan(75_000);
    expect(c.now()).toBeLessThanOrEqual(75_000 + 15_000);
  });
});

describe("Riot API client addresses", () => {
  it("refuses a host that is not a Riot routing value, before any request carries the key", async () => {
    const calls: string[] = [];
    const client = clientWith(calls);
    for (const platform of ["x.example#", "oc1.evil.example", "oc1/../x", "oc1@evil", "oc1:8080", ""]) {
      await expect(client.platformStatus(platform)).rejects.toThrow();
    }
    expect(calls).toEqual([]);
    await client.platformStatus("oc1");
    expect(calls).toHaveLength(1);
  });
});

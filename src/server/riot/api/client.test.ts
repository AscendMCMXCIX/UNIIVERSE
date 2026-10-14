import { describe, expect, it } from "vitest";
import { RiotApiClient } from "./client";
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
    } finally {
      if (saved === undefined) delete process.env.RIOT_RATE_LIMITS;
      else process.env.RIOT_RATE_LIMITS = saved;
    }
  });
});

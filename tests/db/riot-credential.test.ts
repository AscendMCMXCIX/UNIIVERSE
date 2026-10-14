import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { accountsForSyncRun, addAccount, listAccountsForPlayer, listPendingAccounts } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { RiotApiClient, RiotApiError } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";
import { checkRiotCredential, classifyRiotFailure, getRiotCredentialStatus, recordRiotOutcome } from "@/server/riot/credential";
import { describeAccountSync } from "@/domain/account-status";
import { invalidateCache } from "@/server/observability/cache";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
});
afterAll(async () => {
  await handle.close();
});

type Behaviour = { status?: number; throwNetwork?: boolean; puuid?: string };
function riotFetch(b: Behaviour) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    if (b.throwNetwork) throw new Error("fetch failed: ECONNRESET");
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (b.status && b.status !== 200) return json({ status: { message: "error", status_code: b.status } }, b.status);
    if (url.includes("/lol/status/v4/platform-data")) return json({ id: "OC1", name: "Oceania" });
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) return json({ puuid: b.puuid ?? "puuid-cred", gameName: "Cred", tagLine: "OCE" });
    if (url.includes("/riot/account/v1/region/by-game/")) return json({ puuid: b.puuid ?? "puuid-cred", game: "lol", region: "OC1" });
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([]);
    if (url.includes("/ids?")) return json([]);
    return json({}, 404);
  };
}
const client = (b: Behaviour, key = "RGAPI-00000000-0000-0000-0000-00000000aaaa") => {
  const c = new RiotApiClient({ apiKey: key, fetchImpl: riotFetch(b), limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
  c.keyFingerprint = `…${key.slice(-4)}`;
  return c;
};
const ENV: Record<string, string | undefined> = { RIOT_API_KEY: "RGAPI-00000000-0000-0000-0000-00000000aaaa" };

describe("riot credential health", () => {
  it("reports not-configured without a key and unknown before any request", async () => {
    const none = await getRiotCredentialStatus(handle.db, {});
    expect(none.state).toBe("not-configured");
    expect(none.advice).toMatch(/RIOT_API_KEY/);
    const fresh = await getRiotCredentialStatus(handle.db, ENV);
    expect(fresh.state).toBe("unknown");
    expect(fresh.keyFingerprint).toBe("…aaaa");
  });

  it("classifies rejected keys, rate limits, outages and timeouts without exposing the key", () => {
    expect(classifyRiotFailure(new RiotApiError("Riot API 401 on /x", 401, false))).toMatchObject({ state: "rejected", statusCode: 401 });
    expect(classifyRiotFailure(new RiotApiError("Riot API 403 on /x", 403, false))).toMatchObject({ state: "rejected", statusCode: 403 });
    expect(classifyRiotFailure(new RiotApiError("Rate limited", 429, true))).toMatchObject({ state: "unavailable", statusCode: 429 });
    expect(classifyRiotFailure(new RiotApiError("Riot API 503", 503, true))).toMatchObject({ state: "unavailable", statusCode: 503 });
    expect(classifyRiotFailure(new RiotApiError("Network error calling /x: timeout", 0, true))).toMatchObject({ state: "unavailable", statusCode: null });
    expect(classifyRiotFailure(new RiotApiError("Riot API 404 on /x", 404, false)).state).toBe("accepted");
    expect(classifyRiotFailure(new Error("fetch failed")).state).toBe("unavailable");
    for (const c of [classifyRiotFailure(new RiotApiError("Riot API 403 on /lol/x?api_key=RGAPI-secret", 403, false))]) expect(c.message).not.toMatch(/RGAPI/);
  });

  it("a rejected key (401/403) marks the credential rejected, keeps the account pending with a plain message", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Cred Player", primaryRole: "MID", primaryPool: ["Ahri"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Cred#OCE", platform: "oc1" });
    for (const status of [403, 401]) {
      const r = await syncAccount(db, client({ status }), account);
      expect(r.status).toBe("pending");
      expect(r.error).toMatch(/temporarily unavailable/);
      expect(r.error).not.toMatch(/key|40[13]/i);
      invalidateCache("riot-credential");
      const cred = await getRiotCredentialStatus(db, ENV);
      expect(cred.state).toBe("rejected");
      expect(cred.lastStatusCode).toBe(status);
      expect(cred.advice).toMatch(/Vercel/);
      expect(JSON.stringify(cred)).not.toContain("00000000aaaa");
    }
    const stored = (await listAccountsForPlayer(db, player.id))[0]!;
    expect(stored.syncStatus).toBe("pending");
    expect(describeAccountSync({ syncStatus: stored.syncStatus, syncError: stored.syncError, lastSyncAt: stored.lastSyncAt, puuid: stored.puuid, riotConfigured: true }).label).toBe("Updating");
    // The owner's retry list includes it.
    expect((await listPendingAccounts(db)).some((a) => a.id === account.id)).toBe(true);
  });

  it("rate limits, outages and network failures are 'unavailable' (key accepted), accounts stay pending", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Flaky Player", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Flaky#OCE", platform: "oc1" });
    for (const b of [{ status: 429 }, { status: 503 }, { throwNetwork: true }] as Behaviour[]) {
      const r = await syncAccount(db, client(b), account);
      expect(r.status).toBe("pending");
      invalidateCache("riot-credential");
      const cred = await getRiotCredentialStatus(db, ENV);
      expect(cred.state).toBe("unavailable");
    }
  });

  it("a successful request marks the credential accepted and a retry syncs the pending account", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Recovered", primaryRole: "ADC", primaryPool: ["Jinx"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Recovered#OCE", platform: "oc1" });
    await syncAccount(db, client({ status: 403 }), account);
    const check = await checkRiotCredential(db, client({}), "oc1");
    expect(check.ok).toBe(true);
    expect(check.state).toBe("accepted");
    invalidateCache("riot-credential");
    expect((await getRiotCredentialStatus(db, ENV)).state).toBe("accepted");
    // Retry: the pending account resolves without creating a duplicate.
    const pending = (await listPendingAccounts(db)).find((a) => a.id === account.id)!;
    const r = await syncAccount(db, client({}), pending);
    expect(r.status).toBe("ok");
    expect(r.resolved).toBe(true);
    const accounts = await listAccountsForPlayer(db, player.id);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.puuid).toBe("puuid-cred");
    expect((await listPendingAccounts(db)).some((a) => a.id === account.id)).toBe(false);
  });

  it("the sync job retries pending accounts after a few minutes without waiting for the refresh interval", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Waiting", primaryRole: "MID", primaryPool: ["Orianna"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Waiting#OCE", platform: "oc1" });
    // Riot refused the lookup a moment ago: pending, last attempt just now.
    await syncAccount(db, client({ status: 403 }), account);
    const soon = await accountsForSyncRun(db, { limit: 12, olderThanMinutes: 120, pendingOlderThanMinutes: 5 });
    expect(soon.some((a) => a.id === account.id)).toBe(false);
    // Six minutes later the regular refresh is not due, but the pending account is retried first.
    const later = await accountsForSyncRun(db, { limit: 12, olderThanMinutes: 120, pendingOlderThanMinutes: 0 });
    expect(later.some((a) => a.id === account.id)).toBe(true);
    expect(new Set(later.map((a) => a.id)).size).toBe(later.length);
    // Once synced it is no longer part of the retry group.
    const synced = await syncAccount(db, client({ puuid: "puuid-waiting" }), later.find((a) => a.id === account.id)!);
    expect(synced.status).toBe("ok");
    const after = await accountsForSyncRun(db, { limit: 12, olderThanMinutes: 120, pendingOlderThanMinutes: 0 });
    expect(after.some((a) => a.id === account.id)).toBe(false);
  });

  it("a key change invalidates the recorded status for the previous key", async () => {
    const db = handle.db;
    await recordRiotOutcome(db, { keyFingerprint: "…bbbb" }, { ok: true });
    invalidateCache("riot-credential");
    const other = await getRiotCredentialStatus(db, { RIOT_API_KEY: "RGAPI-00000000-0000-0000-0000-00000000cccc" });
    expect(other.state).toBe("unknown");
    expect(other.lastOkAt).toBeNull();
  });
});

describe("account linking", () => {
  it("needs only a Riot ID: no account type, no per-account role, several accounts per player", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, { displayName: "Multi", primaryRole: "SUPPORT", secondaryRole: "ADC", primaryPool: ["Lulu"] });
    const a = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "multi#ONE", platform: "oc1" });
    const b = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "multi#TWO", platform: "oc1" });
    const c = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "multi#THREE", platform: "oc1" });
    // The first account is the Main, later ones Alts; no per-account role.
    expect([a, b, c].map((x) => x.label)).toEqual(["main", "alt", "alt"]);
    expect([a, b, c].every((x) => x.role === null)).toBe(true);
    const linked = await listAccountsForPlayer(db, player.id);
    expect(linked.map((x) => x.riotId).sort()).toEqual(["multi#ONE", "multi#THREE", "multi#TWO"]);
    // The player's own roles are untouched by linking.
    const { getPlayer } = await import("@/server/repositories/team");
    const fresh = await getPlayer(db, player.id);
    expect(fresh?.primaryRole).toBe("SUPPORT");
    expect(fresh?.secondaryRole).toBe("ADC");
  });
});

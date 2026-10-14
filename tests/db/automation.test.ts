import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { matchFetchQueue, riotAccounts, sessions, users } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { accountsForSyncRun, addAccount } from "@/server/accounts/repository";
import { claimLease, claimTickLease, lastTickStartedAt, renewTickLease } from "@/server/jobs/background";
import { ingestQueuedMatches } from "@/server/ingestion/ranked";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";

/*
  Unattended refresh (Phase 4 stage B): the tick lease that lets visits start a refresh without
  piling up, the account-sync priority order with retry back-off, and fair ingestion across the
  servers and ladder bands that share one Riot host.
*/

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
}, 60_000);
afterAll(async () => {
  await handle.close();
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

describe("background refresh lease", () => {
  it("lets exactly one of many simultaneous visitors start a tick, then none until the interval passes", async () => {
    const db = handle.db;
    const now = new Date();
    const claims = await Promise.all(Array.from({ length: 6 }, () => claimLease(db, "test_lease", 30 * 60_000, now)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await claimLease(db, "test_lease", 30 * 60_000, new Date(now.getTime() + 10 * 60_000))).toBe(false);
    expect(await claimLease(db, "test_lease", 30 * 60_000, new Date(now.getTime() + 31 * 60_000))).toBe(true);
  });

  it("a tick from any trigger renews the lease, so a visit right after a scheduled run starts nothing", async () => {
    const db = handle.db;
    await renewTickLease(db);
    expect((await lastTickStartedAt(db))!.getTime()).toBeGreaterThan(Date.now() - 5_000);
    expect(await claimTickLease(db, 30 * 60_000)).toBe(false);
  });
});

describe("account sync order", () => {
  it("retries new and failing links first (with back-off), then unfinished history, then active players, then the rest", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const mk = async (name: string, group: "main" | "other") => {
      const p = await createPlayer(db, team.id, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"], group });
      const a = await addAccount(db, { ownerType: "player", playerId: p.id, riotId: `${name}#OCE`, platform: "oc1" });
      return { player: p, account: a };
    };
    const complete = { season: 16, queues: {}, startedAt: "", completedAt: new Date().toISOString() };
    const failing = await mk("Failing", "other");
    const backedOff = await mk("BackedOff", "other");
    const history = await mk("History", "other");
    const active = await mk("Active", "main");
    const signedIn = await mk("SignedIn", "other");
    const quiet = await mk("Quiet", "other");
    const stale = await mk("Stale", "other");
    const set = (id: string, v: Partial<typeof riotAccounts.$inferInsert>) => db.update(riotAccounts).set(v).where(eq(riotAccounts.id, id));
    // One failure 10 minutes ago: due (5 min back-off). Three failures 10 minutes ago: waits 20.
    await set(failing.account.id, { syncStatus: "pending", resolveAttempts: 1, lastSyncAt: minutesAgo(10) });
    await set(backedOff.account.id, { syncStatus: "pending", resolveAttempts: 3, lastSyncAt: minutesAgo(10) });
    await set(history.account.id, { syncStatus: "ok", puuid: "p-history", lastSyncAt: minutesAgo(5), historyBackfill: { ...complete, completedAt: null } });
    await set(active.account.id, { syncStatus: "ok", puuid: "p-active", lastSyncAt: minutesAgo(50), historyBackfill: complete });
    await set(signedIn.account.id, { syncStatus: "ok", puuid: "p-signed", lastSyncAt: minutesAgo(50), historyBackfill: complete });
    await set(quiet.account.id, { syncStatus: "ok", puuid: "p-quiet", lastSyncAt: minutesAgo(50), historyBackfill: complete });
    await set(stale.account.id, { syncStatus: "ok", puuid: "p-stale", lastSyncAt: minutesAgo(240), historyBackfill: complete });
    // A teammate in the "other" group who signed in yesterday counts as active.
    const [u] = await db.insert(users).values({ username: "signedin", displayName: "Signed In", role: "player", playerId: signedIn.player.id }).returning();
    await db.insert(sessions).values({ userId: u!.id, tokenHash: "h-signedin", lastSeenAt: minutesAgo(60 * 24), expiresAt: new Date(Date.now() + 86_400_000) });

    const due = (await accountsForSyncRun(db, { limit: 20, olderThanMinutes: 180, activeOlderThanMinutes: 45, pendingOlderThanMinutes: 5 })).map((a) => a.id);
    const ours = due.filter((id) => [failing, backedOff, history, active, signedIn, quiet, stale].some((x) => x.account.id === id));
    expect(ours).toEqual([failing.account.id, history.account.id, active.account.id, signedIn.account.id, stale.account.id]);
    // The backed-off account is due once its wait (5 × 2² = 20 minutes) has passed.
    await set(backedOff.account.id, { lastSyncAt: minutesAgo(21) });
    expect((await accountsForSyncRun(db, { limit: 20, olderThanMinutes: 180, activeOlderThanMinutes: 45, pendingOlderThanMinutes: 5 })).map((a) => a.id)).toContain(backedOff.account.id);
    // Never more retries per run than allowed, so failing links cannot starve the others.
    const capped = await accountsForSyncRun(db, { limit: 20, olderThanMinutes: 180, activeOlderThanMinutes: 45, pendingOlderThanMinutes: 5, pendingLimit: 1 });
    expect(capped.filter((a) => a.syncStatus === "pending")).toHaveLength(1);
    expect(capped.map((a) => a.id)).toContain(history.account.id);
  });
});

describe("fair ingestion", () => {
  it("round-robins the servers and ladder bands that share a Riot host instead of draining the oldest first", async () => {
    const db = handle.db;
    const old = new Date(Date.now() - 3_600_000);
    // Twelve OCE Challenger matches discovered first, then two Singapore and two OCE Emerald ones.
    await db.insert(matchFetchQueue).values([
      ...Array.from({ length: 12 }, (_, i) => ({ matchId: `OC1_C${i}`, platform: "oc1", tierBand: "CHALLENGER", discoveredAt: new Date(old.getTime() + i) })),
      { matchId: "SG2_D0", platform: "sg2", tierBand: "DIAMOND", discoveredAt: new Date() },
      { matchId: "SG2_D1", platform: "sg2", tierBand: "DIAMOND", discoveredAt: new Date() },
      { matchId: "OC1_E0", platform: "oc1", tierBand: "EMERALD", discoveredAt: new Date() },
      { matchId: "OC1_E1", platform: "oc1", tierBand: "EMERALD", discoveredAt: new Date() },
    ]);
    const calls: string[] = [];
    // Every fetch answers 404 (the order of requests is what this test reads).
    const fetchImpl = async (input: string | URL | Request) => {
      calls.push(String(input).split("/").pop()!);
      return new Response(JSON.stringify({ status: { message: "not found" } }), { status: 404, headers: { "content-type": "application/json" } });
    };
    const client = new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
    await ingestQueuedMatches({ db, client, log: () => {}, outOfTime: () => false }, { batchSize: 6, maxAttempts: 3, platforms: ["oc1", "sg2"] });
    // The first three requests cover every server/band; before, all six went to OCE Challenger.
    expect(new Set(calls.slice(0, 3).map((id) => id.replace(/\d+$/, "")))).toEqual(new Set(["OC1_C", "SG2_D", "OC1_E"]));
    await db.delete(matchFetchQueue).where(sql`${matchFetchQueue.matchId} LIKE 'OC1_%' OR ${matchFetchQueue.matchId} LIKE 'SG2_%'`);
  });
});

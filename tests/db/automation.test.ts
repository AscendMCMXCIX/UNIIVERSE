import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { players, riotAccounts, sessions, users } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { accountsForSyncRun, addAccount } from "@/server/accounts/repository";
import { claimLease, claimTickLease, lastTickStartedAt, renewTickLease } from "@/server/jobs/background";

/*
  Unattended refresh (Phase 4 stage B): the tick lease that lets visits start a refresh without
  piling up, and the account-sync priority order with retry back-off.
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
    const mk = async (name: string, kind: "team" | "personal") => {
      const p = await createPlayer(db, team.id, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"] });
      if (kind === "personal") await db.update(players).set({ teamMember: false }).where(eq(players.id, p.id));
      const a = await addAccount(db, { ownerType: "player", playerId: p.id, riotId: `${name}#OCE`, platform: "oc1" });
      return { player: p, account: a };
    };
    const complete = { season: 16, queues: {}, startedAt: "", completedAt: new Date().toISOString() };
    const failing = await mk("Failing", "personal");
    const backedOff = await mk("BackedOff", "personal");
    const history = await mk("History", "personal");
    const active = await mk("Active", "team");
    const signedIn = await mk("SignedIn", "personal");
    const quiet = await mk("Quiet", "personal");
    const stale = await mk("Stale", "personal");
    const set = (id: string, v: Partial<typeof riotAccounts.$inferInsert>) => db.update(riotAccounts).set(v).where(eq(riotAccounts.id, id));
    // One failure 10 minutes ago: due (5 min back-off). Three failures 10 minutes ago: waits 20.
    await set(failing.account.id, { syncStatus: "pending", resolveAttempts: 1, lastSyncAt: minutesAgo(10) });
    await set(backedOff.account.id, { syncStatus: "pending", resolveAttempts: 3, lastSyncAt: minutesAgo(10) });
    await set(history.account.id, { syncStatus: "ok", puuid: "p-history", lastSyncAt: minutesAgo(5), historyBackfill: { ...complete, completedAt: null } });
    await set(active.account.id, { syncStatus: "ok", puuid: "p-active", lastSyncAt: minutesAgo(50), historyBackfill: complete });
    await set(signedIn.account.id, { syncStatus: "ok", puuid: "p-signed", lastSyncAt: minutesAgo(50), historyBackfill: complete });
    await set(quiet.account.id, { syncStatus: "ok", puuid: "p-quiet", lastSyncAt: minutesAgo(50), historyBackfill: complete });
    await set(stale.account.id, { syncStatus: "ok", puuid: "p-stale", lastSyncAt: minutesAgo(240), historyBackfill: complete });
    // A personal-use player who signed in yesterday counts as active.
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

  it("keeps room for regular refreshes when 22 or more never-synced accounts wait, in a run no larger than before", async () => {
    const db = handle.db;
    const team = await getOrCreateTeam(db);
    const p = await createPlayer(db, team.id, { displayName: "ManyLinks", primaryRole: "TOP", primaryPool: ["Garen"] });
    const complete = { season: 16, queues: {}, startedAt: "", completedAt: new Date().toISOString() };
    // 25 links never synced (retries, the first group) and 3 of a team member's accounts last refreshed 4 hours ago.
    const fresh = await db.insert(riotAccounts).values(Array.from({ length: 25 }, (_, i) => ({ ownerType: "player" as const, playerId: p.id, gameName: `NeverSynced${i}`, tagLine: "OCE", platform: "oc1", label: "alt" }))).returning({ id: riotAccounts.id });
    const regular = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ ownerType: "player" as const, playerId: p.id, gameName: `Regular${from + i}`, tagLine: "OCE", platform: "oc1", label: "alt", puuid: `p-regular-${from + i}`, syncStatus: "ok", lastSyncAt: minutesAgo(240), historyBackfill: complete }));
    const due = await db.insert(riotAccounts).values(regular(0, 3)).returning({ id: riotAccounts.id });
    const options = { limit: 12, olderThanMinutes: 180, activeOlderThanMinutes: 45, pendingLimit: 10, pendingOlderThanMinutes: 5 };
    const freshIds = new Set(fresh.map((a) => a.id));
    const run = await accountsForSyncRun(db, options);
    // At most pendingLimit retries (these 25 come first: never tried), and the regular refreshes due beside them.
    expect(run.filter((a) => freshIds.has(a.id))).toHaveLength(10);
    expect(run.filter((a) => a.syncStatus === "never" || a.syncStatus === "pending")).toHaveLength(10);
    expect(run.map((a) => a.id)).toEqual(expect.arrayContaining(due.map((a) => a.id)));
    // More regular accounts due than a run takes: the run is its usual size, pendingLimit + limit, and no larger.
    const more = await db.insert(riotAccounts).values(regular(3, 15)).returning({ id: riotAccounts.id });
    const full = await accountsForSyncRun(db, options);
    expect(full).toHaveLength(22);
    expect(full.filter((a) => a.syncStatus === "never" || a.syncStatus === "pending")).toHaveLength(10);
    expect(full.filter((a) => a.syncStatus === "ok")).toHaveLength(12);
    await db.delete(riotAccounts).where(inArray(riotAccounts.id, [...fresh, ...due, ...more].map((a) => a.id)));
  });
});

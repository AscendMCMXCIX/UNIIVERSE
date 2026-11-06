import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { dataRefreshStatus, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";

/*
  /api/health's "accounts" time is when a linked account was last read from Riot in full, from the
  accounts themselves. It used to be the account-sync job's last success, which the job records
  when it had nothing to do, no key, or every account failed: for days the health check said
  accounts were syncing while nothing was read.
*/

const state = vi.hoisted(() => ({ handle: null as unknown }));
vi.mock("@/server/db/client", () => ({ getDbHandle: async () => state.handle }));
import { GET } from "@/app/api/health/route";

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
  state.handle = handle;
}, 60_000);
afterAll(async () => {
  await handle.close();
});

describe("/api/health", () => {
  it("dates the accounts by their newest successful read, not by the job's last run", async () => {
    const db = handle.db;
    const read = Date.UTC(2026, 10, 2, 8);
    const playerId = (await createPlayer(db, (await getOrCreateTeam(db)).id, { displayName: "Health", primaryRole: "MID", primaryPool: [] })).id;
    await db.insert(riotAccounts).values([
      { ownerType: "player", playerId, gameName: "Health", tagLine: "OCE", platform: "oc1", puuid: "p-health", label: "main", syncStatus: "ok", syncCursor: Math.floor(read / 1000), lastSyncAt: new Date(read) },
      // A later attempt that failed moves last_sync_at, not sync_cursor.
      { ownerType: "player", playerId, gameName: "HealthAlt", tagLine: "OCE", platform: "oc1", puuid: "p-health-alt", label: "alt", syncStatus: "pending", syncError: "Riot is rate-limiting requests right now.", syncCursor: null, lastSyncAt: new Date() },
      // A demo account says nothing about Riot.
      { ownerType: "player", playerId, gameName: "Demo", tagLine: "DEMO", platform: "euw1", puuid: "demo-health", label: "demo", syncStatus: "demo", syncCursor: Math.floor(Date.now() / 1000), lastSyncAt: new Date() },
    ]);
    // The job itself "succeeded" just now, with nothing read.
    await db.insert(dataRefreshStatus).values({ key: "account-sync", status: "degraded", lastSuccessAt: new Date(), lastError: "RIOT_API_KEY is not configured", updatedAt: new Date() }).onConflictDoUpdate({ target: dataRefreshStatus.key, set: { status: "degraded", lastSuccessAt: new Date() } });
    const body = (await (await GET()).json()) as { ok: boolean; data: { accounts: string | null } };
    expect(body.ok).toBe(true);
    expect(body.data.accounts).toBe(new Date(read).toISOString());
    // No account ever read in full: nothing is claimed.
    await db.update(riotAccounts).set({ syncCursor: null }).where(eq(riotAccounts.puuid, "p-health"));
    expect(((await (await GET()).json()) as { data: { accounts: string | null } }).data.accounts).toBeNull();
  });

  it("never shows a visitor the database driver's message: it can name the host, region and user", async () => {
    const driverMessage = 'password authentication failed for user "postgres.abcdefghijklmnopqrst" (aws-0-ap-southeast-2.pooler.supabase.com:6543)';
    const failing = { mode: "postgres", db: { execute: async () => { throw new Error(driverMessage); } }, close: async () => {} };
    const silent = process.env.UNIIVERSE_LOG_SILENT;
    process.env.UNIIVERSE_LOG_SILENT = "true";
    state.handle = failing;
    try {
      const res = await GET();
      const text = await res.text();
      expect(res.status).toBe(503);
      const body = JSON.parse(text) as { ok: boolean; db: { ok: boolean; error: string } };
      expect(body.ok).toBe(false);
      expect(body.db.ok).toBe(false);
      expect(body.db.error).toMatch(/did not answer/);
      for (const leak of ["abcdefghijklmnopqrst", "pooler", "supabase", "ap-southeast", "authentication", "postgres."]) expect(text).not.toContain(leak);
    } finally {
      state.handle = handle;
      if (silent === undefined) delete process.env.UNIIVERSE_LOG_SILENT;
      else process.env.UNIIVERSE_LOG_SILENT = silent;
    }
  });
});

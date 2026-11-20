import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import * as schema from "@/server/db/schema";
import { appSettings, auditEvents, dataRefreshStatus, riotAccounts, staticDigests } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { setScheduleOverrides } from "@/server/jobs/scheduler";
import { markRankScheduleCall, RANK_SCHEDULE_CALL_KEY } from "@/server/ops/rank-schedule-calls";
import { formatDate, isoDay } from "@/lib/format";

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

/*
  Its notices (19 Nov 2026): what is off by choice, not failing. On 18 Nov 2026 at 09:04 UTC the
  five-minute rank schedule was removed from Admin's Run now list, and nothing said so until it was
  found the next morning (recon §1.5): the silence rule only covers an installed schedule. The
  public answer names the day only, never who: Admin → Audit Logs does.
*/
describe("/api/health notices", () => {
  const KEYS = ["rank-schedule", "rank-schedule-off"];
  const setStatus = async (rows: Array<[string, number]>) => {
    await handle.db.delete(dataRefreshStatus).where(inArray(dataRefreshStatus.key, KEYS));
    for (const [key, at] of rows) await handle.db.insert(dataRefreshStatus).values({ key, status: "ok", lastStartedAt: new Date(at), lastSuccessAt: new Date(at), updatedAt: new Date(at), consecutiveFailures: 0 });
  };
  const clear = async () => {
    await handle.db.delete(dataRefreshStatus).where(inArray(dataRefreshStatus.key, KEYS));
    await handle.db.delete(appSettings).where(inArray(appSettings.key, ["schedule", RANK_SCHEDULE_CALL_KEY]));
  };
  type Body = { ok: boolean; failingJobs: string[]; notices: Array<{ kind: string; since?: string; jobs?: string[]; message: string }> };

  it("names the schedule turned off after it was on (the day only) and the scheduled jobs set to 0, without failing on either", async () => {
    const on = Date.now() - 26 * 3_600_000;
    const off = on + 1_000;
    await setStatus([["rank-schedule", on], ["rank-schedule-off", off]]);
    await setScheduleOverrides(handle.db, { intervals: { "version-check": 0, "perf-probe": 0, integrity: 720 } });
    // Who ran it is in the activity log, which the public answer never reads.
    const [entry] = await handle.db.insert(auditEvents).values({ actorUserId: null, actorName: "SomeAdministrator", action: "jobs.run", targetType: "job", targetName: "rank-schedule-off", details: { ok: true, kind: "setup" } }).returning({ id: auditEvents.id });
    try {
      const res = await GET();
      const text = await res.text();
      const body = JSON.parse(text) as Body;
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.notices).toEqual([
        { kind: "schedule-off", job: "rank-schedule", since: isoDay(off), message: `LP five-minute schedule off since ${formatDate(off)}` },
        { kind: "disabled", jobs: ["version-check"], message: "Off by choice (interval 0 in Admin): version-check" },
      ]);
      // Neither fails the scheduled Data jobs run (failingJobs), and neither names anyone or points at the log.
      expect(body.failingJobs).not.toContain("rank-schedule");
      expect(body.failingJobs).not.toContain("version-check");
      expect(text).not.toContain("SomeAdministrator");
      expect(text).not.toMatch(/audit|actor|https?:/i);
      expect(JSON.stringify(body.notices)).not.toMatch(/T\d{2}:\d{2}/);
    } finally {
      await handle.db.delete(auditEvents).where(eq(auditEvents.id, entry!.id));
      await clear();
    }
  });

  it("says nothing when the schedule is on again or was never installed; an installed schedule silent for 20 minutes still fails, as before", async () => {
    const now = Date.now();
    try {
      await setStatus([["rank-schedule-off", now - 5 * 3_600_000], ["rank-schedule", now - 4 * 3_600_000]]);
      await markRankScheduleCall(handle.db, new Date(now - 60_000));
      expect(((await (await GET()).json()) as Body).notices).toEqual([]);
      await setStatus([["rank-schedule-off", now - 60_000]]);
      expect(((await (await GET()).json()) as Body).notices).toEqual([]);
      // Installed, then no call for 25 minutes: failing (the existing rule), and no notice.
      await setStatus([["rank-schedule", now - 2 * 3_600_000]]);
      await markRankScheduleCall(handle.db, new Date(now - 25 * 60_000));
      const silent = (await (await GET()).json()) as Body;
      expect(silent.failingJobs).toContain("rank-schedule");
      expect(silent.notices).toEqual([]);
    } finally {
      await clear();
    }
  });

  it("reads one schedule row more and makes no pg_cron, pg_net or Vault query (every query it issues)", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const logger = { logQuery: (query: string, params: unknown[]) => void queries.push({ sql: query, params }) };
    const client = (handle.db as unknown as { $client: unknown }).$client;
    const logged = (handle.mode === "postgres" ? (await import("drizzle-orm/postgres-js")).drizzle(client as never, { schema, logger }) : (await import("drizzle-orm/pglite")).drizzle(client as never, { schema, logger })) as unknown as Db;
    state.handle = { ...handle, db: logged };
    try {
      await setScheduleOverrides(handle.db, { intervals: { "rank-watch": 0 } });
      const body = (await (await GET()).json()) as Body;
      expect(body.notices.map((n) => n.kind)).toEqual(["disabled"]);
      expect(queries.length).toBeGreaterThan(3);
      expect(queries.filter((q) => /\bcron\.|vault\.|pg_cron|pg_net|net\._http|pg_extension|decrypted_secret/i.test(q.sql)).map((q) => q.sql)).toEqual([]);
      // The schedule overrides: one row of app_settings, key "schedule".
      expect(queries.filter((q) => /"app_settings"/.test(q.sql) && q.params.includes("schedule"))).toHaveLength(1);
    } finally {
      state.handle = handle;
      await clear();
    }
  });

  it("lists Matchup Intel's per-version diff as counts and patches only (static_digests)", async () => {
    const db = handle.db;
    type Digests = { digests: { patch: string; recorded: Record<string, number>; previous: string | null; changed: Record<string, number> | null } | null };
    expect(((await (await GET()).json()) as Digests).digests).toBeNull();
    try {
      await db.insert(staticDigests).values([
        { patch: "16.21", kind: "champion", key: "Darius", hash: "a" },
        { patch: "16.21", kind: "champion", key: "Garen", hash: "a" },
        { patch: "16.21", kind: "item", key: "3071", hash: "a" },
        { patch: "16.22", kind: "champion", key: "Darius", hash: "b" },
        { patch: "16.22", kind: "champion", key: "Garen", hash: "a" },
        { patch: "16.22", kind: "item", key: "3071", hash: "a" },
        { patch: "16.22", kind: "rune", key: "8010", hash: "a" },
        // A failed attempt's mark is not a digest, and a newer patch with only that mark is not listed.
        { patch: "16.23", kind: "patch", key: "failed", hash: "" },
      ]);
      const body = (await (await GET()).json()) as Digests;
      expect(body.digests).toEqual({ patch: "16.22", recorded: { champion: 2, item: 1, rune: 1 }, previous: "16.21", changed: { champion: 1, item: 0, rune: 1 } });
      // Nothing but counts and patch names: no champion, item or rune is named.
      expect(JSON.stringify(body.digests)).not.toMatch(/Darius|Garen|3071|8010/);
      await db.delete(staticDigests).where(inArray(staticDigests.patch, ["16.21"]));
      expect(((await (await GET()).json()) as Digests).digests).toEqual({ patch: "16.22", recorded: { champion: 2, item: 1, rune: 1 }, previous: null, changed: null });
    } finally {
      await db.delete(staticDigests);
    }
  });
});

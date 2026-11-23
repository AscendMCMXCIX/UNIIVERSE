import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { Db } from "@/server/db/types";
import * as schema from "@/server/db/schema";
import { appSettings, auditEvents, dataRefreshStatus, patches, riotAccounts, staticDigests } from "@/server/db/schema";
import { loadRiotAssets, loadRiotBuildData, StaticValidationError, STATIC_ATTEMPT_KEY, syncRiotAssets } from "@/server/riot/static/assets";
import { invalidateAllCaches } from "@/server/observability/cache";
import { patchSortKey } from "@/domain/patch";
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
import { staticDiffHealth } from "@/server/riot/static/digests";

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
        // New in 16.22: recorded, not "changed".
        { patch: "16.22", kind: "rune", key: "8010", hash: "a" },
        // A failed attempt's mark is not a digest, and a newer patch with only that mark is not listed.
        { patch: "16.23", kind: "patch", key: "failed", hash: "" },
      ]);
      const body = (await (await GET()).json()) as Digests;
      expect(body.digests).toEqual({ patch: "16.22", recorded: { champion: 2, item: 1, rune: 1 }, previous: "16.21", changed: { champion: 1, item: 0, rune: 0 } });
      // Nothing but counts and patch names: no champion, item or rune is named.
      expect(JSON.stringify(body.digests)).not.toMatch(/Darius|Garen|3071|8010/);
      await db.delete(staticDigests).where(inArray(staticDigests.patch, ["16.21"]));
      expect(((await (await GET()).json()) as Digests).digests).toEqual({ patch: "16.22", recorded: { champion: 2, item: 1, rune: 1 }, previous: null, changed: null });
    } finally {
      await db.delete(staticDigests);
    }
  });

  it("gives Admin's data health the same figures, with the newest failed attempt that has no digests (counts and patch names only)", async () => {
    const db = handle.db;
    try {
      // No digests yet.
      expect(await staticDiffHealth(db)).toEqual({ digests: null, failedPatch: null });
      // A failed attempt and nothing recorded.
      await db.insert(staticDigests).values({ patch: "16.21", kind: "patch", key: "failed", hash: "" });
      expect(await staticDiffHealth(db)).toEqual({ digests: null, failedPatch: "16.21" });
      // One patch only: its earlier failure (since recorded) is no longer a failed attempt.
      await db.insert(staticDigests).values([
        { patch: "16.21", kind: "champion", key: "Darius", hash: "a" },
        { patch: "16.21", kind: "item", key: "3071", hash: "a" },
        { patch: "16.21", kind: "rune", key: "8010", hash: "a" },
      ]);
      expect(await staticDiffHealth(db)).toEqual({ digests: { patch: "16.21", recorded: { champion: 1, item: 1, rune: 1 }, previous: null, changed: null }, failedPatch: null });
      // Two patches.
      await db.insert(staticDigests).values([
        { patch: "16.22", kind: "champion", key: "Darius", hash: "b" },
        { patch: "16.22", kind: "item", key: "3071", hash: "a" },
        { patch: "16.22", kind: "rune", key: "8010", hash: "a" },
      ]);
      expect(await staticDiffHealth(db)).toEqual({ digests: { patch: "16.22", recorded: { champion: 1, item: 1, rune: 1 }, previous: "16.21", changed: { champion: 1, item: 0, rune: 0 } }, failedPatch: null });
      // A newer patch's failed attempt: marked, the figures kept.
      await db.insert(staticDigests).values({ patch: "16.23", kind: "patch", key: "failed", hash: "" });
      const diff = await staticDiffHealth(db);
      expect(diff.failedPatch).toBe("16.23");
      expect(diff.digests?.patch).toBe("16.22");
      expect(JSON.stringify(diff)).not.toMatch(/Darius|3071|8010/);
    } finally {
      await db.delete(staticDigests);
    }
  });

  it("keeps the last good static copy when a version's files fail validation, says so as counts and patch names, and clears once a good copy is kept", async () => {
    const db = handle.db;
    const files = (bad: boolean) => ({
      "item.json": { data: { "3067": { name: "Kindlegem", description: `<mainText><stats><attention>${bad ? "ten" : "10"}</attention> Ability Haste</stats></mainText>`, from: bad ? ["9999"] : [], into: [], maps: { "11": true } } } },
      "summoner.json": { data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash", cooldown: [300] } } },
      "runesReforged.json": bad ? [] : [{ id: 8100, name: "Domination", icon: "d.png", slots: [{ runes: [{ id: 8112, name: "Electrocute", icon: "e.png" }] }] }],
    });
    const fetchOf = (bad: boolean) => (async (url: string) => new Response(JSON.stringify(files(bad)[url.split("/").pop() as "item.json"]), { status: 200 })) as unknown as typeof fetch;
    type Body = { failingJobs: string[]; staticData: { state: string; patch: string | null; stored: string | null; reason: string | null; problems: unknown } };
    const current = async (version: string) => {
      await db.update(patches).set({ isCurrent: false });
      const id = version.split(".").slice(0, 2).join(".");
      await db.insert(patches).values({ id, ddragonVersion: version, isCurrent: true, sortKey: patchSortKey(id) }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: true } });
    };
    try {
      await current("16.22.1");
      expect(await syncRiotAssets(db, "16.22.1", fetchOf(false))).toBe(true);
      expect(((await (await GET()).json()) as Body).staticData).toEqual({ state: "ok", patch: "26.22", stored: "26.22", reason: null, problems: null });
      // 16.23.1's files fail: the 16.22.1 copy stays, the attempt is recorded, health lists it.
      await current("16.23.1");
      await expect(syncRiotAssets(db, "16.23.1", fetchOf(true))).rejects.toBeInstanceOf(StaticValidationError);
      invalidateAllCaches();
      expect((await loadRiotAssets(db))?.version).toBe("16.22.1");
      expect((await loadRiotBuildData(db))?.version).toBe("16.22.1");
      const text = await (await GET()).text();
      const failed = JSON.parse(text) as Body;
      expect(failed.failingJobs).toContain("static-data");
      expect(failed.staticData).toEqual({ state: "failed", patch: "26.23", stored: "26.22", reason: "validation", problems: { empty: ["rune"], missingIds: 1, unparsedHaste: 1 } });
      expect(text).not.toMatch(/Kindlegem|Flash|9999/);
      // A download that fails after it never hides the validation's failure (R11b review 4).
      await expect(syncRiotAssets(db, "16.23.1", (async () => new Response("", { status: 503 })) as unknown as typeof fetch)).rejects.toThrow(/HTTP 503/);
      expect(((await (await GET()).json()) as Body).staticData).toMatchObject({ state: "failed", reason: "validation", problems: { empty: ["rune"], missingIds: 1, unparsedHaste: 1 } });
      // A good copy of 16.23.1: kept, the attempt cleared, health ok again.
      expect(await syncRiotAssets(db, "16.23.1", fetchOf(false))).toBe(true);
      const ok = (await (await GET()).json()) as Body;
      expect(ok.failingJobs).not.toContain("static-data");
      expect(ok.staticData.state).toBe("ok");
      expect(await db.select().from(appSettings).where(eq(appSettings.key, STATIC_ATTEMPT_KEY))).toEqual([]);
      // A download that fails is recorded too, and listed only after a day.
      await current("16.24.1");
      await expect(syncRiotAssets(db, "16.24.1", (async () => new Response("", { status: 503 })) as unknown as typeof fetch)).rejects.toThrow(/HTTP 503/);
      expect(((await (await GET()).json()) as Body).staticData.state).toBe("ok");
      await db.update(appSettings).set({ value: sql`jsonb_set(${appSettings.value}, '{firstAt}', to_jsonb(${new Date(Date.now() - 25 * 3_600_000).toISOString()}::text))` }).where(eq(appSettings.key, STATIC_ATTEMPT_KEY));
      const stale = (await (await GET()).json()) as Body;
      expect(stale.staticData).toMatchObject({ state: "stale", reason: "download", patch: "26.24", stored: "26.23" });
      expect(stale.failingJobs).toContain("static-data");
    } finally {
      await db.delete(appSettings).where(inArray(appSettings.key, ["riot_assets", "riot_build_data", STATIC_ATTEMPT_KEY]));
      await db.delete(patches).where(inArray(patches.id, ["16.22", "16.23", "16.24"]));
      invalidateAllCaches();
    }
  });

  /*
    Release 11 (R11a × R11b): R11a's format 3 (Smite's charges) makes version-check download the
    current version again over a stored format-2 copy, through R11b's validation.
  */
  it("replaces a stored format-2 copy with a format-3 download that passes validation; a failed one keeps format 2 and is listed by the download rule", async () => {
    const db = handle.db;
    const files = {
      "item.json": { data: { "3067": { name: "Kindlegem", description: "<mainText><stats><attention>10</attention> Ability Haste</stats></mainText>", from: [], into: [], maps: { "11": true } } } },
      "summoner.json": { data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash", cooldown: [300] }, SummonerSmite: { id: "SummonerSmite", key: "11", name: "Smite", cooldown: [15], maxammo: "2" } } },
      "runesReforged.json": [{ id: 8100, name: "Domination", icon: "d.png", slots: [{ runes: [{ id: 8112, name: "Electrocute", icon: "e.png" }] }] }],
    };
    const good = (async (url: string) => new Response(JSON.stringify(files[url.split("/").pop() as "item.json"]), { status: 200 })) as unknown as typeof fetch;
    const down = (async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    type Body = { failingJobs: string[]; staticData: { state: string; patch: string | null; stored: string | null; reason: string | null; problems: unknown } };
    const v = "16.22.1";
    try {
      await db.update(patches).set({ isCurrent: false });
      await db.insert(patches).values({ id: "16.22", ddragonVersion: v, isCurrent: true, sortKey: patchSortKey("16.22") }).onConflictDoUpdate({ target: patches.id, set: { isCurrent: true } });
      // The copy production holds before the deploy: format 2, the current version.
      const old = { version: v, format: 2, items: { "3067": "Kindlegem" }, spells: { "4": { name: "Flash", icon: "SummonerFlash.png" } }, runes: {} };
      const oldBuild = { version: v, format: 2, itemInfo: {}, spellCooldowns: { "4": [300], "11": [15] }, runeSlots: {} };
      for (const [key, value] of [["riot_assets", old], ["riot_build_data", oldBuild]] as const) await db.insert(appSettings).values({ key, value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
      invalidateAllCaches();
      expect(((await (await GET()).json()) as Body).staticData.state).toBe("ok");
      // Data Dragon down: format 2 stays in use, the attempt is recorded, ok for a day and listed after.
      await expect(syncRiotAssets(db, v, down)).rejects.toThrow(/HTTP 503/);
      invalidateAllCaches();
      expect(await loadRiotBuildData(db)).toMatchObject({ version: v, format: 2 });
      expect(((await (await GET()).json()) as Body).staticData.state).toBe("ok");
      await db.update(appSettings).set({ value: sql`jsonb_set(${appSettings.value}, '{firstAt}', to_jsonb(${new Date(Date.now() - 25 * 3_600_000).toISOString()}::text))` }).where(eq(appSettings.key, STATIC_ATTEMPT_KEY));
      const stale = (await (await GET()).json()) as Body;
      expect(stale.staticData).toMatchObject({ state: "stale", reason: "download", patch: "26.22", stored: "26.22" });
      expect(stale.failingJobs).toContain("static-data");
      // The format-3 download passes validation: kept, Smite's charges apart, the attempt cleared, health ok.
      expect(await syncRiotAssets(db, v, good)).toBe(true);
      invalidateAllCaches();
      expect(await loadRiotAssets(db)).toMatchObject({ version: v, format: 3 });
      const build = await loadRiotBuildData(db);
      expect(build).toMatchObject({ version: v, format: 3, spellCooldowns: { "4": [300] }, spellCharges: { "11": 2 } });
      expect(build?.spellCooldowns["11"]).toBeUndefined();
      expect(await db.select().from(appSettings).where(eq(appSettings.key, STATIC_ATTEMPT_KEY))).toEqual([]);
      const ok = (await (await GET()).json()) as Body;
      expect(ok.staticData).toEqual({ state: "ok", patch: "26.22", stored: "26.22", reason: null, problems: null });
      expect(ok.failingJobs).not.toContain("static-data");
      // Once a version: the next check downloads nothing.
      expect(await syncRiotAssets(db, v, down)).toBe(false);
    } finally {
      await db.delete(appSettings).where(inArray(appSettings.key, ["riot_assets", "riot_build_data", STATIC_ATTEMPT_KEY]));
      await db.delete(patches).where(eq(patches.id, "16.22"));
      invalidateAllCaches();
    }
  });

  it("lists a static refresh with no version-check success for 72 hours, never one off by choice", async () => {
    type Body = { failingJobs: string[]; staticData: { state: string; reason: string | null } };
    const at = new Date(Date.now() - 73 * 3_600_000);
    try {
      await handle.db.insert(dataRefreshStatus).values({ key: "version-check", status: "ok", lastStartedAt: at, lastSuccessAt: at, updatedAt: at, consecutiveFailures: 0 });
      const stale = (await (await GET()).json()) as Body;
      expect(stale.staticData).toMatchObject({ state: "stale", reason: "no-success" });
      expect(stale.failingJobs).toContain("static-data");
      await setScheduleOverrides(handle.db, { intervals: { "version-check": 0 } });
      const off = (await (await GET()).json()) as Body;
      expect(off.staticData.state).toBe("ok");
      expect(off.failingJobs).not.toContain("static-data");
    } finally {
      await handle.db.delete(dataRefreshStatus).where(eq(dataRefreshStatus.key, "version-check"));
      await handle.db.delete(appSettings).where(eq(appSettings.key, "schedule"));
    }
  });
});

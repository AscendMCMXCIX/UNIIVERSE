import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { appSettings, dataRefreshStatus, riotAccounts } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { accountSyncLeaseKey } from "@/server/accounts/refresh";
import { RiotApiError, riotKeyFingerprint } from "@/server/riot/api/client";
import { recordRiotOutcome } from "@/server/riot/credential";
import { invalidateCache } from "@/server/observability/cache";
import { runJob } from "@/server/jobs";
import { GET as health } from "@/app/api/health/route";
import { markRankScheduleCall, RANK_SCHEDULE_CALL_KEY } from "@/server/ops/rank-schedule-calls";

/*
  What the owner is told about the data jobs: /api/health (read by every scheduled Data jobs run,
  which fails while `failingJobs` lists anything, so GitHub's email is the alert) and the account
  sync's own outcome (Admin Mode → Data & Integrations). A revoked Riot key, accounts that cannot
  be synced and runs that keep dying must all show there, never as a plain success.
*/

const KEY = "RGAPI-00000000-0000-0000-0000-0000000f1e2d";
let handle: DbHandle;
const savedKey = process.env.RIOT_API_KEY;

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  // The health endpoint opens the app's own database handle; this one stands in for it.
  globalThis.__uniiverseDb = Promise.resolve(handle);
});
afterAll(async () => {
  globalThis.__uniiverseDb = undefined;
  await handle.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (savedKey === undefined) delete process.env.RIOT_API_KEY;
  else process.env.RIOT_API_KEY = savedKey;
  invalidateCache("riot-credential");
});

async function readHealth() {
  const res = await health();
  return { status: res.status, body: (await res.json()) as { ok: boolean; failingJobs: string[]; riot?: { credential: string }; jobs: Array<{ key: string }> } };
}

describe("/api/health", () => {
  it("lists a rejected Riot key as failing, and says only the state of the key", async () => {
    const db = handle.db;
    process.env.RIOT_API_KEY = KEY;
    await recordRiotOutcome(db, { keyFingerprint: riotKeyFingerprint(KEY) }, { ok: false, error: new RiotApiError("Riot API 403 on /riot/account/v1/accounts/by-riot-id/x/y", 403, false) });
    invalidateCache("riot-credential");
    const rejected = await readHealth();
    expect(rejected.status).toBe(200);
    expect(rejected.body.ok).toBe(true);
    expect(rejected.body.riot).toEqual({ credential: "rejected" });
    expect(rejected.body.failingJobs).toContain("riot-key");
    // No key material: neither the key nor its fingerprint, nor Riot's answer.
    const text = JSON.stringify(rejected.body);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(riotKeyFingerprint(KEY).slice(1));
    expect(text).not.toMatch(/403|by-riot-id/);

    // Riot accepts the key again: nothing failing.
    await recordRiotOutcome(db, { keyFingerprint: riotKeyFingerprint(KEY) }, { ok: true });
    invalidateCache("riot-credential");
    const accepted = await readHealth();
    expect(accepted.body.riot).toEqual({ credential: "accepted" });
    expect(accepted.body.failingJobs).not.toContain("riot-key");

    // A deployment without a key (development, CI) is not an outage.
    delete process.env.RIOT_API_KEY;
    invalidateCache("riot-credential");
    const none = await readHealth();
    expect(none.body.riot).toEqual({ credential: "not-configured" });
    expect(none.body.failingJobs).not.toContain("riot-key");
  });

  it("lists a job whose run died, or that is being retried after failing, as failing", async () => {
    const db = handle.db;
    const now = Date.now();
    const rows = [
      // Killed: still says "running" long after any run could have finished.
      { key: "h-dead", status: "running" as const, lastStartedAt: new Date(now - 20 * 60_000), consecutiveFailures: 0 },
      // Failed twice and running again: failing until a run succeeds.
      { key: "h-retrying", status: "running" as const, lastStartedAt: new Date(now - 60_000), consecutiveFailures: 2 },
      { key: "h-failed", status: "failed" as const, lastStartedAt: new Date(now - 60 * 60_000), consecutiveFailures: 1 },
      // Healthy: a first run going, a success and a partial success.
      { key: "h-running", status: "running" as const, lastStartedAt: new Date(now - 60_000), consecutiveFailures: 0 },
      { key: "h-ok", status: "ok" as const, lastStartedAt: new Date(now - 60 * 60_000), consecutiveFailures: 0 },
      { key: "h-degraded", status: "degraded" as const, lastStartedAt: new Date(now - 60 * 60_000), consecutiveFailures: 0 },
    ];
    await db.insert(dataRefreshStatus).values(rows.map((r) => ({ ...r, updatedAt: new Date(now) })));
    const { body } = await readHealth();
    expect(body.failingJobs.filter((k) => k.startsWith("h-")).sort()).toEqual(["h-dead", "h-failed", "h-retrying"]);
    expect(body.jobs.map((j) => j.key)).toEqual(expect.arrayContaining(rows.map((r) => r.key)));
    await db.delete(dataRefreshStatus).where(inArray(dataRefreshStatus.key, rows.map((r) => r.key)));
  });

  it("lists the five-minute rank schedule while it is installed and has not called for 20 minutes, whatever runs the rank watch", async () => {
    const db = handle.db;
    const KEYS = ["rank-schedule", "rank-schedule-off", "rank-watch"];
    /** Status rows as these jobs leave them (each succeeded the given minutes ago), and the schedule's last call. */
    const set = async (rows: Array<[string, number]>, lastCallMinutesAgo: number | null) => {
      await db.delete(dataRefreshStatus).where(inArray(dataRefreshStatus.key, KEYS));
      await db.delete(appSettings).where(eq(appSettings.key, RANK_SCHEDULE_CALL_KEY));
      const now = Date.now();
      for (const [key, minutesAgo] of rows) {
        const at = new Date(now - minutesAgo * 60_000);
        await db.insert(dataRefreshStatus).values({ key, status: "ok", lastStartedAt: at, lastSuccessAt: at, updatedAt: at, consecutiveFailures: 0 });
      }
      if (lastCallMinutesAgo !== null) await markRankScheduleCall(db, new Date(now - lastCallMinutesAgo * 60_000));
    };
    const listed = async () => (await readHealth()).body.failingJobs.includes("rank-schedule");
    // Installed, and no call for 21 minutes (calls refused or never sent): listed, so the scheduled run fails.
    await set([["rank-schedule", 120], ["rank-watch", 21]], 21);
    const { body } = await readHealth();
    expect(body.ok).toBe(true);
    expect(body.failingJobs).toContain("rank-schedule");
    // The ten-minute tick (or a visit, or GitHub's run) still runs the rank watch: that does not hide a silent schedule.
    await set([["rank-schedule", 120], ["rank-watch", 2]], 25);
    expect(await listed()).toBe(true);
    // Installed again after an off, then silent: listed.
    await set([["rank-schedule-off", 600], ["rank-schedule", 500], ["rank-watch", 30]], 400);
    expect(await listed()).toBe(true);
    // Healthy: the schedule called within 20 minutes.
    await set([["rank-schedule", 120], ["rank-watch", 4]], 4);
    expect(await listed()).toBe(false);
    await set([["rank-schedule", 120], ["rank-watch", 19]], 19);
    expect(await listed()).toBe(false);
    // Removed on purpose (rank-schedule-off after the install), never installed, or installed minutes ago (never called yet): not listed.
    await set([["rank-schedule", 120], ["rank-schedule-off", 60], ["rank-watch", 300]], 300);
    expect(await listed()).toBe(false);
    await set([["rank-watch", 300]], null);
    expect(await listed()).toBe(false);
    await set([["rank-schedule", 3], ["rank-watch", 300]], null);
    expect(await listed()).toBe(false);
    await db.delete(dataRefreshStatus).where(inArray(dataRefreshStatus.key, KEYS));
    await db.delete(appSettings).where(eq(appSettings.key, RANK_SCHEDULE_CALL_KEY));
  });
});

/** Riot as the account sync sees it: `refuse` answers every request with that status; "Gone#OCE" does not exist. */
function riot(refuse?: number) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (refuse) return json({ status: { message: "Forbidden", status_code: refuse } }, refuse);
    const byRiotId = url.match(/\/accounts\/by-riot-id\/([^/]+)\/([^/?]+)/);
    if (byRiotId?.[1] === "Gone") return json({ status: { message: "Data not found", status_code: 404 } }, 404);
    if (byRiotId?.[1] === "Locked") return json({ status: { message: "Forbidden", status_code: 403 } }, 403);
    if (byRiotId) return json({ puuid: `puuid-${byRiotId[1]}`, gameName: byRiotId[1], tagLine: byRiotId[2] });
    if (url.includes("/region/by-game/")) return json({ puuid: "puuid", game: "lol", region: "OC1" });
    if (url.includes("/lol/league/v4/entries/by-puuid/")) return json([]);
    if (url.includes("/lol/champion-mastery/v4/")) return json([]);
    if (url.includes("/ids?")) return json([]);
    return json({}, 404);
  };
}

describe("the account sync's outcome", () => {
  const link = async (name: string) => {
    const db = handle.db;
    const player = await createPlayer(db, (await getOrCreateTeam(db)).id, { displayName: `Health ${name}`, primaryRole: "MID", primaryPool: ["Ahri"] });
    return addAccount(db, { ownerType: "player", playerId: player.id, riotId: `${name}#OCE`, platform: "oc1" });
  };
  /** Runs the sync as a later run would find these accounts: due again, their one-minute sync leases passed. */
  const runAgain = async (accounts: Array<{ id: string }>) => {
    const db = handle.db;
    await db.update(riotAccounts).set({ lastSyncAt: null }).where(inArray(riotAccounts.id, accounts.map((a) => a.id)));
    await db.delete(appSettings).where(inArray(appSettings.key, accounts.map((a) => accountSyncLeaseKey(a.id))));
    return runJob(db, "account-sync", "test");
  };

  it("says so when Riot refuses every account, so Admin Mode shows it, and the key is reported failing", async () => {
    const db = handle.db;
    process.env.RIOT_API_KEY = KEY;
    const accounts = [await link("Refused"), await link("AlsoRefused")];
    vi.stubGlobal("fetch", riot(403));
    const refused = await runJob(db, "account-sync", "test");
    expect(refused.ok).toBe(true);
    expect(refused.summary).toMatchObject({ synced: 2, failed: 2 });
    expect(refused.degraded).toBe(true);
    expect(refused.error).toMatch(/None of the 2 linked accounts/);
    expect(refused.error).not.toMatch(/#|Refused|RGAPI/);
    const [status] = await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, "account-sync"));
    expect(status!.status).toBe("degraded");
    expect(status!.lastError).toBe(refused.error);
    invalidateCache("riot-credential");
    expect((await readHealth()).body.failingJobs).toContain("riot-key");
    // Riot accepts the key again: the accounts sync and nothing is reported.
    vi.stubGlobal("fetch", riot());
    const recovered = await runAgain(accounts);
    expect(recovered).toMatchObject({ ok: true, degraded: false, summary: { synced: 2, failed: 0 } });
    expect(recovered.error).toBeUndefined();
    invalidateCache("riot-credential");
    expect((await readHealth()).body.failingJobs).not.toContain("riot-key");
  });

  it("is degraded when some accounts could not be synced, and says how many without naming them", async () => {
    const db = handle.db;
    process.env.RIOT_API_KEY = KEY;
    const accounts = [await link("Good"), await link("Locked")];
    // Riot refuses one of the two: a partial success, and the run says so.
    vi.stubGlobal("fetch", riot());
    const partial = await runAgain(accounts);
    expect(partial.ok).toBe(true);
    expect(partial.summary).toMatchObject({ failed: 1, needsAttention: 0 });
    expect(partial.degraded).toBe(true);
    expect(partial.error).toMatch(/1 of the \d+ linked accounts/);
    expect(partial.error).not.toMatch(/#|Locked|Good/);
    const [status] = await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, "account-sync"));
    expect(status!.status).toBe("degraded");
  });

  it("does not stay degraded for an account that needs a person (a Riot ID Riot does not know)", async () => {
    process.env.RIOT_API_KEY = KEY;
    const accounts = [await link("Fine"), await link("Gone")];
    vi.stubGlobal("fetch", riot());
    // Retried every run until someone fixes or removes it, so counting it would leave every run degraded.
    const r = await runAgain(accounts);
    expect(r.summary).toMatchObject({ failed: 0, needsAttention: 1 });
    expect(r.degraded).toBe(false);
  });
});

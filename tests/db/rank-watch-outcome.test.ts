import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq, inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, dataRefreshStatus, jobRuns, rankSnapshots, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { invalidateCache } from "@/server/observability/cache";
import { getDataHealth } from "@/server/ops/status";
import { runJob } from "@/server/jobs";
import { GET as health } from "@/app/api/health/route";

/*
  The rank watch's outcome, as Admin shows it: a run in which no account could be read (every one
  tried failed: a Riot outage, timeouts, the network; or the rate limits had no room before the
  first reading) is degraded and says so in counts, so Admin repeats it as a warning. It is still
  not "failing": neither a Riot outage nor a busy key may fail the scheduled Data jobs run, and the
  run still answers ok, so the schedule's call is not refused. A partial read, a full rate limit
  after a reading and a refused key keep their own outcomes.
*/

const ZERO_KEY = "RGAPI-00000000-0000-0000-0000-000000000000";
let handle: DbHandle;
const saved = { key: process.env.RIOT_API_KEY, logs: process.env.UNIIVERSE_JOB_LOGS };
const accounts: string[] = [];

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  globalThis.__uniiverseDb = Promise.resolve(handle);
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  process.env.UNIIVERSE_JOB_LOGS = "silent";
  const now = Date.now();
  const team = await getOrCreateTeam(db);
  const p = await createPlayer(db, team.id, { displayName: "Watched", primaryRole: "MID", primaryPool: [] });
  for (const puuid of ["watch-a", "watch-b"]) {
    const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: `Name-${puuid}`, tagLine: "T", platform: "oc1", puuid, label: "alt" }).returning({ id: riotAccounts.id });
    accounts.push(a!.id);
    await db.insert(accountMatches).values({ accountId: a!.id, matchId: `OC1_${puuid}`, gameCreation: now - 86_400_000, gameDuration: 1800, queueId: 420, win: true, patch: "16.21", championId: "Ahri" });
    await db.insert(rankSnapshots).values({ accountId: a!.id, queue: "solo", tier: "GOLD", division: "II", leaguePoints: 40, wins: 10, losses: 10, capturedAt: new Date(now - 2 * 86_400_000), confirmedAt: new Date(now - 10 * 60_000) });
  }
}, 60_000);
afterAll(async () => {
  globalThis.__uniiverseDb = undefined;
  for (const [k, v] of [["RIOT_API_KEY", saved.key], ["UNIIVERSE_JOB_LOGS", saved.logs]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await handle.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  invalidateCache("riot-credential");
});

/**
 * The given accounts due again (last read 10 to 12 minutes ago, the first longest ago, so it is read
 * first; the others just read), then one run with Riot answering per account.
 */
async function run(answer: (puuid: string) => number | "ok", due = accounts) {
  const db = handle.db;
  await db.update(rankSnapshots).set({ confirmedAt: new Date() }).where(inArray(rankSnapshots.accountId, accounts));
  for (const [i, id] of due.entries()) await db.update(rankSnapshots).set({ confirmedAt: new Date(Date.now() - (10 + due.length - i) * 60_000) }).where(eq(rankSnapshots.accountId, id));
  process.env.RIOT_API_KEY = ZERO_KEY;
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const puuid = decodeURIComponent(String(input).split("/entries/by-puuid/")[1] ?? "");
    const a = answer(puuid);
    if (a === "ok") return new Response(JSON.stringify([{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", leaguePoints: 40, wins: 10, losses: 10 }]), { status: 200, headers: { "content-type": "application/json" } });
    // retry-after 0: a 429 pauses the process-wide limiter, which would stop a later run before any request.
    return new Response(JSON.stringify({ status: { message: "x", status_code: a } }), { status: a, headers: { "content-type": "application/json", "retry-after": "0" } });
  });
  return runJob(db, "rank-watch", "test");
}

describe("the rank watch's outcome", () => {
  it("says so in counts when no account tried could be read, so Admin repeats it, without failing the health check", async () => {
    const db = handle.db;
    const outcome = await run(() => 503);
    expect(outcome).toMatchObject({ ok: true, degraded: true, summary: { read: 0, failed: 2 } });
    expect(outcome.error).toBe("None of the 2 accounts tried this run could be read; the run's log says why.");
    expect(outcome.error).not.toMatch(/watch-|Name-/);
    const [status] = await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, "rank-watch"));
    expect(status!.lastError).toBe(outcome.error);
    expect((await getDataHealth(db)).warnings).toContain(`rank-watch: ${outcome.error}`);
    const [row] = await db.select({ ok: jobRuns.ok, error: jobRuns.error }).from(jobRuns).where(eq(jobRuns.job, "rank-watch")).orderBy(desc(jobRuns.startedAt)).limit(1);
    expect(row).toEqual({ ok: "true", error: outcome.error });
    expect(((await (await health()).json()) as { failingJobs: string[] }).failingJobs).not.toContain("rank-watch");
  });

  it("names the one account tried as one", async () => {
    const outcome = await run(() => 503, [accounts[0]!]);
    expect(outcome.summary).toMatchObject({ due: 1, read: 0, failed: 1 });
    expect(outcome.error).toBe("The one account tried this run could not be read; the run's log says why.");
  });

  it("is unchanged for a partial read and a refused key", async () => {
    const partial = await run((p) => (p === "watch-a" ? "ok" : 503));
    expect(partial).toMatchObject({ ok: true, degraded: false, summary: { read: 1, failed: 1 } });
    expect(partial.error).toBeUndefined();
    const refused = await run(() => 403);
    expect(refused).toMatchObject({ ok: true, degraded: true, error: "Riot refused the key (403)" });
  });

  // Last: a 429 pauses the process-wide limiter (for its retry-after, 0 here).
  it("says so in counts when the rate limits had no room before the first reading, still without failing", async () => {
    const db = handle.db;
    const limited = await run(() => 429);
    expect(limited).toMatchObject({ ok: true, degraded: true, summary: { due: 2, read: 0, failed: 0, stoppedBy: "no room in the rate limits" } });
    expect(limited.error).toBe("None of the 2 accounts due could be read this run: the rate limits had no room before the first reading (account sync and the rank checks share them); the next run reads again.");
    expect((await getDataHealth(db)).warnings).toContain(`rank-watch: ${limited.error}`);
    expect(((await (await health()).json()) as { failingJobs: string[] }).failingJobs).not.toContain("rank-watch");
    expect((await run(() => 429, [accounts[0]!])).error).toBe("The one account due could not be read this run: the rate limits had no room before the first reading (account sync and the rank checks share them); the next run reads again.");
    // After a reading, a full rate limit is a partial read, as before: the next run reads the rest.
    const after = await run((p) => (p === "watch-a" ? "ok" : 429));
    expect(after).toMatchObject({ ok: true, degraded: false, summary: { read: 1, failed: 0, stoppedBy: "no room in the rate limits" } });
    expect(after.error).toBeUndefined();
  });
});

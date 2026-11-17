import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accountMatches, dataRefreshStatus, jobRuns, lastKnownRanks, matchDetails, riotAccounts, type MatchParticipantDetail } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { invalidateCache } from "@/server/observability/cache";
import { getDataHealth } from "@/server/ops/status";
import { resetRankLookups } from "@/server/players/participant-ranks";
import { runJob } from "@/server/jobs";
import { GET as health } from "@/app/api/health/route";

/*
  The rank checks' outcome, as Admin shows it (the "degraded with no message" that #257 fixed for
  the rank watch): a run in which no player asked could be checked (a Riot outage, timeouts, the
  network) is degraded and says so in counts, so Admin repeats it as a warning, and the run's log
  says what the failures met, by Riot's status. It is still not "failing": a Riot outage must not
  fail the scheduled Data jobs run. No player is ever named.
*/

const ZERO_KEY = "RGAPI-00000000-0000-0000-0000-000000000000";
const MATCH = "OC1_RECENT";
let handle: DbHandle;
const saved = { key: process.env.RIOT_API_KEY, logs: process.env.UNIIVERSE_JOB_LOGS };
let gameEnd = 0;

const part = (puuid: string, name: string, teamId: number): MatchParticipantDetail => ({
  puuid,
  name,
  teamId,
  championId: "Ahri",
  championKey: 0,
  champLevel: 15,
  position: null,
  win: teamId === 100,
  kills: 1,
  deaths: 1,
  assists: 1,
  cs: 100,
  gold: 9000,
  damage: 10000,
  damageTaken: 10000,
  vision: 10,
  wardsPlaced: 5,
  items: null,
  spells: null,
  runes: null,
});

beforeAll(async () => {
  handle = await testDb();
  const db = handle.db;
  globalThis.__uniiverseDb = Promise.resolve(handle);
  await syncStaticData(db, new FixtureStaticProvider(), { fingerprint: false });
  process.env.UNIIVERSE_JOB_LOGS = "silent";
  const team = await getOrCreateTeam(db);
  const p = await createPlayer(db, team.id, { displayName: "Checked", primaryRole: "MID", primaryPool: [] });
  const [a] = await db.insert(riotAccounts).values({ ownerType: "player", playerId: p.id, gameName: "Member", tagLine: "OCE", platform: "oc1", puuid: "member-puuid", label: "main" }).returning({ id: riotAccounts.id });
  // A game the member played six hours ago, with three other players to check.
  const start = Date.now() - 6 * 3_600_000;
  gameEnd = start + 1800 * 1000;
  const participants = [part("member-puuid", "Member#OCE", 100), part("p-1", "Stranger One#OCE", 100), part("p-2", "Stranger Two#OCE", 200), part("p-3", "Stranger Three#OCE", 200)];
  await db.insert(matchDetails).values({ matchId: MATCH, platform: "oc1", queueId: 420, gameCreation: start, gameDuration: 1800, gameVersion: "16.21.1", teams: [], participants });
  await db.insert(accountMatches).values({ accountId: a!.id, matchId: MATCH, gameCreation: start, gameDuration: 1800, queueId: 420, championId: "Ahri", role: "MID", win: true, patch: "16.21" });
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
 * One run with Riot answering per player (an HTTP status, "ok", or "throw" for no answer at all).
 * `checked` players already have a reading from after the game, so they are not asked.
 */
async function run(answer: (puuid: string) => number | "ok" | "throw", checked: string[] = []) {
  const db = handle.db;
  // Forget this instance's pauses after failures, and the readings an earlier run stored.
  resetRankLookups();
  await db.delete(lastKnownRanks);
  for (const puuid of checked) await db.insert(lastKnownRanks).values({ puuid, tier: "GOLD", division: "II", leaguePoints: 40, flexTier: "UNRANKED", observedAt: new Date(gameEnd + 60_000), source: "match lookup" });
  process.env.RIOT_API_KEY = ZERO_KEY;
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const puuid = decodeURIComponent(String(input).split("/entries/by-puuid/")[1] ?? "");
    const a = answer(puuid);
    if (a === "throw") throw new TypeError("fetch failed");
    if (a === "ok") return new Response(JSON.stringify([{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "II", leaguePoints: 40, wins: 10, losses: 10 }]), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ status: { message: "x", status_code: a } }), { status: a, headers: { "content-type": "application/json" } });
  });
  return runJob(db, "rank-checks", "test");
}

const logsOf = (outcome: { summary?: Record<string, unknown> }) => (outcome.summary?.logs as string[] | undefined) ?? [];

describe("the rank checks' outcome", () => {
  it("says so in counts when no player asked could be checked, so Admin repeats it, without failing the health check", async () => {
    const db = handle.db;
    const outcome = await run(() => 503);
    expect(outcome).toMatchObject({ ok: true, degraded: true, summary: { asked: 3, found: 0, failed: 3, failedBy: { "Riot 503": 3 } } });
    expect(outcome.error).toBe("None of the 3 players asked this run could be checked; the run's log says why.");
    // The log says why, in counts.
    expect(logsOf(outcome).some((l) => l.includes("3 failed (Riot 503: 3)"))).toBe(true);
    // Nobody named: not in the message, the log or the summary.
    expect(JSON.stringify({ error: outcome.error, summary: outcome.summary })).not.toMatch(/p-[123]|Stranger|member-puuid/);
    const [status] = await db.select().from(dataRefreshStatus).where(eq(dataRefreshStatus.key, "rank-checks"));
    expect(status!.status).toBe("degraded");
    expect(status!.lastError).toBe(outcome.error);
    expect((await getDataHealth(db)).warnings).toContain(`rank-checks: ${outcome.error}`);
    const [row] = await db.select({ ok: jobRuns.ok, error: jobRuns.error }).from(jobRuns).where(eq(jobRuns.job, "rank-checks")).orderBy(desc(jobRuns.startedAt)).limit(1);
    expect(row).toEqual({ ok: "true", error: outcome.error });
    expect(((await (await health()).json()) as { failingJobs: string[] }).failingJobs).not.toContain("rank-checks");
  });

  it("names the one player asked as one, and counts what each failure met", async () => {
    const one = await run(() => 404, ["p-1", "p-2"]);
    expect(one).toMatchObject({ degraded: true, summary: { asked: 1, failed: 1, failedBy: { "Riot 404": 1 } } });
    expect(one.error).toBe("The one player asked this run could not be checked; the run's log says why.");
    // No answer at all (the network, a timeout) is counted apart from Riot's statuses.
    const mixed = await run((p) => (p === "p-1" ? "throw" : 500));
    expect(mixed).toMatchObject({ degraded: true, summary: { asked: 3, failed: 3, failedBy: { "no readable answer": 1, "Riot 500": 2 } } });
  });

  it("is a plain success when any player asked was checked, or nobody was waiting", async () => {
    const partial = await run((p) => (p === "p-1" ? "ok" : 503));
    expect(partial).toMatchObject({ ok: true, degraded: false, summary: { asked: 3, found: 1, failed: 2, failedBy: { "Riot 503": 2 } } });
    expect(partial.error).toBeUndefined();
    const none = await run(() => 503, ["p-1", "p-2", "p-3"]);
    expect(none).toMatchObject({ ok: true, degraded: false, summary: { asked: 0, waiting: 0, failedBy: {} } });
    expect(none.error).toBeUndefined();
  });
});

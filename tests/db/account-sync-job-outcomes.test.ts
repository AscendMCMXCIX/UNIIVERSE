import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { AccountSyncResult } from "@/server/accounts/sync";

/*
  How the account-sync job counts what syncAccount reports (tests/db/sync-deadlines.test.ts covers
  syncAccount itself). Review of the deadline fixes, round 2: an account that met Riot failing and
  then ran out of time carries both `error` and `outOfTime`. The job counted failures only without
  outOfTime, so it reported a healthy run while the account went Pending and the key's failure was
  recorded. It is a failure (the run degraded), and the run stops there like any run out of time.
*/

const outcomes = vi.hoisted(() => ({ next: [] as Array<Partial<AccountSyncResult>>, synced: [] as string[] }));
vi.mock("@/server/accounts/sync", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/accounts/sync")>();
  return {
    ...real,
    syncAccount: async (_db: unknown, _client: unknown, account: { id: string; platform: string }): Promise<AccountSyncResult> => {
      outcomes.synced.push(account.id);
      const o = outcomes.next.shift() ?? {};
      return { accountId: account.id, resolved: true, platform: account.platform, platformSource: "riot", matchesFetched: 0, matchesFolded: 0, masteryRows: 0, rankUpdated: false, status: "ok", ...o };
    },
  };
});

const { runJob } = await import("@/server/jobs");
const { createPlayer, getOrCreateTeam } = await import("@/server/repositories/team");
const { addAccount } = await import("@/server/accounts/repository");

let handle: DbHandle;
const env = { ...process.env };
beforeAll(async () => {
  handle = await testDb();
  const teamId = (await getOrCreateTeam(handle.db)).id;
  const player = await createPlayer(handle.db, teamId, { displayName: "Job Outcomes", primaryRole: "TOP", primaryPool: [] });
  await addAccount(handle.db, { ownerType: "player", playerId: player.id, riotId: "Job Outcomes#OCE", platform: "oc1" });
  await addAccount(handle.db, { ownerType: "player", playerId: player.id, riotId: "Job Outcomes Alt#OCE", platform: "oc1" });
  process.env.RIOT_API_KEY = "RGAPI-00000000-0000-0000-0000-00000000cafe";
  process.env.UNIIVERSE_JOB_LOGS = "silent";
}, 60_000);
afterEach(() => {
  outcomes.next = [];
  outcomes.synced = [];
});
afterAll(async () => {
  for (const key of ["RIOT_API_KEY", "UNIIVERSE_JOB_LOGS"]) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  await handle.close();
});

describe("the account-sync job's count", () => {
  it("an account that met Riot failing and ran out of time is a failure, and the run stops there", async () => {
    outcomes.next = [{ status: "pending", error: "Riot's servers are having trouble. Your account is saved and retried automatically.", outOfTime: true }];
    const result = await runJob(handle.db, "account-sync", "test", { budgetMs: 20_000 });
    expect(result).toMatchObject({ ok: true, degraded: true, summary: { failed: 1, stoppedForTime: true } });
    expect(outcomes.synced).toHaveLength(1);
  });

  it("a run out of time with no failure is not degraded", async () => {
    // The run above claimed the first account: clear the leases so this run may claim it again.
    await handle.db.execute(sql`DELETE FROM app_settings WHERE key LIKE 'account_sync:%'`);
    outcomes.next = [{ status: "ok", outOfTime: true }];
    const result = await runJob(handle.db, "account-sync", "test", { budgetMs: 20_000 });
    expect(result).toMatchObject({ ok: true, degraded: false, summary: { failed: 0, stoppedForTime: true } });
    expect(outcomes.synced).toHaveLength(1);
  });
});

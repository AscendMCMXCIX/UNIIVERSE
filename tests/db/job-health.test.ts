import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { dataRefreshStatus } from "@/server/db/schema";
import { RiotApiError, riotKeyFingerprint } from "@/server/riot/api/client";
import { recordRiotOutcome } from "@/server/riot/credential";
import { invalidateCache } from "@/server/observability/cache";
import { GET as health } from "@/app/api/health/route";

/*
  What the owner is told about the data jobs: /api/health (read by every scheduled Data jobs run,
  which fails while `failingJobs` lists anything, so GitHub's email is the alert). A revoked Riot
  key and runs that keep dying must show there, never as a plain success.
*/

const KEY = "RGAPI-00000000-0000-0000-0000-0000000f1e2d";
let handle: DbHandle;
const savedKey = process.env.RIOT_API_KEY;

beforeAll(async () => {
  handle = await testDb();
  // The health endpoint opens the app's own database handle; this one stands in for it.
  globalThis.__uniiverseDb = Promise.resolve(handle);
});
afterAll(async () => {
  globalThis.__uniiverseDb = undefined;
  await handle.close();
});
afterEach(() => {
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
});

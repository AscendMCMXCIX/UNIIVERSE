import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import type { SamplerClient } from "@/server/champion-builds/high-elo/sampler";

/*
  The Master+ sampling's job as the scheduler runs it (jobs/registry runJob), with the collection's
  gate and client stood in for (this build has neither): what a failed region and a refused key
  leave in the stored run (job_runs, data_refresh_status) and in the answer names no game. Riot's
  error messages carry their route, and a match's route its id (server/riot/api/client.ts
  routeLabel), which the stored summary once kept for 60 days; the registration text and the
  privacy notice say no match id is stored.
*/

const riot = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/server/champion-builds/high-elo/switch", async (importOriginal) => ({ ...(await importOriginal<object>()), highEloGate: () => ({ on: true, off: [] }) }));
vi.mock("@/server/champion-builds/high-elo/sampler-client", () => ({ samplerClientFor: () => riot.client }));

const { RiotApiError } = await import("@/server/riot/api/client");
const { runJob } = await import("@/server/jobs");

const rowsOf = <T,>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];
/** Realistic ids (made up): a platform's upper-case id and ten digits, as Riot's are. */
const matchId = (platform: string, i: number) => `${platform.toUpperCase()}_74012345${String(i).padStart(2, "0")}`;
const puuid = (platform: string, i: number) => `${platform}-${"x".repeat(70)}-${i}`;

function failingRiot(fail: (id: string) => Error): SamplerClient & { ids: string[] } {
  const ids: string[] = [];
  return {
    ids,
    async apexLeague(platform) {
      return { entries: Array.from({ length: 10 }, (_, i) => ({ puuid: puuid(platform, i) })) };
    },
    async matchIdsByPuuid(platform) {
      return [matchId(platform, 1), matchId(platform, 2)];
    },
    async match(_platform, id) {
      ids.push(id);
      throw fail(id);
    },
    async matchTimeline() {
      throw new Error("not reached");
    },
  };
}

let handle: DbHandle;
beforeAll(async () => {
  handle = await testDb();
}, 120_000);
afterAll(async () => handle?.close());
beforeEach(async () => {
  await handle.db.execute(sql`DELETE FROM high_elo_cursors`);
});

async function stored(): Promise<string> {
  const runs = rowsOf(await handle.db.execute(sql`SELECT summary, error FROM job_runs WHERE job = 'high-elo-sample'`));
  const status = rowsOf(await handle.db.execute(sql`SELECT details, last_error FROM data_refresh_status WHERE key = 'high-elo-sample'`));
  return JSON.stringify({ runs, status });
}

describe("the Master+ sampling's stored runs", () => {
  it("keeps a failed region's reason without the route or the match's id", async () => {
    const client = failingRiot((id) => new RiotApiError(`Riot API 503 on /lol/match/v5/matches/${id}`, 503, true));
    riot.client = client;
    const run = await runJob(handle.db, "high-elo-sample", "cli");
    expect(run.ok).toBe(false);
    expect((run.summary as { regions: Array<{ outcome: string; error?: string }> }).regions.every((r) => r.outcome === "failed" && r.error === "Riot API 503")).toBe(true);
    expect(client.ids.length).toBeGreaterThan(0);
    const text = `${await stored()}${JSON.stringify(run)}`;
    for (const id of client.ids) expect(text).not.toContain(id);
    expect(text).not.toMatch(/\/lol\/|_74012345|x{40}/);
  });

  it("stops on a refused key with Riot's words for it, not the route it came on", async () => {
    const client = failingRiot((id) => new RiotApiError(`Riot API 403 on /lol/match/v5/matches/${id}`, 403, false));
    riot.client = client;
    const run = await runJob(handle.db, "high-elo-sample", "cli");
    expect(run).toMatchObject({ ok: false });
    expect(run.error).toMatch(/^Riot API 403: the key was rejected/);
    const text = `${await stored()}${JSON.stringify(run)}`;
    for (const id of client.ids) expect(text).not.toContain(id);
    expect(text).not.toMatch(/\/lol\/|_74012345|x{40}/);
  });
});

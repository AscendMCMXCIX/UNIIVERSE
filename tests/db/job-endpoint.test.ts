import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { RunJobResult } from "@/server/jobs";

/*
  The job endpoint's answer is what a scheduler acts on: the manual Data jobs run and the daily
  Vercel cron call the tick with `curl --fail` or log the status, so a tick in which a job failed
  must not answer "200 ok". The jobs themselves are stubbed: only the answer is under test.
*/

const state = vi.hoisted(() => ({
  ran: [] as RunJobResult[],
  single: null as RunJobResult | null,
  later: [] as Array<() => Promise<unknown>>,
}));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => ({}) }));
vi.mock("@/server/jobs", () => ({
  getJob: (key: string) => (key === "integrity" ? { key } : undefined),
  runJob: async () => state.single,
  runTick: async () => ({ ran: state.ran, skipped: ["figures-backfill: not due"] }),
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (task: () => Promise<unknown>) => void state.later.push(task) }));

import { GET } from "@/app/api/jobs/[job]/route";

const SECRET = "job-endpoint-test-secret";
const savedSecret = process.env.CRON_SECRET;
beforeAll(() => {
  process.env.CRON_SECRET = SECRET;
});
afterAll(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});
beforeEach(() => {
  state.ran = [];
  state.single = null;
  state.later = [];
});

const result = (key: RunJobResult["key"], outcome: Partial<RunJobResult>): RunJobResult => ({ key, ok: true, durationMs: 10, ...outcome });
async function call(job: string, query = "") {
  const res = await GET(new NextRequest(`http://localhost/api/jobs/${job}${query}`, { headers: { authorization: `Bearer ${SECRET}` } }), { params: Promise.resolve({ job }) });
  return { status: res.status, body: (await res.json()) as { ok: boolean; accepted?: boolean; ran?: RunJobResult[] } };
}

describe("the tick's answer", () => {
  it("is 500 and not ok when a job that ran failed, with every result in it", async () => {
    state.ran = [result("version-check", {}), result("account-sync", { ok: false, error: "database went away" }), result("rank-checks", { degraded: true })];
    const { status, body } = await call("tick");
    expect(status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.ran?.map((r) => [r.key, r.ok])).toEqual([["version-check", true], ["account-sync", false], ["rank-checks", true]]);
  });

  it("is 200 and ok when every job that ran succeeded, partly or wholly, or was already running elsewhere", async () => {
    state.ran = [result("version-check", {}), result("account-sync", { degraded: true, error: "1 of the 4 linked accounts tried could not be synced" }), result("integrity", { skipped: true })];
    expect(await call("tick")).toMatchObject({ status: 200, body: { ok: true } });
    // Nothing was due: nothing failed.
    state.ran = [];
    expect(await call("tick")).toMatchObject({ status: 200, body: { ok: true } });
  });

  it("in the background is accepted at once; the jobs' outcome reaches /api/health instead", async () => {
    state.ran = [result("account-sync", { ok: false, error: "database went away" })];
    expect(await call("tick", "?background=1")).toMatchObject({ status: 202, body: { ok: true, accepted: true } });
    expect(state.later).toHaveLength(1);
    await state.later[0]!();
  });

  it("for one job is 500 when it failed (as before)", async () => {
    state.single = result("integrity", { ok: false, error: "boom" });
    expect(await call("integrity")).toMatchObject({ status: 500, body: { ok: false } });
    state.single = result("integrity", {});
    expect(await call("integrity")).toMatchObject({ status: 200, body: { ok: true } });
  });
});

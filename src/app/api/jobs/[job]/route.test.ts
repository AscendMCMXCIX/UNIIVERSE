import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
  The job endpoint's answer is printed in the repository's public Actions log by every manual Data
  jobs run (.github/workflows/data-jobs.yml), and a job's last log lines travel in it. An account
  sync logs "match <id> failed …" and a backfill "<id>: <error>", so the answer must carry no match
  id, PUUID or Riot ID (CLAUDE.md: counts and anonymous labels only), while the fields the workflows
  read (summary.state, summary.databaseMb, ok) stay as they are. The jobs themselves are stubs; every
  identifier here is made up.
*/

const PUUID = "A1b2".repeat(19) + "Cd"; // 78 characters, the length of a PUUID
const LOGS = [
  "match OC1_1234567890 failed: Rate limited",
  `OC1_1234567890: Riot answered 503 on /lol/match/v5/matches/by-puuid/${PUUID}/ids`,
  "Example Player#TEST could not be found",
];

const state = vi.hoisted(() => ({ ran: [] as string[] }));

vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => ({}) }));
vi.mock("@/server/ops/rank-schedule-calls", () => ({ markRankScheduleCall: async () => undefined }));
vi.mock("@/server/ops/deployment", () => ({ deploymentInfo: () => ({ commit: "2f4ae30", region: "syd1" }) }));
vi.mock("@/server/jobs", () => ({
  getJob: (key: string) => (["figures-backfill", "verify-account", "db-usage"].includes(key) ? { key } : undefined),
  runJob: async (_db: unknown, key: string) => {
    state.ran.push(key);
    const summary = key === "verify-account" ? { state: "unchanged", logs: [] } : key === "db-usage" ? { databaseMb: 156, logs: [] } : { state: "done", logs: LOGS };
    return { key, ok: true, degraded: key === "figures-backfill", summary, durationMs: 5 };
  },
  runTick: async () => {
    state.ran.push("tick");
    return { ran: [{ key: "account-sync", ok: true, degraded: true, summary: { logs: LOGS }, durationMs: 5 }, { key: "rank-watch", ok: true, summary: { read: 12, logs: [] }, durationMs: 3 }] };
  },
}));

import { GET } from "./route";

const call = (job: string, authorization = "Bearer test-secret") =>
  GET(new NextRequest(`https://example.test/api/jobs/${job}`, { headers: { authorization } }), { params: Promise.resolve({ job }) });

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  state.ran = [];
});

describe("the job endpoint's answer", () => {
  it("carries no match id, PUUID or Riot ID from a job's log lines", async () => {
    const res = await call("figures-backfill");
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    for (const id of ["OC1_1234567890", PUUID, "Example Player#TEST"]) expect(text).not.toContain(id);
    const body = JSON.parse(text);
    expect(body.summary.logs).toEqual(["match <match> failed: Rate limited", "<match>: Riot answered 503 on /lol/match/v5/matches/by-puuid/<token>/ids", "<riot-id> could not be found"]);
    expect(body).toMatchObject({ key: "figures-backfill", ok: true, degraded: true, summary: { state: "done" }, deployment: { commit: "2f4ae30", region: "syd1" } });
  });

  it("does the same for a tick, whose answer lists every job that ran", async () => {
    const res = await call("tick");
    const text = await res.text();
    expect(res.status).toBe(200);
    for (const id of ["OC1_1234567890", PUUID, "Example Player#TEST"]) expect(text).not.toContain(id);
    const body = JSON.parse(text);
    expect(body.ok).toBe(true);
    expect(body.ran.map((r: { key: string }) => r.key)).toEqual(["account-sync", "rank-watch"]);
    expect(body.ran[0].summary.logs[0]).toBe("match <match> failed: Rate limited");
    expect(body.ran[1].summary.read).toBe(12);
  });

  it("keeps the fields the workflows read: verify-account's state and db-usage's size", async () => {
    expect((await (await call("verify-account")).json()).summary.state).toBe("unchanged");
    expect((await (await call("db-usage")).json()).summary.databaseMb).toBe(156);
  });

  it("still refuses a call without the scheduler's secret, before any job runs", async () => {
    const res = await call("figures-backfill", "Bearer wrong");
    expect(res.status).toBe(401);
    expect(state.ran).toEqual([]);
  });
});

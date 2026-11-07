import { describe, expect, it, vi } from "vitest";

/*
  /api/vitals counts a signed-in member's page loads, and never the Production check's: its
  verification account (username "verify", no player profile; jobs/verify-account.ts) signs in and
  opens the member pages every day, and its loads would otherwise stand in members' field figures.
  Nothing is stored here: the database write (recordVitals) is a spy.
*/

const state = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  recorded: [] as unknown[],
  later: [] as Array<() => Promise<unknown>>,
}));

vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: (task: () => Promise<unknown>) => void state.later.push(task) }));
vi.mock("@/server/auth/session", () => ({ getSession: async () => state.session }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => ({}) }));
vi.mock("@/server/observability/web-vitals", () => ({
  fieldMetricsEnabled: () => true,
  recordVitals: async (_db: unknown, beacon: unknown) => void state.recorded.push(beacon),
}));

import { POST } from "./route";

const base = { role: "player", label: "Member", hasPassword: true, mustChangePassword: false, setupComplete: true };
const verification = { ...base, userId: "11111111-1111-4111-8111-111111111111", username: "verify", playerId: null, label: "Production verification" };
const member = { ...base, userId: "22222222-2222-4222-8222-222222222222", username: "member", playerId: "33333333-3333-4333-8333-333333333333" };
const verifyWithProfile = { ...base, userId: "44444444-4444-4444-8444-444444444444", username: "verify", playerId: "55555555-5555-4555-8555-555555555555" };
const memberWithoutProfile = { ...base, userId: "66666666-6666-4666-8666-666666666666", username: "newcomer", playerId: null };

async function send(session: Record<string, unknown> | null) {
  state.session = session;
  state.recorded = [];
  state.later = [];
  const body = JSON.stringify({ page: "team", device: "desktop", metrics: { TTFB: 6, FCP: 3, SERVER: 4 } });
  const res = await POST(new Request("https://example.test/api/vitals", { method: "POST", body, headers: { "sec-fetch-site": "same-origin", "content-type": "text/plain;charset=UTF-8" } }));
  for (const task of state.later) await task();
  return { status: res.status, recorded: state.recorded.length };
}

describe("/api/vitals", () => {
  it("drops the verification account's loads", async () => {
    expect(await send(verification)).toEqual({ status: 204, recorded: 0 });
  });
  it("counts a member's loads, with a profile or not yet", async () => {
    expect(await send(member)).toEqual({ status: 204, recorded: 1 });
    expect(await send(memberWithoutProfile)).toEqual({ status: 204, recorded: 1 });
  });
  it("counts an account named verify that has a player profile: not the account the job keeps", async () => {
    expect(await send(verifyWithProfile)).toEqual({ status: 204, recorded: 1 });
  });
  it("drops a signed-out beacon", async () => {
    expect(await send(null)).toEqual({ status: 204, recorded: 0 });
  });
});

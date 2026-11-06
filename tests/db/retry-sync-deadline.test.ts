import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  The syncs a person waits on in the Riot accounts tab (actions/accounts.ts: Retry sync, and the
  first sync after linking an account) carry a deadline (ACCOUNT_ACTION_BUDGET_MS, shortened here): no Riot request starts after it, so the sync ends within one request of it,
  inside the 100-second lease the scheduler respects; the answer says it stopped for time instead
  of "no new games", and the account is left for the next sync, neither failed nor marked synced.
*/

const BUDGET_MS = 600;
const DELAY_MS = 250;
const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => state.session, requireRiotAccountEditor: async () => state.session, requirePermission: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/server/accounts/refresh", async (orig) => ({ ...(await orig<object>()), ACCOUNT_ACTION_BUDGET_MS: 600 }));

import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount } from "@/server/accounts/repository";
import { addPlayerAccountAction, syncPlayerAccountAction } from "@/server/actions/accounts";

let handle: DbHandle;
let playerId: string;
const started: number[] = [];
// A slow Riot: every answer takes DELAY_MS, so the account's lookups and lists outlast the budget.
const riot = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  started.push(Date.now());
  await new Promise((r) => setTimeout(r, DELAY_MS));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  // Each Riot ID its own account (the same PUUID twice would stop the second at the duplicate check).
  if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
    const name = decodeURIComponent(url.split("/by-riot-id/")[1]!.split("/")[0]!);
    return json({ puuid: `p-${name}`, gameName: name, tagLine: "OCE" });
  }
  if (url.includes("/riot/account/v1/accounts/by-puuid/")) return json({ puuid: "p-slow", gameName: "Slow", tagLine: "OCE" });
  if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid: "p-slow", game: "lol", region: "oc1" });
  if (url.includes("/ids?")) return json(["OC1_1", "OC1_2"]);
  if (url.includes("/lol/league/v4/entries/by-puuid/") || url.includes("/lol/champion-mastery/v4/")) return json([]);
  return json({}, 404);
};
const owner = (): Session => ({ userId: "11111111-1111-4111-8111-111111111111", label: "Owner", username: "owner", hasPassword: true, mustChangePassword: false, setupComplete: true, role: "owner", playerId: null, teamMember: true }) as Session;

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  state.session = owner();
  const teamId = (await getOrCreateTeam(handle.db)).id;
  playerId = (await createPlayer(handle.db, teamId, { displayName: "Slow", primaryRole: "MID", primaryPool: [] })).id;
  process.env.RIOT_API_KEY = "RGAPI-00000000-0000-0000-0000-000000000000";
  globalThis.fetch = riot as typeof fetch;
}, 60_000);
afterAll(async () => {
  delete process.env.RIOT_API_KEY;
  await handle.close();
});

describe("Retry sync on the Riot accounts tab", () => {
  it("stops at its deadline, starts no request after it, and says it stopped for time", async () => {
    const account = await addAccount(handle.db, { ownerType: "player", playerId, riotId: "Slow#OCE", platform: "oc1" });
    started.length = 0;
    const t0 = Date.now();
    const r = await syncPlayerAccountAction(playerId, account.id);
    const took = Date.now() - t0;
    expect(r.ok).toBe(true);
    if (!r.ok || r.data.status === "recent") throw new Error("expected a sync result");
    expect(r.data.outOfTime).toBe(true);
    expect(r.data.error).toBeUndefined();
    // Riot was asked, and every request started before the deadline (a little slack for the clock).
    expect(started.length).toBeGreaterThan(0);
    expect(Math.max(...started) - t0).toBeLessThan(BUDGET_MS + 50);
    // So the sync ended within one request of its deadline: far inside the scheduler's 100 s lease.
    expect(took).toBeLessThan(BUDGET_MS + DELAY_MS + 500);
    // Not failed and not marked synced: the next sync carries on.
    const [row] = await handle.db.select({ status: riotAccounts.syncStatus }).from(riotAccounts).where(eq(riotAccounts.id, account.id));
    expect(row!.status).not.toBe("failed");
    expect(row!.status).not.toBe("ok");
  });

  it("bounds linking an account the same way: its first sync starts no request after the deadline", async () => {
    started.length = 0;
    const t0 = Date.now();
    const r = await addPlayerAccountAction(playerId, { riotId: "Slower#OCE" });
    const took = Date.now() - t0;
    expect(r.ok).toBe(true);
    expect(started.length).toBeGreaterThan(0);
    expect(Math.max(...started) - t0).toBeLessThan(BUDGET_MS + 50);
    expect(took).toBeLessThan(BUDGET_MS + DELAY_MS + 500);
    // Stopped for time, not failed: the account is linked and waits for the next sync.
    if (!r.ok) throw new Error("expected the account");
    expect(r.data.syncStatus).not.toBe("failed");
    expect(r.data.syncStatus).not.toBe("unresolved");
    expect(r.data.syncError).toBeNull();
  });
});

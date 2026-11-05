import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/permissions";

/*
  The account's sync lease around the first sync after linking, the replacement account's first
  sync, and the owner's retry (accounts/refresh.ts, actions/accounts.ts, accounts/change-riot-id.ts):
  each claims the lease so no other sync starts on the account meanwhile, and the first two give
  it back as soon as their sync is done, so the page's own refresh carries the history on at once
  instead of 100 seconds later. The retry leaves an account another sync holds alone, and says so.
*/

const state = vi.hoisted(() => ({ db: null as unknown, session: null as unknown }));
vi.mock("@/server/bootstrap", () => ({ getAppDb: async () => state.db }));
vi.mock("@/server/auth/session", async (orig) => ({ ...(await orig<object>()), getSession: async () => state.session, requireRiotAccountEditor: async () => state.session, requirePermission: async () => state.session }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

import { eq, like } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { appSettings, riotAccounts } from "@/server/db/schema";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { SCHEDULED_SYNC_LEASE_MS, claimAccountSync } from "@/server/accounts/refresh";
import { changeAccountRiotId } from "@/server/accounts/change-riot-id";
import { addPlayerAccountAction, retryPendingAccountsAction } from "@/server/actions/accounts";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";

let handle: DbHandle;
let playerId: string;
const calls: string[] = [];
const resolves: Record<string, string> = { "Linked#OCE": "p-linked", "Fresh#OCE": "p-fresh", "Pending A#OCE": "p-pending-a", "Pending B#OCE": "p-pending-b" };
const riot = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  calls.push(url);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
    const [name, tag] = url.split("/by-riot-id/")[1]!.split("/").map((x) => decodeURIComponent(x));
    const puuid = resolves[`${name}#${tag}`];
    return puuid ? json({ puuid, gameName: name, tagLine: tag }) : json({ status: { message: "not found" } }, 404);
  }
  if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid: /by-puuid\/([^/?]+)/.exec(url)?.[1], game: "lol", region: "oc1" });
  if (url.includes("/ids?") || url.includes("/lol/league/v4/entries/by-puuid/") || url.includes("/lol/champion-mastery/v4/")) return json([]);
  return json({}, 404);
};
const owner = (): Session => ({ userId: "11111111-1111-4111-8111-111111111111", label: "Owner", username: "owner", hasPassword: true, mustChangePassword: false, setupComplete: true, role: "owner", playerId: null, teamMember: true }) as Session;
const asked = (riotId: string) => calls.some((u) => u.includes(`/by-riot-id/${encodeURIComponent(riotId.split("#")[0]!)}/`));

beforeAll(async () => {
  handle = await testDb();
  state.db = handle.db;
  state.session = owner();
  const teamId = (await getOrCreateTeam(handle.db)).id;
  playerId = (await createPlayer(handle.db, teamId, { displayName: "Leased", primaryRole: "MID", primaryPool: [] })).id;
  process.env.RIOT_API_KEY = "RGAPI-00000000-0000-0000-0000-000000000000";
  globalThis.fetch = riot as typeof fetch;
}, 60_000);
afterAll(async () => {
  delete process.env.RIOT_API_KEY;
  await handle.close();
});

describe("the first sync after linking", () => {
  it("runs under the account's lease and gives it back when it is done", async () => {
    calls.length = 0;
    const r = await addPlayerAccountAction(playerId, { riotId: "Linked#OCE" });
    expect(r.ok).toBe(true);
    expect(asked("Linked#OCE")).toBe(true);
    const linked = (await listAccountsForPlayer(handle.db, playerId)).find((a) => a.gameName === "Linked")!;
    expect(linked).toMatchObject({ syncStatus: "ok" });
    // Free again: the next sync (a view's slice, a Refresh) claims it at once.
    expect(await claimAccountSync(handle.db, linked.id, SCHEDULED_SYNC_LEASE_MS)).toBe(true);
    await handle.db.delete(appSettings).where(like(appSettings.key, "account_sync:%"));
  });
});

describe("a replaced Riot ID's first sync", () => {
  it("runs under the new account's lease and gives it back when it is done", async () => {
    const db = handle.db;
    const client = new RiotApiClient({ apiKey: "k", fetchImpl: riot, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
    const old = (await listAccountsForPlayer(db, playerId)).find((a) => a.gameName === "Linked")!;
    const change = await changeAccountRiotId(db, client, old, "Fresh#OCE", { confirmReplace: true });
    expect(change.kind).toBe("replaced");
    const fresh = (change as { accountId: string }).accountId;
    expect((await listAccountsForPlayer(db, playerId)).find((a) => a.id === fresh)).toMatchObject({ gameName: "Fresh", syncStatus: "ok" });
    expect(await claimAccountSync(db, fresh, SCHEDULED_SYNC_LEASE_MS)).toBe(true);
    await db.delete(appSettings).where(like(appSettings.key, "account_sync:%"));
  });
});

describe("the owner's retry of pending accounts", () => {
  it("leaves an account another sync holds alone, and counts only what it tried", async () => {
    const db = handle.db;
    const a = await addAccount(db, { ownerType: "player", playerId, riotId: "Pending A#OCE", platform: "oc1" });
    const b = await addAccount(db, { ownerType: "player", playerId, riotId: "Pending B#OCE", platform: "oc1" });
    // The scheduler is syncing A right now.
    expect(await claimAccountSync(db, a.id, SCHEDULED_SYNC_LEASE_MS)).toBe(true);
    calls.length = 0;
    const r = await retryPendingAccountsAction();
    expect(r.ok).toBe(true);
    expect(r.ok && r.data).toEqual({ attempted: 1, synced: 1, pending: 0, failed: 0, skipped: 1 });
    expect(asked("Pending A#OCE")).toBe(false);
    expect(asked("Pending B#OCE")).toBe(true);
    expect((await db.select({ status: riotAccounts.syncStatus }).from(riotAccounts).where(eq(riotAccounts.id, a.id)))[0]).toEqual({ status: "never" });
    expect((await db.select({ status: riotAccounts.syncStatus }).from(riotAccounts).where(eq(riotAccounts.id, b.id)))[0]).toEqual({ status: "ok" });
    await db.delete(appSettings).where(like(appSettings.key, "account_sync:%"));
  });
});

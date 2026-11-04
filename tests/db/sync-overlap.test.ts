import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like, or } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { appSettings, riotAccounts } from "@/server/db/schema";
import { FixtureStaticProvider } from "@/server/riot/static/fixture";
import { syncStaticData } from "@/server/riot/static/sync";
import { createPlayer, getOrCreateTeam } from "@/server/repositories/team";
import { addAccount, listAccountsForPlayer } from "@/server/accounts/repository";
import { syncAccount } from "@/server/accounts/sync";
import { REFRESH_COOLDOWN_MS, SCHEDULED_SYNC_LEASE_MS, claimAccountSync, refreshPlayerMatches } from "@/server/accounts/refresh";
import { kickoffAccountSync, refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";
import { dueForViewRefresh } from "@/domain/account-status";
import { refreshNote } from "@/components/ui/refresh-note";
import { RiotApiClient } from "@/server/riot/api/client";
import { RateLimiter } from "@/server/riot/api/rate-limiter";

/*
  Syncs of one account never run on top of each other, and a Refresh says what it did not do.
  Every sync of a linked account claims the account's lease first (accounts/refresh.ts): the
  scheduler's, a Refresh's, the visit refresh's (kickoff.ts), the first sync after linking and the
  owner's retry. A Refresh claims each account's lease right before reading it, never for the
  accounts its budget does not reach, and names an account it could not read beside the result
  instead of saying "no new games" for a check that did not happen. An account a person has to
  correct (the same Riot account as another linked one) backs off like any failed attempt and is
  never retried by a page view. A rename Riot reports is kept out when another row already spells
  the new name, once, with the cause logged.
*/

interface RiotState {
  /** PUUIDs whose every request fails (Riot's servers are having trouble). */
  down?: Set<string>;
  /** What ACCOUNT-V1 by-puuid answers for a PUUID (a rename made in Riot). */
  names?: Record<string, { gameName: string; tagLine: string }>;
  /** What a Riot ID resolves to, by "name#tag". */
  resolves?: Record<string, string>;
  /** Called before every request (a test clock). */
  onRequest?: (url: string) => void;
}

/** Riot answering nothing new for any account: no games, no rank, no mastery. */
function riot(calls: string[], state: RiotState = {}) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    calls.push(url);
    state.onRequest?.(url);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const puuid = /by-puuid\/([^/?]+)/.exec(url)?.[1];
    if (puuid && state.down?.has(puuid)) return json({ status: { message: "Service unavailable" } }, 503);
    if (url.includes("/riot/account/v1/accounts/by-riot-id/")) {
      const [name, tag] = url.split("/by-riot-id/")[1]!.split("/").map((x) => decodeURIComponent(x));
      const resolved = state.resolves?.[`${name}#${tag}`];
      return resolved ? json({ puuid: resolved, gameName: name, tagLine: tag }) : json({ status: { message: "not found" } }, 404);
    }
    if (url.includes("/riot/account/v1/accounts/by-puuid/")) {
      const name = state.names?.[puuid!];
      return name ? json({ puuid, ...name }) : json({ status: { message: "not found" } }, 404);
    }
    if (url.includes("/riot/account/v1/region/by-game/lol/by-puuid/")) return json({ puuid, game: "lol", region: "oc1" });
    if (url.includes("/ids?") || url.includes("/lol/league/v4/entries/by-puuid/") || url.includes("/lol/champion-mastery/v4/")) return json([]);
    return json({}, 404);
  };
}
const client = (fetchImpl: ReturnType<typeof riot>) => new RiotApiClient({ apiKey: "k", fetchImpl, limiter: new RateLimiter([{ requests: 1000, seconds: 1 }]), sleep: async () => {}, maxRetries: 0 });
const idsRequested = (calls: string[]) => calls.filter((u) => u.includes("/ids?")).length;

let handle: DbHandle;
let teamId: string;
const env = { ...process.env };
const realFetch = globalThis.fetch;

/** A player with two verified accounts, nothing stored, both with their season history complete. */
async function twoAccounts(name: string, puuids: [string, string]) {
  const db = handle.db;
  const player = await createPlayer(db, teamId, { displayName: name, primaryRole: "MID", primaryPool: ["Ahri"] });
  const main = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: `${name}#OCE`, platform: "oc1", puuid: puuids[0] });
  const alt = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: `${name}Alt#OCE`, platform: "oc1", puuid: puuids[1] });
  for (const id of [main.id, alt.id]) await db.update(riotAccounts).set({ syncStatus: "ok", lastSyncAt: new Date(), platformSource: "riot", riotIdCheckedAt: new Date() }).where(eq(riotAccounts.id, id));
  return { player, main, alt };
}

beforeAll(async () => {
  handle = await testDb();
  await syncStaticData(handle.db, new FixtureStaticProvider(), { fingerprint: false });
  teamId = (await getOrCreateTeam(handle.db)).id;
}, 60_000);
afterEach(async () => {
  globalThis.fetch = realFetch;
  for (const key of ["RIOT_API_KEY", "UNIIVERSE_BACKGROUND_REFRESH", "VERCEL"]) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  // Every lease, so one test's claims never reach the next.
  await handle.db.delete(appSettings).where(or(like(appSettings.key, "account_sync:%"), like(appSettings.key, "account_refresh:%")));
});
afterAll(async () => {
  await handle.close();
});

describe("a Refresh", () => {
  it("names the account it could not read beside the result instead of saying there is nothing new", async () => {
    const { player, alt } = await twoAccounts("Partial", ["p-partial-main", "p-partial-alt"]);
    const calls: string[] = [];
    const outcome = await refreshPlayerMatches(handle.db, client(riot(calls, { down: new Set(["p-partial-alt"]) })), player.id);
    expect(outcome).toMatchObject({ status: "no-new", problem: { accounts: 1, message: expect.stringMatching(/Riot's servers are having trouble/) } });
    // The alt's own row says so too, and the notification carries the warning tone with the cause.
    expect((await listAccountsForPlayer(handle.db, player.id)).find((a) => a.id === alt.id)).toMatchObject({ syncStatus: "pending" });
    const note = refreshNote(outcome, null);
    expect(note.text).toBe("No new games · 1 account could not be read: Riot's servers are having trouble. Your account is saved and retried automatically.");
    expect(note.tone).toBe("info");
    // With every account read, nothing is said.
    const fine = await refreshPlayerMatches(handle.db, client(riot([])), (await twoAccounts("Whole", ["p-whole-main", "p-whole-alt"])).player.id);
    expect(fine).toEqual({ status: "no-new", checkedAt: expect.any(String) });
  });

  it("claims an account's lease only when it reads it, so the accounts its budget never reaches stay free", async () => {
    const { player, main, alt } = await twoAccounts("Budget", ["p-budget-main", "p-budget-alt"]);
    let clock = Date.parse("2026-11-04T10:00:00Z");
    const now = () => new Date(clock);
    const calls: string[] = [];
    // The first account's reading takes 41 seconds of the 40-second budget: the second is never started.
    const outcome = await refreshPlayerMatches(handle.db, client(riot(calls, { onRequest: (url) => (url.includes("/ids?") ? (clock += 41_000) : clock) })), player.id, { now });
    expect(outcome).toMatchObject({ status: "no-new" });
    expect(calls.some((u) => u.includes("p-budget-main"))).toBe(true);
    expect(calls.some((u) => u.includes("p-budget-alt"))).toBe(false);
    // The read account is claimed for the cooldown; the unread one is free for the scheduler.
    expect(await claimAccountSync(handle.db, main.id, SCHEDULED_SYNC_LEASE_MS, now())).toBe(false);
    expect(await claimAccountSync(handle.db, alt.id, SCHEDULED_SYNC_LEASE_MS, now())).toBe(true);
  });
});

describe("the visit refresh and the first sync after linking", () => {
  it("stand aside from a sync already running on the account, and read it once that sync is over", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Viewed", primaryRole: "TOP", primaryPool: ["Gwen"] });
    const account = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Viewed#OCE", platform: "oc1" });
    process.env.RIOT_API_KEY = "RGAPI-00000000-0000-0000-0000-000000000000";
    process.env.UNIIVERSE_BACKGROUND_REFRESH = "true";
    const calls: string[] = [];
    globalThis.fetch = riot(calls, { resolves: { "Viewed#OCE": "p-viewed" } }) as typeof fetch;
    // A Refresh is reading the account right now (its lease is claimed for the cooldown).
    expect(await claimAccountSync(db, account.id, REFRESH_COOLDOWN_MS)).toBe(true);
    expect(await refreshPlayerAccountsIfDue(db, player.id)).toBe(0);
    await kickoffAccountSync(db, player.id);
    expect(calls).toEqual([]);
    expect((await listAccountsForPlayer(db, player.id))[0]).toMatchObject({ syncStatus: "never", puuid: null });
    // The leases released: the next view reads it.
    await db.delete(appSettings).where(or(like(appSettings.key, "account_sync:%"), like(appSettings.key, "account_refresh:%")));
    expect(await refreshPlayerAccountsIfDue(db, player.id)).toBe(1);
    expect(idsRequested(calls)).toBeGreaterThan(0);
    expect((await listAccountsForPlayer(db, player.id))[0]).toMatchObject({ syncStatus: "ok", puuid: "p-viewed" });
    // And it claimed the account's lease as every sync does: the scheduler stands aside now.
    expect(await claimAccountSync(db, account.id, SCHEDULED_SYNC_LEASE_MS)).toBe(false);
  });
});

describe("an account a person has to correct", () => {
  it("backs off like any failed attempt when it is the same Riot account as another linked one, and no page view retries it", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Twice", primaryRole: "ADC", primaryPool: ["Jinx"] });
    await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Twice#OCE", platform: "oc1", puuid: "p-twice" });
    const dup = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "TwiceRenamed#OCE", platform: "oc1" });
    const resolving = client(riot([], { resolves: { "TwiceRenamed#OCE": "p-twice" } }));
    const first = await syncAccount(db, resolving, dup);
    expect(first).toMatchObject({ status: "failed", error: expect.stringMatching(/same Riot account/) });
    const row = async () => (await listAccountsForPlayer(db, player.id)).find((a) => a.id === dup.id)!;
    expect((await row()).resolveAttempts).toBe(1);
    await syncAccount(db, resolving, await row());
    expect((await row()).resolveAttempts).toBe(2);
    const a = await row();
    expect(dueForViewRefresh({ syncStatus: a.syncStatus, syncError: a.syncError, lastSyncAt: a.lastSyncAt, puuid: a.puuid, history: a.historyBackfill }, new Date(Date.now() + 3_600_000))).toBe(false);
  });

  it("keeps its stored name when Riot's new name is already another linked row's, checks once, and says why", async () => {
    const db = handle.db;
    const player = await createPlayer(db, teamId, { displayName: "Renamed", primaryRole: "MID", primaryPool: ["Ahri"] });
    const x = await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "Old#OCE", platform: "oc1", puuid: "p-old" });
    await db.update(riotAccounts).set({ syncStatus: "ok", platformSource: "riot" }).where(eq(riotAccounts.id, x.id));
    // The renamed account linked again under its new name, not resolved yet.
    await addAccount(db, { ownerType: "player", playerId: player.id, riotId: "New#OCE", platform: "oc1" });
    const calls: string[] = [];
    const lines: string[] = [];
    const r = await syncAccount(db, client(riot(calls, { names: { "p-old": { gameName: "New", tagLine: "OCE" } } })), (await listAccountsForPlayer(db, player.id)).find((a) => a.id === x.id)!, { log: (m) => lines.push(m) });
    expect(r.status).toBe("ok");
    const after = (await listAccountsForPlayer(db, player.id)).find((a) => a.id === x.id)!;
    expect(after).toMatchObject({ gameName: "Old", tagLine: "OCE" });
    expect(after.riotIdCheckedAt).not.toBeNull();
    expect(lines.some((l) => /already uses the new name/.test(l))).toBe(true);
    // The check was made once: the next sync does not ask again.
    const again: string[] = [];
    await syncAccount(db, client(riot(again, { names: { "p-old": { gameName: "New", tagLine: "OCE" } } })), after);
    expect(again.some((u) => u.includes("/accounts/by-puuid/"))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { canRetrySync, describeAccountSync, dueForViewRefresh, summariseAccounts } from "./account-status";

const now = new Date("2026-10-13T12:00:00Z");
const h = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe("account sync wording", () => {
  it("maps stored states to Updating / Catching up on history / Up to date / Delayed / Needs attention without HTTP codes", () => {
    expect(describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(2), puuid: "p" }, now)).toMatchObject({ state: "synced", label: "Up to date", lastUpdatedAt: h(2) });
    // Six hours without a refresh is a delay (accounts refresh every 45 minutes or so).
    expect(describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(7), puuid: "p" }, now)).toMatchObject({ state: "stale", label: "Delayed" });
    expect(describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(60), puuid: "p" }, now)).toMatchObject({ state: "stale", label: "Delayed" });
    expect(describeAccountSync({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: null }, now)).toMatchObject({ state: "pending", label: "Updating" });
    expect(describeAccountSync({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: "p" }, now)).toMatchObject({ state: "verified", label: "Updating" });
    const syncing = describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(1), puuid: "p", history: { completedAt: null, queues: { "420": { offset: 100, done: false }, "400": { offset: 20, done: true } } } }, now);
    expect(syncing).toMatchObject({ state: "syncing", label: "Catching up on history" });
    expect(syncing.detail).toMatch(/automatically/);
    expect(syncing.detail).toMatch(/120 so far/);
    expect(describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(1), puuid: "p", history: { completedAt: h(1).toISOString(), queues: {} } }, now).state).toBe("synced");
    expect(describeAccountSync({ syncStatus: "pending", syncError: null, lastSyncAt: h(1), puuid: "p" }, now)).toMatchObject({ state: "stale", label: "Delayed" });
    expect(describeAccountSync({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: null, riotConfigured: false }, now).detail).toMatch(/Riot API key/);
    expect(describeAccountSync({ syncStatus: "pending", syncError: "Riot's servers did not answer; this account is retried automatically.", lastSyncAt: h(1), puuid: null }, now)).toMatchObject({ state: "pending" });
    expect(describeAccountSync({ syncStatus: "unresolved", syncError: null, lastSyncAt: h(1), puuid: null }, now)).toMatchObject({ state: "error", label: "Needs attention" });
    const failed = describeAccountSync({ syncStatus: "failed", syncError: "Duplicate account.", lastSyncAt: h(1), puuid: null }, now);
    expect(failed.state).toBe("error");
    expect(failed.detail).not.toMatch(/\b[45]\d\d\b/);
  });

  it("summarises several accounts honestly", () => {
    const synced = describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(1), puuid: "p" }, now);
    const pending = describeAccountSync({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: null }, now);
    const error = describeAccountSync({ syncStatus: "unresolved", syncError: null, lastSyncAt: h(1), puuid: null }, now);
    expect(summariseAccounts([]).state).toBe("none");
    expect(summariseAccounts([synced, synced])).toMatchObject({ state: "synced", label: "2 Riot accounts up to date" });
    expect(summariseAccounts([synced, pending]).state).toBe("pending");
    expect(summariseAccounts([synced, error]).state).toBe("error");
  });

  it("offers a manual retry only when automation has not managed: never while history is still being added", () => {
    const view = (f: Parameters<typeof describeAccountSync>[0]) => canRetrySync(describeAccountSync(f, now));
    expect(view({ syncStatus: "ok", syncError: null, lastSyncAt: h(1), puuid: "p", history: { completedAt: null, queues: {} } })).toBe(false);
    expect(view({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: null })).toBe(false);
    expect(view({ syncStatus: "ok", syncError: null, lastSyncAt: h(1), puuid: "p" })).toBe(false);
    expect(view({ syncStatus: "ok", syncError: null, lastSyncAt: h(30), puuid: "p" })).toBe(true);
    expect(view({ syncStatus: "unresolved", syncError: null, lastSyncAt: h(1), puuid: null })).toBe(true);
  });
});

describe("dueForViewRefresh", () => {
  const m = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
  it("refreshes an account viewed 15 minutes or more after its last refresh, and one still being set up", () => {
    expect(dueForViewRefresh({ syncStatus: "ok", syncError: null, lastSyncAt: m(16), puuid: "p" }, now)).toBe(true);
    expect(dueForViewRefresh({ syncStatus: "ok", syncError: null, lastSyncAt: m(5), puuid: "p" }, now)).toBe(false);
    expect(dueForViewRefresh({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: "p" }, now)).toBe(true);
    expect(dueForViewRefresh({ syncStatus: "ok", syncError: null, lastSyncAt: m(5), puuid: "p", history: { completedAt: null, queues: {} } }, now)).toBe(true);
  });

  it("never refreshes a demo account, nor an account a person has to correct (a Riot ID Riot could not find, or one already linked)", () => {
    expect(dueForViewRefresh({ syncStatus: "demo", syncError: null, lastSyncAt: null, puuid: null }, now)).toBe(false);
    expect(dueForViewRefresh({ syncStatus: "unresolved", syncError: null, lastSyncAt: m(60), puuid: null }, now)).toBe(false);
    expect(dueForViewRefresh({ syncStatus: "failed", syncError: "This is the same Riot account as Old#OCE, which is already linked.", lastSyncAt: m(60), puuid: null }, now)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { describeAccountSync, summariseAccounts } from "./account-status";

const now = new Date("2026-10-13T12:00:00Z");
const h = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

describe("account sync wording", () => {
  it("maps stored states to Pending sync / Verified / Synchronising / Synced / Delayed / Failed without HTTP codes", () => {
    expect(describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(2), puuid: "p" }, now)).toMatchObject({ state: "synced", label: "Synced", lastUpdatedAt: h(2) });
    expect(describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(60), puuid: "p" }, now)).toMatchObject({ state: "stale", label: "Delayed" });
    expect(describeAccountSync({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: null }, now)).toMatchObject({ state: "pending", label: "Pending sync" });
    expect(describeAccountSync({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: "p" }, now)).toMatchObject({ state: "verified", label: "Verified" });
    const syncing = describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(1), puuid: "p", history: { completedAt: null, queues: { "420": { offset: 100, done: false }, "400": { offset: 20, done: true } } } }, now);
    expect(syncing).toMatchObject({ state: "syncing", label: "Synchronising" });
    expect(syncing.detail).toMatch(/120 so far/);
    expect(describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(1), puuid: "p", history: { completedAt: h(1).toISOString(), queues: {} } }, now).state).toBe("synced");
    expect(describeAccountSync({ syncStatus: "pending", syncError: null, lastSyncAt: h(1), puuid: "p" }, now)).toMatchObject({ state: "stale", label: "Delayed" });
    expect(describeAccountSync({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: null, riotConfigured: false }, now).detail).toMatch(/Riot API key/);
    expect(describeAccountSync({ syncStatus: "pending", syncError: "Riot's servers did not answer; this account is retried automatically.", lastSyncAt: h(1), puuid: null }, now)).toMatchObject({ state: "pending" });
    expect(describeAccountSync({ syncStatus: "unresolved", syncError: null, lastSyncAt: h(1), puuid: null }, now)).toMatchObject({ state: "error", label: "Failed" });
    const failed = describeAccountSync({ syncStatus: "failed", syncError: "Duplicate account.", lastSyncAt: h(1), puuid: null }, now);
    expect(failed.state).toBe("error");
    expect(failed.detail).not.toMatch(/\b[45]\d\d\b/);
  });

  it("summarises several accounts honestly", () => {
    const synced = describeAccountSync({ syncStatus: "ok", syncError: null, lastSyncAt: h(1), puuid: "p" }, now);
    const pending = describeAccountSync({ syncStatus: "never", syncError: null, lastSyncAt: null, puuid: null }, now);
    const error = describeAccountSync({ syncStatus: "unresolved", syncError: null, lastSyncAt: h(1), puuid: null }, now);
    expect(summariseAccounts([]).state).toBe("none");
    expect(summariseAccounts([synced, synced])).toMatchObject({ state: "synced", label: "2 Riot accounts synced" });
    expect(summariseAccounts([synced, pending]).state).toBe("pending");
    expect(summariseAccounts([synced, error]).state).toBe("error");
  });
});

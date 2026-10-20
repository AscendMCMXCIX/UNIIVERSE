import { describe, expect, it } from "vitest";
import { syncRefreshInterval } from "./auto-refresh";

describe("syncRefreshInterval", () => {
  it("refreshes quickly while an account is verified or fetched for the first time", () => {
    expect(syncRefreshInterval(["synced", "pending"])).toBe(30_000);
    expect(syncRefreshInterval(["syncing", "verified"])).toBe(30_000);
  });

  it("refreshes slowly while an account only catches up on older games, and not at all otherwise", () => {
    expect(syncRefreshInterval(["synced", "syncing"])).toBe(120_000);
    expect(syncRefreshInterval(["synced", "stale", "error"])).toBeNull();
    expect(syncRefreshInterval([])).toBeNull();
  });
});

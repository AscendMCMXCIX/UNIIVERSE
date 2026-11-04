import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedFor, INFLIGHT_JOIN_MS, invalidateAllCaches, invalidateCache } from "./cache";

describe("cachedFor", () => {
  beforeEach(() => {
    invalidateAllCaches();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    invalidateAllCaches();
  });

  it("joins a load in flight, then serves the value until the TTL ends", async () => {
    let loads = 0;
    const load = () => new Promise<number>((resolve) => setTimeout(() => resolve(++loads), 100));
    const a = cachedFor("k", 60_000, load);
    const b = cachedFor("k", 60_000, load);
    await vi.advanceTimersByTimeAsync(100);
    expect(await a).toBe(1);
    expect(await b).toBe(1);
    expect(await cachedFor("k", 60_000, load)).toBe(1);
    vi.setSystemTime(new Date("2026-10-13T12:02:00Z"));
    const c = cachedFor("k", 60_000, load);
    await vi.advanceTimersByTimeAsync(100);
    expect(await c).toBe(2);
  });

  it("stops joining a load that never settles and starts a fresh one after the join window", async () => {
    let calls = 0;
    const stuck = () => {
      calls += 1;
      return new Promise<string>(() => {});
    };
    const fresh = () => {
      calls += 1;
      return Promise.resolve("fresh");
    };
    void cachedFor("wedged", 60_000, stuck);
    void cachedFor("wedged", 60_000, fresh);
    expect(calls).toBe(1);
    vi.setSystemTime(new Date(Date.now() + INFLIGHT_JOIN_MS + 1));
    expect(await cachedFor("wedged", 60_000, fresh)).toBe("fresh");
    expect(calls).toBe(2);
    expect(await cachedFor("wedged", 60_000, stuck)).toBe("fresh");
  });

  it("keeps the last known value when a refresh fails and clears a first load that fails", async () => {
    let ok = true;
    const load = () => (ok ? Promise.resolve("v1") : Promise.reject(new Error("down")));
    expect(await cachedFor("lkg", 1_000, load)).toBe("v1");
    vi.setSystemTime(new Date(Date.now() + 2_000));
    ok = false;
    expect(await cachedFor("lkg", 1_000, load)).toBe("v1");
    await expect(cachedFor("never", 1_000, load)).rejects.toThrow("down");
    ok = true;
    expect(await cachedFor("never", 1_000, load)).toBe("v1");
  });

  it("does not keep a value read before an invalidation that came while it loaded", async () => {
    // A load reads the old lineup; a lineup change commits and invalidates while it runs.
    let lineup = "old";
    const load = () => {
      const read = lineup;
      return new Promise<string>((resolve) => setTimeout(() => resolve(read), 100));
    };
    const before = cachedFor("public-team", 60_000, load);
    await vi.advanceTimersByTimeAsync(50);
    lineup = "new";
    invalidateCache("public-team");
    await vi.advanceTimersByTimeAsync(50);
    // The request that asked first gets what it read; the cache does not keep it.
    expect(await before).toBe("old");
    const after = cachedFor("public-team", 60_000, load);
    await vi.advanceTimersByTimeAsync(100);
    expect(await after).toBe("new");
  });

  it("does not put the last known value back when the key was invalidated during a failed refresh", async () => {
    let value = "v1";
    let ok = true;
    const load = () => {
      const read = value;
      return ok ? Promise.resolve(read) : new Promise<string>((_, reject) => setTimeout(() => reject(new Error("down")), 100));
    };
    expect(await cachedFor("lkg-invalidated", 1_000, load)).toBe("v1");
    vi.setSystemTime(new Date(Date.now() + 2_000));
    ok = false;
    const refresh = cachedFor("lkg-invalidated", 1_000, load);
    value = "v2";
    invalidateCache("lkg-invalidated");
    await vi.advanceTimersByTimeAsync(100);
    expect(await refresh).toBe("v1");
    ok = true;
    expect(await cachedFor("lkg-invalidated", 1_000, load)).toBe("v2");
  });

  it("never lets a load that outlived the join window replace the newer value, whether it ends with a value or an error", async () => {
    const late = (outcome: "value" | "error") => () => new Promise<string>((resolve, reject) => setTimeout(() => (outcome === "value" ? resolve("old") : reject(new Error("dropped"))), INFLIGHT_JOIN_MS + 5_000));
    const notAgain = () => Promise.resolve("read again");
    for (const outcome of ["value", "error"] as const) {
      const key = `late-${outcome}`;
      // A value to fall back on, expired, so the slow load is a refresh.
      expect(await cachedFor(key, 1_000, () => Promise.resolve("older"))).toBe("older");
      vi.setSystemTime(new Date(Date.now() + 2_000));
      const slow = cachedFor(key, 60_000, late(outcome));
      await vi.advanceTimersByTimeAsync(INFLIGHT_JOIN_MS + 1);
      expect(await cachedFor(key, 60_000, () => Promise.resolve("new"))).toBe("new");
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await slow).toBe(outcome === "value" ? "old" : "older");
      expect(await cachedFor(key, 60_000, notAgain)).toBe("new");
    }
  });
});


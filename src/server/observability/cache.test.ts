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

  it("a writer's invalidation while a load is in flight wins: the load's value reaches its caller but is not kept", async () => {
    // The order in production: a reader starts loading, a sync writes new rows and invalidates the
    // key, the reader's load (which may have read the rows before the write) settles. Without this
    // the stale value would be cached for a whole TTL after the invalidation.
    let settle!: (value: string) => void;
    const reading = cachedFor("inv", 60_000, () => new Promise<string>((resolve) => (settle = resolve)));
    invalidateCache("inv");
    settle("before the write");
    expect(await reading).toBe("before the write");
    expect(await cachedFor("inv", 60_000, () => Promise.resolve("after the write"))).toBe("after the write");
    // The same for a failed refresh that would otherwise re-extend the old value.
    expect(await cachedFor("lkg2", 1_000, () => Promise.resolve("old"))).toBe("old");
    vi.setSystemTime(new Date(Date.now() + 2_000));
    let fail!: (err: Error) => void;
    const refreshing = cachedFor("lkg2", 1_000, () => new Promise<string>((_, reject) => (fail = reject)));
    invalidateCache("lkg2");
    fail(new Error("down"));
    expect(await refreshing).toBe("old");
    expect(await cachedFor("lkg2", 1_000, () => Promise.resolve("new"))).toBe("new");
  });

  it("a load replaced after the join window does not overwrite the replacement's value when it finally settles", async () => {
    let settleSlow!: (value: string) => void;
    const slow = cachedFor("late", 60_000, () => new Promise<string>((resolve) => (settleSlow = resolve)));
    vi.setSystemTime(new Date(Date.now() + INFLIGHT_JOIN_MS + 1));
    expect(await cachedFor("late", 60_000, () => Promise.resolve("fresh"))).toBe("fresh");
    settleSlow("older");
    expect(await slow).toBe("older");
    expect(await cachedFor("late", 60_000, () => Promise.resolve("unused"))).toBe("fresh");
  });
});

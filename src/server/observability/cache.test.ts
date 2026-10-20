import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cachedFor, INFLIGHT_JOIN_MS, invalidateAllCaches } from "./cache";

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
});


import { describe, expect, it } from "vitest";
import { cachedFor, invalidateCache } from "./cache";

describe("process cache", () => {
  it("serves within the TTL, dedupes concurrent loads and invalidates by prefix", async () => {
    let loads = 0;
    const load = async () => ++loads;
    const [a, b] = await Promise.all([cachedFor("t:x", 1000, load), cachedFor("t:x", 1000, load)]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(await cachedFor("t:x", 1000, load)).toBe(1);
    invalidateCache("t");
    expect(await cachedFor("t:x", 1000, load)).toBe(2);
  });

  it("keeps the last known good value when a refresh fails", async () => {
    let n = 0;
    const key = "t:lkg";
    expect(await cachedFor(key, 1, async () => ++n)).toBe(1);
    await new Promise((r) => setTimeout(r, 5));
    expect(await cachedFor(key, 1000, async () => { throw new Error("db down"); })).toBe(1);
  });
});

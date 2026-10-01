import { beforeEach, describe, expect, it } from "vitest";
import { blockedFor, clearFailures, recordFailure, resetThrottle, throttleKey } from "./throttle";

describe("login throttle", () => {
  beforeEach(() => resetThrottle());
  it("blocks after eight failures inside the window and frees up afterwards", () => {
    const key = throttleKey("Owner@Example.com ", "1.2.3.4");
    const t0 = 1_000_000;
    for (let i = 0; i < 7; i++) recordFailure(key, t0 + i * 1000);
    expect(blockedFor(key, t0 + 8000)).toBe(0);
    recordFailure(key, t0 + 8000);
    expect(blockedFor(key, t0 + 9000)).toBeGreaterThan(0);
    expect(blockedFor(key, t0 + 16 * 60 * 1000)).toBe(0);
    expect(blockedFor(throttleKey("other@example.com", "1.2.3.4"), t0 + 9000)).toBe(0);
  });
  it("clears on success", () => {
    const key = throttleKey("a@b.c", null);
    for (let i = 0; i < 8; i++) recordFailure(key, 5000 + i);
    expect(blockedFor(key, 6000)).toBeGreaterThan(0);
    clearFailures(key);
    expect(blockedFor(key, 6000)).toBe(0);
  });
});

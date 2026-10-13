import { describe, expect, it } from "vitest";
import { describeRateLimits, parseRateLimits, RateLimiter, RateLimiterPool } from "./rate-limiter";

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms), advance: (ms: number) => void (t += ms) };
}

describe("Riot rate limiting", () => {
  it("parses RIOT_RATE_LIMITS and falls back to the development-key limits", () => {
    expect(parseRateLimits(undefined)).toEqual([{ requests: 20, seconds: 1 }, { requests: 100, seconds: 120 }]);
    expect(parseRateLimits("500:10,30000:600")).toEqual([{ requests: 500, seconds: 10 }, { requests: 30000, seconds: 600 }]);
    expect(parseRateLimits("garbage")).toEqual([{ requests: 20, seconds: 1 }, { requests: 100, seconds: 120 }]);
    expect(describeRateLimits(parseRateLimits(undefined))).toBe("20 per 1 s, 100 per 2 min");
  });

  it("waits once a window is full and counts the wait", async () => {
    const c = clock();
    const l = new RateLimiter([{ requests: 2, seconds: 1 }], c.now, c.sleep);
    await l.acquire();
    await l.acquire();
    await l.acquire(); // third request must wait ~1 s
    expect(l.admitted).toBe(3);
    expect(l.waitedMs).toBeGreaterThanOrEqual(1000);
  });

  it("keeps an independent budget per host, so a paused host never blocks the others", async () => {
    const c = clock();
    const pool = new RateLimiterPool([{ requests: 1, seconds: 10 }], c.now, c.sleep);
    await pool.for("sea").acquire();
    pool.for("sea").pause(30);
    const before = c.now();
    await pool.for("europe").acquire();
    await pool.for("americas").acquire();
    expect(c.now()).toBe(before); // no waiting on the other hosts
    await pool.for("sea").acquire();
    expect(c.now()).toBeGreaterThanOrEqual(before + 30_000);
    expect(pool.report().map((r) => r.host)).toEqual(["americas", "europe", "sea"]);
    expect(pool.report().find((r) => r.host === "sea")).toMatchObject({ requests: 2, pauses: 1 });
  });
});

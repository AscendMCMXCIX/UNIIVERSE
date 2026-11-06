import { describe, expect, it } from "vitest";
import { VITALS, VITAL_METRICS, deviceClassOf, formatVitalBound, navigationParts, pageGroupOf, parseVitalsBeacon, summariseVital, vitalBucket } from "./web-vitals";

describe("field performance", () => {
  it("puts a value in the bucket whose bound it does not exceed, and refuses what is not a measurement", () => {
    expect(vitalBucket("LCP", 0)).toBe(0);
    expect(vitalBucket("LCP", 500)).toBe(0);
    expect(vitalBucket("LCP", 501)).toBe(1);
    expect(vitalBucket("LCP", 2500)).toBe(4);
    expect(vitalBucket("LCP", 10_001)).toBe(VITALS.LCP.bounds.length);
    expect(vitalBucket("CLS", 0.1)).toBe(VITALS.CLS.bounds.indexOf(0.1));
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1e9]) expect(vitalBucket("INP", bad)).toBeNull();
  });

  it("has both thresholds of every metric among its bucket bounds, so good and poor shares are exact", () => {
    for (const m of VITAL_METRICS) {
      const { bounds, good, poor } = VITALS[m];
      expect(bounds).toContain(good);
      expect(bounds).toContain(poor);
      expect([...bounds].sort((a, b) => a - b)).toEqual([...bounds]);
    }
  });

  it("keeps only the first part of the address, never an id", () => {
    expect(pageGroupOf("/players/1f3a9c2e-0000-4000-8000-000000000000/matches")).toBe("players");
    expect(pageGroupOf("/team")).toBe("team");
    expect(pageGroupOf("/overview/matches/42")).toBe("overview");
    expect(pageGroupOf("/admin/system")).toBe("admin");
    expect(pageGroupOf("/invite/secret-token")).toBe("other");
    expect(pageGroupOf("/")).toBe("other");
  });

  it("names the device class by the app's breakpoints", () => {
    expect([375, 639, 640, 1023, 1024, 1440].map(deviceClassOf)).toEqual(["phone", "phone", "tablet", "tablet", "desktop", "desktop"]);
  });

  it("states the 75th percentile as a bound the counts prove, with exact good, needs-work and poor shares", () => {
    // LCP buckets: ≤500, ≤1000, ≤1500, ≤2000, ≤2500, ≤3000, ≤3500, ≤4000, …
    const counts = new Array(VITALS.LCP.bounds.length + 1).fill(0);
    counts[1] = 5; // ≤ 1 s
    counts[4] = 3; // ≤ 2.5 s
    counts[6] = 1; // ≤ 3.5 s
    counts[9] = 1; // ≤ 6 s
    const s = summariseVital("LCP", counts)!;
    expect(s.count).toBe(10);
    expect(s.p75AtMost).toBe(2500);
    expect(s.good).toBeCloseTo(0.8);
    expect(s.needsImprovement).toBeCloseTo(0.1);
    expect(s.poor).toBeCloseTo(0.1);
    expect(formatVitalBound("LCP", s.p75AtMost)).toBe("≤ 2.5 s");
    // Three quarters above the last bound: no bound to state.
    const slow = new Array(VITALS.INP.bounds.length + 1).fill(0);
    slow[slow.length - 1] = 3;
    slow[0] = 1;
    expect(summariseVital("INP", slow)!.p75AtMost).toBeNull();
    expect(formatVitalBound("INP", null)).toBe("> 2 s");
    expect(formatVitalBound("CLS", 0.05)).toBe("≤ 0.05");
    expect(formatVitalBound("TTFB", 400)).toBe("≤ 400 ms");
    expect(summariseVital("CLS", [0, 0])).toBeNull();
  });

  it("accepts a well-formed beacon only", () => {
    expect(parseVitalsBeacon({ page: "team", device: "phone", metrics: { LCP: 3, CLS: 0 } })).toEqual({ page: "team", device: "phone", metrics: { LCP: 3, CLS: 0 } });
    for (const bad of [
      null,
      "x",
      { page: "/players/abc", device: "phone", metrics: { LCP: 1 } },
      { page: "team", device: "watch", metrics: { LCP: 1 } },
      { page: "team", device: "phone", metrics: { FID: 1 } },
      { page: "team", device: "phone", metrics: { LCP: 1.5 } },
      { page: "team", device: "phone", metrics: { LCP: VITALS.LCP.bounds.length + 1 } },
      { page: "team", device: "phone", metrics: { LCP: -1 } },
      { page: "team", device: "phone", metrics: {} },
      { page: "team", device: "phone", metrics: [1] },
    ]) {
      expect(parseVitalsBeacon(bad)).toBeNull();
    }
  });
});

describe("TTFB's parts from the navigation entry", () => {
  const entry = (over: Partial<PerformanceNavigationTiming>) => ({ startTime: 0, redirectCount: 0, redirectEnd: 0, requestStart: 0, responseStart: 0, ...over }) as PerformanceNavigationTiming;

  it("reports a same-origin redirect and the request's own time", () => {
    // Opening the app at /: the start page answered and redirected, then /team's request took 240 ms.
    expect(navigationParts(entry({ redirectCount: 1, redirectEnd: 410, requestStart: 460, responseStart: 700 }))).toEqual({ REDIRECT: 410, SERVER: 240 });
  });

  it("sends no redirect for a direct load, or for one the browser hides (cross-origin: redirectEnd is 0)", () => {
    expect(navigationParts(entry({ requestStart: 30, responseStart: 130 }))).toEqual({ SERVER: 100 });
    expect(navigationParts(entry({ redirectCount: 1, redirectEnd: 0, requestStart: 30, responseStart: 130 }))).toEqual({ SERVER: 100 });
  });

  it("sends nothing it cannot measure", () => {
    expect(navigationParts(undefined)).toEqual({});
    expect(navigationParts(entry({}))).toEqual({});
    expect(navigationParts(entry({ requestStart: 500, responseStart: 400 }))).toEqual({});
  });

  it("buckets both like the other metrics, and a beacon carrying them is accepted", () => {
    expect(vitalBucket("REDIRECT", 410)).toBe(VITALS.REDIRECT.bounds.indexOf(600));
    expect(vitalBucket("SERVER", 240)).toBe(VITALS.SERVER.bounds.indexOf(300));
    expect(parseVitalsBeacon({ page: "team", device: "phone", metrics: { TTFB: 5, REDIRECT: 5, SERVER: 2 } })).toEqual({ page: "team", device: "phone", metrics: { TTFB: 5, REDIRECT: 5, SERVER: 2 } });
  });
});

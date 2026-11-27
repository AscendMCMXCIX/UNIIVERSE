import { describe, expect, it } from "vitest";
import { hash32, inclusionProbability, observationWeight, pickWeighted, sampleBySeed, windowFor, WINDOW_FIRST_MS, WINDOW_LAG_MS, WINDOW_MAX_MS } from "./sample";

/** A small seeded generator (mulberry32), so the simulations are the same on every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("inclusionProbability", () => {
  it("is 1 − C(N−m, k) / C(N, k)", () => {
    expect(inclusionProbability(10, 1, 1)).toBeCloseTo(0.1, 12);
    expect(inclusionProbability(10, 2, 1)).toBeCloseTo(0.2, 12);
    // 1 − C(8,2)/C(10,2) = 1 − 28/45
    expect(inclusionProbability(10, 2, 2)).toBeCloseTo(1 - 28 / 45, 12);
    expect(inclusionProbability(5, 1, 5)).toBe(1);
    expect(inclusionProbability(5, 4, 2)).toBe(1);
  });

  it("is 0 when nothing could be found", () => {
    expect(inclusionProbability(0, 1, 1)).toBe(0);
    expect(inclusionProbability(10, 0, 3)).toBe(0);
    expect(inclusionProbability(10, 2, 0)).toBe(0);
  });

  it("matches a simulation of drawing players without replacement", () => {
    const random = rng(7);
    const N = 50;
    const m = 3;
    const k = 6;
    let hits = 0;
    const runs = 40_000;
    for (let r = 0; r < runs; r += 1) {
      // Fisher–Yates: the first k of a uniform shuffle are a uniform draw without replacement.
      const players = Array.from({ length: N }, (_, i) => i);
      for (let i = N - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [players[i], players[j]] = [players[j]!, players[i]!];
      }
      if (players.slice(0, k).some((p) => p < m)) hits += 1;
    }
    expect(hits / runs).toBeCloseTo(inclusionProbability(N, m, k), 2);
  });
});

describe("observationWeight", () => {
  it("divides by being found, being fetched and the window's coverage", () => {
    const base = { population: 100, inGame: 1, sampled: 10, found: 8, fetched: 8, coverage: 1 };
    expect(observationWeight(base)).toBeCloseTo(10, 9);
    expect(observationWeight({ ...base, fetched: 4 })).toBeCloseTo(20, 9);
    expect(observationWeight({ ...base, coverage: 0.5 })).toBeCloseTo(20, 9);
    expect(observationWeight({ ...base, inGame: 0 })).toBe(0);
    expect(observationWeight({ ...base, found: 0 })).toBe(0);
  });
});

describe("windowFor", () => {
  const now = Date.UTC(2026, 10, 23, 12);
  const end = now - WINDOW_LAG_MS;

  it("reads from the cursor to an hour ago, covering all of it", () => {
    expect(windowFor(end - 2 * 3_600_000, now)).toEqual({ start: end - 2 * 3_600_000, end, coverage: 1 });
  });

  it("starts a server's first window three hours before its end", () => {
    expect(windowFor(null, now)).toEqual({ start: end - WINDOW_FIRST_MS, end, coverage: 1 });
  });

  it("reads at most a day, and says what share of a longer gap it covers", () => {
    const w = windowFor(end - 4 * WINDOW_MAX_MS, now)!;
    expect(w.end - w.start).toBe(WINDOW_MAX_MS);
    expect(w.coverage).toBeCloseTo(0.25, 12);
  });

  it("has nothing to read when the cursor is at or after an hour ago", () => {
    expect(windowFor(end, now)).toBeNull();
    expect(windowFor(end + 1, now)).toBeNull();
  });
});

describe("sampleBySeed and pickWeighted", () => {
  it("draws k distinct items, the same for the same seed and different for another", () => {
    const items = Array.from({ length: 200 }, (_, i) => `p${i}`);
    const a = sampleBySeed(items, 6, "slice-1", (x) => x);
    expect(new Set(a).size).toBe(6);
    expect(sampleBySeed(items, 6, "slice-1", (x) => x)).toEqual(a);
    expect(sampleBySeed(items, 6, "slice-2", (x) => x)).not.toEqual(a);
    expect(sampleBySeed(items, 500, "s", (x) => x)).toHaveLength(200);
    expect(sampleBySeed(items, 0, "s", (x) => x)).toEqual([]);
  });

  it("gives every item about the same chance (a uniform sample)", () => {
    const items = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const seen = new Map<string, number>();
    for (let s = 0; s < 4_000; s += 1) for (const x of sampleBySeed(items, 2, `seed-${s}`, (v) => v)) seen.set(x, (seen.get(x) ?? 0) + 1);
    for (const x of items) expect((seen.get(x) ?? 0) / 4_000).toBeCloseTo(0.1, 1);
  });

  it("picks in proportion to weight, a server never read counting as an average one", () => {
    const items = [
      { item: "big", weight: 300 },
      { item: "small", weight: 100 },
      { item: "unknown", weight: null },
    ];
    // The unknown one counts as 200 of a total 600.
    expect(pickWeighted(items, 0)).toBe("big");
    expect(pickWeighted(items, 0.49)).toBe("big");
    expect(pickWeighted(items, 0.51)).toBe("small");
    expect(pickWeighted(items, 0.7)).toBe("unknown");
    expect(pickWeighted(items, 0.999)).toBe("unknown");
    expect(pickWeighted([], 0.5)).toBeNull();
  });

  it("hashes uniformly into 32 bits", () => {
    const buckets = new Array(16).fill(0);
    for (let i = 0; i < 16_000; i += 1) buckets[hash32(`x${i}`) % 16] += 1;
    for (const b of buckets) expect(b / 1_000).toBeCloseTo(1, 0);
  });
});

/**
 * The design's claim, simulated: two regions of very different sizes, where a champion is picked in
 * 30% of the big region's Master+ games and 10% of the small one's, sampled the same way in each.
 * The unweighted share of the games observed leans to the region sampled more per player; the
 * weighted share (one over each game's probability of being observed) recovers the population's
 * share, (0.3 × 2000 + 0.1 × 200) / 2200 ≈ 28.2%.
 */
describe("the weights remove regional bias", () => {
  it("recovers the population's share where the unweighted share does not", () => {
    const random = rng(42);
    const regions = [
      { players: 2_000, pick: 0.3 },
      { players: 200, pick: 0.1 },
    ];
    const truth = (2_000 * 0.3 + 200 * 0.1) / 2_200;
    let w = 0;
    let wPick = 0;
    let n = 0;
    let nPick = 0;
    for (let slice = 0; slice < 6_000; slice += 1) {
      const region = regions[slice % 2]!;
      const k = 6;
      // Each sampled player plays one game in the window, alone among Master+ players in it (m = 1).
      for (let s = 0; s < k; s += 1) {
        const picked = random() < region.pick;
        const weight = observationWeight({ population: region.players, inGame: 1, sampled: k, found: k, fetched: k, coverage: 1 });
        w += weight;
        n += 1;
        if (picked) {
          wPick += weight;
          nPick += 1;
        }
      }
    }
    expect(nPick / n).toBeCloseTo(0.2, 1);
    expect(Math.abs(wPick / w - truth)).toBeLessThan(0.01);
  });
});

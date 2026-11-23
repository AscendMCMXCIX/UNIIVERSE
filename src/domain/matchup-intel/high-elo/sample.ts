/*
  MATCHUP INTEL's high-elo sampling (docs/HIGH_ELO_EVIDENCE.md, "How games are chosen"): which
  server a slice reads, which of its Master+ players, which window of time, and the weight each
  observed game carries so the sums estimate every Master+ player's games without regional bias
  (Horvitz–Thompson: one over the probability that the slice included it). Pure: the job passes
  the slice's random seed, the clock and the counts it read.
*/

/** One hour: a game is read only once it is at least this old, so its record is complete. */
export const WINDOW_LAG_MS = 60 * 60_000;
/** The longest window one visit reads; a longer gap is covered by its last part, and the weights scale for the rest. */
export const WINDOW_MAX_MS = 24 * 60 * 60_000;
/** A server's first window, before it has a cursor. */
export const WINDOW_FIRST_MS = 3 * 60 * 60_000;

/**
 * 32-bit FNV-1a, then a final avalanche (murmur3's fmix32): a uniform hash of a string, so players
 * and games are ordered at random by a slice's seed. Not a secret, and nothing it hashes is kept.
 */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** The first `k` items in the slice's random order (a keyed hash of each item with the seed): a uniform sample without replacement. */
export function sampleBySeed<T>(items: readonly T[], k: number, seed: string, key: (item: T) => string): T[] {
  if (k <= 0) return [];
  return [...items]
    .map((item) => ({ item, h: hash32(`${seed}|${key(item)}`) }))
    .sort((a, b) => a.h - b.h || (key(a.item) < key(b.item) ? -1 : 1))
    .slice(0, k)
    .map((x) => x.item);
}

/**
 * One item chosen with probability in proportion to its weight, by `u` in [0, 1). An item with no
 * known weight counts as the average of the known ones (a server never read is visited as an
 * average one until it is read); with no known weight at all, every item counts the same.
 */
export function pickWeighted<T>(items: ReadonlyArray<{ item: T; weight: number | null }>, u: number): T | null {
  if (!items.length) return null;
  const known = items.map((i) => i.weight).filter((w): w is number => w !== null && Number.isFinite(w) && w >= 0);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const weights = items.map((i) => (i.weight !== null && Number.isFinite(i.weight) && i.weight >= 0 ? i.weight : fallback));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return items[Math.min(items.length - 1, Math.floor(u * items.length))]!.item;
  let at = Math.min(Math.max(u, 0), 1 - Number.EPSILON) * total;
  for (let i = 0; i < items.length; i += 1) {
    at -= weights[i]!;
    if (at < 0) return items[i]!.item;
  }
  return items[items.length - 1]!.item;
}

/**
 * The window a visit reads: from the server's cursor (the end of its last window) to an hour ago,
 * at most WINDOW_MAX_MS long. `coverage` is the share of the time since the cursor it covers (1 when
 * it covers all of it), which the weights divide by. Null when there is nothing new to read.
 */
export function windowFor(cursorEnd: number | null, now: number): { start: number; end: number; coverage: number } | null {
  const end = now - WINDOW_LAG_MS;
  const from = cursorEnd ?? end - WINDOW_FIRST_MS;
  if (end <= from) return null;
  const start = Math.max(from, end - WINDOW_MAX_MS);
  return { start, end, coverage: (end - start) / (end - from) };
}

/**
 * The probability that a game is found when `sampled` of a server's `population` Master+ players
 * are drawn without replacement and the game has `inGame` of them: 1 − C(N−m, k) / C(N, k).
 */
export function inclusionProbability(population: number, inGame: number, sampled: number): number {
  const N = Math.floor(population);
  const m = Math.floor(inGame);
  const k = Math.floor(sampled);
  if (!(N > 0) || !(m > 0) || !(k > 0)) return 0;
  if (k >= N || N - m < k) return 1;
  // C(N−m, k) / C(N, k) = Π_{i<k} (N−m−i) / (N−i)
  let missed = 1;
  for (let i = 0; i < k; i += 1) missed *= (N - m - i) / (N - i);
  return 1 - missed;
}

/**
 * An observation's weight: one over the probability that the slice included it. A game is found
 * (inclusionProbability), then fetched when `fetched` of the `found` games are (chosen uniformly),
 * in a window covering `coverage` of the time since the server's last one. 0 when it could not
 * have been included (nothing to weigh), never infinite.
 */
export function observationWeight(input: { population: number; inGame: number; sampled: number; found: number; fetched: number; coverage: number }): number {
  const found = inclusionProbability(input.population, input.inGame, input.sampled);
  const kept = input.found > 0 ? Math.min(1, Math.max(0, input.fetched) / input.found) : 0;
  const coverage = Math.min(1, Math.max(0, input.coverage));
  const p = found * kept * coverage;
  return p > 0 ? 1 / p : 0;
}

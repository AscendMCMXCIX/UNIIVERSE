/**
 * Sliding-window rate limiting for Riot's application limits.
 *
 * Riot counts application limits per routing host: every platform host (oc1, euw1, kr…) and every
 * regional host (americas, europe, asia, sea) has its own 20 requests / 1 s and 100 requests /
 * 2 min budget on a development or personal key. UNIIVERSE therefore keeps one limiter per host
 * (`RateLimiterPool`), so ingesting four regions in parallel really is four times the throughput,
 * and a 429 on one host pauses only that host. Limits are configurable with
 * RIOT_RATE_LIMITS="20:1,100:120" (per host). Without that variable the limits Riot reports on
 * every response (X-App-Rate-Limit) are adopted automatically, so a production key's higher
 * limits are used without any configuration.
 */
export interface WindowLimit {
  requests: number;
  seconds: number;
}

export const DEFAULT_RATE_LIMITS: WindowLimit[] = [{ requests: 20, seconds: 1 }, { requests: 100, seconds: 120 }];

export function parseRateLimits(spec: string | undefined, fallback: WindowLimit[] = DEFAULT_RATE_LIMITS): WindowLimit[] {
  if (!spec) return fallback;
  const out: WindowLimit[] = [];
  for (const part of spec.split(",")) {
    const [r, s] = part.split(":").map((x) => Number(x.trim()));
    if (r && s) out.push({ requests: r, seconds: s });
  }
  return out.length ? out : fallback;
}

/** Same windows and counts, in any order. */
export function sameLimits(a: WindowLimit[], b: WindowLimit[]): boolean {
  const key = (l: WindowLimit[]) => l.map((x) => `${x.requests}:${x.seconds}`).sort().join(",");
  return key(a) === key(b);
}

export function describeRateLimits(limits: WindowLimit[]): string {
  return limits.map((l) => `${l.requests} per ${l.seconds >= 60 ? `${Math.round(l.seconds / 60)} min` : `${l.seconds} s`}`).join(", ");
}

export interface Limiter {
  /** `share` (0..1] caps how much of each window this caller may fill (background work uses 0.8). */
  acquire(share?: number): Promise<void>;
  /** Takes a slot only if one is free now (within `share`); never waits. */
  tryAcquire?(share?: number): boolean;
  pause(seconds: number): void;
}

export class RateLimiter implements Limiter {
  private history: number[][];
  private pausedUntil = 0;
  /** Requests admitted since construction. */
  public admitted = 0;
  /** Milliseconds spent waiting for a free slot. */
  public waitedMs = 0;
  public pauses = 0;

  constructor(
    private limits: WindowLimit[],
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.history = limits.map(() => []);
  }

  /** Switches to new window limits, keeping the requests already sent so no window is overrun. */
  setLimits(limits: WindowLimit[]): void {
    const sent = [...(this.history.reduce((longest, h) => (h.length > longest.length ? h : longest), [] as number[]))];
    this.limits = limits;
    const t = this.now();
    this.history = limits.map((l) => sent.filter((ts) => ts > t - l.seconds * 1000));
  }

  /**
   * Waits until a request may be sent, then records it. With `share` < 1 the caller waits as soon
   * as the window is that full, so callers at full share always find headroom.
   */
  async acquire(share = 1): Promise<void> {
    for (;;) {
      const waitMs = this.waitFor(share);
      if (waitMs <= 0) return this.admit();
      this.waitedMs += waitMs;
      await this.sleep(waitMs);
    }
  }

  /**
   * Takes a slot only when one is free at once within `share`: for requests a person is waiting
   * on that are better skipped than delayed (a match window's rank checks).
   */
  tryAcquire(share = 1): boolean {
    if (this.waitFor(share) > 0) return false;
    this.admit();
    return true;
  }

  /** How long until a request within `share` may be sent (0: now). */
  private waitFor(share: number): number {
    const t = this.now();
    let waitMs = Math.max(0, this.pausedUntil - t);
    this.limits.forEach((limit, i) => {
      const windowMs = limit.seconds * 1000;
      const h = this.history[i]!;
      while (h.length && h[0]! <= t - windowMs) h.shift();
      const allowed = Math.max(1, Math.floor(limit.requests * Math.min(1, share)));
      // Waits until enough old requests leave the window to get back under this caller's share.
      if (h.length >= allowed) waitMs = Math.max(waitMs, h[h.length - allowed]! + windowMs - t + 5);
    });
    return waitMs;
  }

  private admit(): void {
    const t = this.now();
    for (const h of this.history) h.push(t);
    this.admitted += 1;
  }

  /** Honour a 429: pause all requests on this host for the given number of seconds. */
  pause(seconds: number): void {
    this.pauses += 1;
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + seconds * 1000);
  }

  get pending(): number {
    return this.history[0]?.length ?? 0;
  }
}

/** One limiter per Riot host, created on first use with the same window limits. */
export class RateLimiterPool {
  private readonly limiters = new Map<string, RateLimiter>();
  /** True once limits reported by Riot replaced the starting ones. */
  public adopted = false;

  constructor(
    private limits: WindowLimit[],
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  for(host: string): RateLimiter {
    const key = host.toLowerCase();
    let l = this.limiters.get(key);
    if (!l) {
      l = new RateLimiter(this.limits, this.now, this.sleep);
      this.limiters.set(key, l);
    }
    return l;
  }

  /** Adopts the limits Riot reports for this key (every host shares the same application limits). */
  adopt(limits: WindowLimit[]): boolean {
    if (limits.length === 0 || sameLimits(limits, this.limits)) return false;
    this.limits = limits;
    this.adopted = true;
    for (const l of this.limiters.values()) l.setLimits(limits);
    return true;
  }

  /** Per-host usage, for job summaries and the Data health view. */
  report(): Array<{ host: string; requests: number; waitedMs: number; pauses: number }> {
    return [...this.limiters.entries()].map(([host, l]) => ({ host, requests: l.admitted, waitedMs: Math.round(l.waitedMs), pauses: l.pauses })).sort((a, b) => a.host.localeCompare(b.host));
  }

  get configured(): WindowLimit[] {
    return this.limits;
  }
}

declare global {
  var __uniiverseRiotLimiters: RateLimiterPool | undefined;
}

/**
 * The one limiter pool of this server process. Every Riot client in the process (account sync,
 * ranked collection, linking an account) counts against it, as Riot counts the key: separate
 * pools each believed they had the whole window, overran it together and drew 429 penalties
 * (production, 2026-10-14: collection stalled behind an account sync).
 */
export function processRiotLimiters(): RateLimiterPool {
  globalThis.__uniiverseRiotLimiters ??= new RateLimiterPool(parseRateLimits(process.env.RIOT_RATE_LIMITS));
  return globalThis.__uniiverseRiotLimiters;
}

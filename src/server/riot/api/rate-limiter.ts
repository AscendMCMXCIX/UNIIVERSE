/**
 * Sliding-window rate limiting for Riot's application limits.
 *
 * Riot counts application limits per routing host: every platform host (oc1, euw1, kr…) and every
 * regional host (americas, europe, asia, sea) has its own 20 requests / 1 s and 100 requests /
 * 2 min budget on a development or personal key. UNIIVERSE therefore keeps one limiter per host
 * (`RateLimiterPool`), so ingesting four regions in parallel really is four times the throughput,
 * and a 429 on one host pauses only that host. Limits are configurable with
 * RIOT_RATE_LIMITS="20:1,100:120" (per host). Production keys with higher limits set that value.
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

export function describeRateLimits(limits: WindowLimit[]): string {
  return limits.map((l) => `${l.requests} per ${l.seconds >= 60 ? `${Math.round(l.seconds / 60)} min` : `${l.seconds} s`}`).join(", ");
}

export interface Limiter {
  acquire(): Promise<void>;
  pause(seconds: number): void;
}

export class RateLimiter implements Limiter {
  private readonly history: number[][];
  private pausedUntil = 0;
  /** Requests admitted since construction. */
  public admitted = 0;
  /** Milliseconds spent waiting for a free slot. */
  public waitedMs = 0;
  public pauses = 0;

  constructor(
    private readonly limits: WindowLimit[],
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.history = limits.map(() => []);
  }

  /** Waits until a request may be sent, then records it. */
  async acquire(): Promise<void> {
    for (;;) {
      const t = this.now();
      let waitMs = Math.max(0, this.pausedUntil - t);
      this.limits.forEach((limit, i) => {
        const windowMs = limit.seconds * 1000;
        const h = this.history[i]!;
        while (h.length && h[0]! <= t - windowMs) h.shift();
        if (h.length >= limit.requests) waitMs = Math.max(waitMs, h[0]! + windowMs - t + 5);
      });
      if (waitMs <= 0) {
        for (const h of this.history) h.push(t);
        this.admitted += 1;
        return;
      }
      this.waitedMs += waitMs;
      await this.sleep(waitMs);
    }
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

  constructor(
    private readonly limits: WindowLimit[],
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

  /** Per-host usage, for job summaries and the Data health view. */
  report(): Array<{ host: string; requests: number; waitedMs: number; pauses: number }> {
    return [...this.limiters.entries()].map(([host, l]) => ({ host, requests: l.admitted, waitedMs: Math.round(l.waitedMs), pauses: l.pauses })).sort((a, b) => a.host.localeCompare(b.host));
  }

  get configured(): WindowLimit[] {
    return this.limits;
  }
}

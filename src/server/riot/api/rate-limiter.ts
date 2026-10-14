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
  acquire(): Promise<void>;
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
  /** True once limits reported by Riot replaced the starting ones. */
  public adopted = false;

  constructor(
    private limits: WindowLimit[],
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    /**
     * Fraction of every window this pool may use (0..1]. Background collection runs at 0.8 so
     * requests made for people (linking an account, scouting an enemy) keep headroom on the
     * same key: Riot counts the key's limits across every client and instance.
     */
    private readonly share: number = 1,
  ) {}

  private scaled(limits: WindowLimit[]): WindowLimit[] {
    if (this.share >= 1) return limits;
    return limits.map((l) => ({ ...l, requests: Math.max(1, Math.floor(l.requests * this.share)) }));
  }

  for(host: string): RateLimiter {
    const key = host.toLowerCase();
    let l = this.limiters.get(key);
    if (!l) {
      l = new RateLimiter(this.scaled(this.limits), this.now, this.sleep);
      this.limiters.set(key, l);
    }
    return l;
  }

  /** Adopts the limits Riot reports for this key (every host shares the same application limits). */
  adopt(limits: WindowLimit[]): boolean {
    if (limits.length === 0 || sameLimits(limits, this.limits)) return false;
    this.limits = limits;
    this.adopted = true;
    for (const l of this.limiters.values()) l.setLimits(this.scaled(limits));
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

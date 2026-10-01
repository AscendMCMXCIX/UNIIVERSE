/**
 * Sliding-window rate limiter for Riot's application limits.
 *
 * Development keys allow 20 requests / 1s and 100 requests / 2min; personal/production keys are
 * higher. Limits are configurable (RIOT_RATE_LIMITS="20:1,100:120"). The limiter also honours
 * server-side 429 responses by pausing until Retry-After elapses.
 */
export interface WindowLimit {
  requests: number;
  seconds: number;
}

export function parseRateLimits(spec: string | undefined, fallback: WindowLimit[] = [{ requests: 20, seconds: 1 }, { requests: 100, seconds: 120 }]): WindowLimit[] {
  if (!spec) return fallback;
  const out: WindowLimit[] = [];
  for (const part of spec.split(",")) {
    const [r, s] = part.split(":").map((x) => Number(x.trim()));
    if (r && s) out.push({ requests: r, seconds: s });
  }
  return out.length ? out : fallback;
}

export class RateLimiter {
  private readonly history: number[][];
  private pausedUntil = 0;

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
        return;
      }
      await this.sleep(waitMs);
    }
  }

  /** Honour a 429: pause all requests for the given number of seconds. */
  pause(seconds: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, this.now() + seconds * 1000);
  }

  get pending(): number {
    return this.history[0]?.length ?? 0;
  }
}

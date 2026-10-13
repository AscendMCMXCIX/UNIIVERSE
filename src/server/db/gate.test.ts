import { describe, expect, it } from "vitest";
import { gateConcurrency } from "./gate";

/** A fake postgres-js client: records how many queries are in flight at once. */
function fakeClient(delayMs = 5) {
  let inFlight = 0;
  let peak = 0;
  // counted = this query occupies a pool connection; a transaction's own queries run on the
  // connection the transaction already reserved, so they are not counted again.
  const pending = (label: string, counted = true) => {
    const start = () => {
      if (counted) {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
      }
      return new Promise<string>((resolve) =>
        setTimeout(() => {
          if (counted) inFlight -= 1;
          resolve(label);
        }, delayMs),
      );
    };
    let p: Promise<string> | null = null;
    const once = () => (p ??= start());
    return {
      then: (f?: (v: string) => unknown, r?: (e: unknown) => unknown) =>
        once().then(f, r),
      values: () => once().then((v) => [[v]]),
    };
  };
  const client = {
    unsafe: (query: string) => pending(query),
    begin: async (
      fn: (tx: {
        unsafe: (q: string) => ReturnType<typeof pending>;
      }) => Promise<unknown>,
    ) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        return await fn({ unsafe: (q: string) => pending(q, false) });
      } finally {
        inFlight -= 1;
      }
    },
    end: async () => "ended",
    options: { max: 3 },
    stats: () => ({ inFlight, peak }),
  };
  return client;
}

describe("gateConcurrency", () => {
  it("never lets more queries run at once than the limit, and keeps result shapes", async () => {
    const raw = fakeClient();
    const client = gateConcurrency(raw, 2);
    const results = await Promise.all([
      client.unsafe("a"),
      client.unsafe("b"),
      client.unsafe("c").values(),
      client.unsafe("d"),
      client.unsafe("e"),
    ]);
    expect(results).toEqual(["a", "b", [["c"]], "d", "e"]);
    expect(raw.stats().peak).toBe(2);
    expect(client.gate()).toEqual({ active: 0, waiting: 0, limit: 2 });
  });

  it("counts a transaction as one slot for its whole duration", async () => {
    const raw = fakeClient();
    const client = gateConcurrency(raw, 2);
    const tx = client.begin(async (t) => {
      const first = await t.unsafe("in-tx-1");
      const second = await t.unsafe("in-tx-2");
      return [first, second];
    });
    const others = Promise.all([
      client.unsafe("x"),
      client.unsafe("y"),
      client.unsafe("z"),
    ]);
    expect(await tx).toEqual(["in-tx-1", "in-tx-2"]);
    expect(await others).toEqual(["x", "y", "z"]);
    // The transaction's own queries run on its reserved connection and are not counted twice:
    // the peak is the transaction plus one gated query, never more than the limit.
    expect(raw.stats().peak).toBeLessThanOrEqual(2);
  });

  it("passes everything else through to the client", async () => {
    const client = gateConcurrency(fakeClient(), 1);
    expect(await client.end()).toBe("ended");
    expect(client.options.max).toBe(3);
  });

  it("releases the slot when a query fails", async () => {
    const failing = {
      unsafe: (_q: string) => ({
        then: (_f?: unknown, r?: (e: unknown) => unknown) =>
          Promise.reject(new Error("boom")).then(undefined, r),
      }),
      begin: async () => null,
    };
    const client = gateConcurrency(failing, 1);
    await expect(client.unsafe("q")).rejects.toThrow("boom");
    expect(client.gate().active).toBe(0);
  });
});

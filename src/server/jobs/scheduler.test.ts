import { describe, expect, it } from "vitest";
import { TICK_JOB_ORDER, tickJobBudget } from "./scheduler";

describe("scheduler tick budget", () => {
  it("runs the team's account sync before global collection and aggregation after it", () => {
    const order = [...TICK_JOB_ORDER];
    expect(order.indexOf("account-sync")).toBeLessThan(order.indexOf("ranked-discover"));
    expect(order.indexOf("aggregate")).toBeGreaterThan(order.indexOf("ranked-ingest"));
  });

  it("caps global ingestion so aggregation and integrity keep a reserve", () => {
    // A fresh 240 s tick after version-check and account sync used 100 s.
    expect(tickJobBudget("account-sync", 238_000)).toBe(75_000);
    expect(tickJobBudget("ranked-discover", 140_000)).toBe(40_000);
    expect(tickJobBudget("ranked-ingest", 100_000)).toBe(50_000);
    // Whatever ingestion leaves is enough for aggregation.
    expect(tickJobBudget("aggregate", 50_000)).toBe(48_000);
    expect(tickJobBudget("ranked-ingest", 40_000)).toBeLessThan(5_000);
  });
});

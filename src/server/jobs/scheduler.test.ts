import { describe, expect, it } from "vitest";
import { TICK_JOB_ORDER, tickJobBudget } from "./scheduler";

describe("scheduler tick budget", () => {
  it("runs the team's account sync first, aggregation before global ingestion, ingestion last", () => {
    const order = [...TICK_JOB_ORDER];
    expect(order.indexOf("account-sync")).toBeLessThan(order.indexOf("ranked-discover"));
    expect(order.indexOf("aggregate")).toBeLessThan(order.indexOf("ranked-ingest"));
    expect(order.indexOf("integrity")).toBeLessThan(order.indexOf("ranked-ingest"));
    expect(order.at(-1)).toBe("ranked-ingest");
  });

  it("caps every job before ingestion so ingestion always gets time, with an overrun margin", () => {
    // A fresh 240 s tick.
    expect(tickJobBudget("account-sync", 238_000)).toBe(75_000);
    expect(tickJobBudget("ranked-discover", 160_000)).toBe(40_000);
    expect(tickJobBudget("aggregate", 120_000)).toBe(60_000);
    expect(tickJobBudget("integrity", 60_000)).toBe(20_000);
    // Worst case after the capped jobs (75 + 40 + 40 + 60 + 20 = 235 s) leaves nothing; typical
    // ticks (most jobs not due or quick) leave ingestion most of the tick minus the margin.
    expect(tickJobBudget("ranked-ingest", 200_000)).toBe(170_000);
    expect(tickJobBudget("ranked-ingest", 30_000)).toBeLessThan(5_000);
  });
});

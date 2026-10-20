import { describe, expect, it } from "vitest";
import { TICK_JOB_ORDER, tickJobBudget } from "./scheduler";

describe("scheduler tick budget", () => {
  it("runs static data first, then the team's account sync, with the two backfills last", () => {
    expect([...TICK_JOB_ORDER]).toEqual(["version-check", "account-sync", "integrity", "timeline-backfill", "figures-backfill"]);
  });

  it("caps each job so one job cannot take the whole tick", () => {
    // A fresh 240 s tick.
    expect(tickJobBudget("account-sync", 238_000)).toBe(75_000);
    expect(tickJobBudget("integrity", 60_000)).toBe(20_000);
    // Matchups' timeline backfill shares Riot's limits: a small slice.
    expect(tickJobBudget("timeline-backfill", 120_000)).toBe(25_000);
    expect(tickJobBudget("figures-backfill", 120_000)).toBe(25_000);
    // Uncapped jobs still stop short of the tick's end.
    expect(tickJobBudget("version-check", 30_000)).toBe(28_000);
  });
});

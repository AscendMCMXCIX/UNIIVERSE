import { describe, expect, it } from "vitest";
import { answerHealthQuestions, type HealthFacts } from "./data-health";

const now = new Date("2026-10-14T12:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
const base: HealthFacts = {
  now,
  riot: { configured: true, state: "accepted", lastOkAt: h(0.2), lastError: null },
  accounts: { total: 6, synced: 6, syncing: 0, pending: 0, delayed: 0, failed: 0 },
  statistics: { totalGames: 5000, isDemo: false, lastAggregateAt: h(1), waitingToAggregate: 20 },
  global: { configuredRegions: 17, regionsWithCurrentData: 17, regionsWithErrors: 0, lastIngestAt: h(1), currentPatchGames: 9000 },
  pro: { games: 240, lastSyncAt: h(5), disabled: false },
  failingJobs: [],
};
const labels = (f: HealthFacts) => Object.fromEntries(answerHealthQuestions(f).map((a) => [a.key, a.label]));

describe("data health answers", () => {
  it("says Healthy only when the data itself is there", () => {
    expect(labels(base)).toEqual({ riot: "Healthy", accounts: "Healthy", statistics: "Healthy", global: "Healthy", pro: "Healthy", attention: "Healthy" });
  });

  it("never calls a region set healthy when some regions have no games", () => {
    expect(labels({ ...base, global: { ...base.global, regionsWithCurrentData: 7 } }).global).toBe("Updating");
  });

  it("flags stale aggregation even when collection works (the production failure of 2026-10-14)", () => {
    const a = answerHealthQuestions({ ...base, statistics: { ...base.statistics, lastAggregateAt: h(11.5 + 1), waitingToAggregate: 1200 } }).find((x) => x.key === "statistics")!;
    expect(a.label).toBe("Delayed");
    expect(a.detail).toMatch(/1,200 collected games/);
  });

  it("asks for a person only when a person can fix it", () => {
    expect(labels({ ...base, riot: { ...base.riot, state: "rejected" } })).toMatchObject({ riot: "Needs attention", attention: "Needs attention" });
    expect(labels({ ...base, accounts: { ...base.accounts, synced: 3, syncing: 3 } })).toMatchObject({ accounts: "Updating", attention: "Healthy" });
    expect(labels({ ...base, accounts: { ...base.accounts, synced: 5, failed: 1 } })).toMatchObject({ accounts: "Needs attention", attention: "Needs attention" });
    expect(labels({ ...base, riot: { configured: false, state: "unknown", lastOkAt: null, lastError: null } })).toMatchObject({ riot: "Unavailable", global: "Unavailable" });
  });

  it("answers whether professional data is available from the games actually imported", () => {
    expect(labels({ ...base, pro: { games: 0, lastSyncAt: null, disabled: false } }).pro).toBe("Unavailable");
    expect(labels({ ...base, pro: { games: 0, lastSyncAt: h(2), disabled: false } }).pro).toBe("Updating");
    expect(labels({ ...base, pro: { games: 120, lastSyncAt: h(24 * 5), disabled: false } }).pro).toBe("Delayed");
    expect(labels({ ...base, pro: { games: 120, lastSyncAt: h(2), disabled: true } }).pro).toBe("Unavailable");
  });
});

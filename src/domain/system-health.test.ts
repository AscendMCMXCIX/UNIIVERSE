import { describe, expect, it } from "vitest";
import { systemStatus, type SystemFacts } from "./system-health";

const now = new Date("2026-10-14T12:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
const base: SystemFacts = {
  now,
  website: { commit: "0f6525085d2e", region: "iad1", authMode: "accounts" },
  database: { mode: "postgres", pingMs: 12 },
  answers: [
    { key: "riot", question: "", label: "Healthy", detail: "Riot accepts the key." },
    { key: "accounts", question: "", label: "Updating", detail: "2 still collecting." },
  ],
  jobs: { lastRunAt: h(1), failing: [], everRan: true },
};
const labels = (f: SystemFacts) => Object.fromEntries(systemStatus(f).map((i) => [i.key, i.label]));

describe("system health", () => {
  it("shows five plain statuses, healthy only with evidence", () => {
    expect(labels(base)).toEqual({ website: "Healthy", database: "Healthy", riot: "Healthy", accounts: "Updating", jobs: "Healthy" });
    expect(systemStatus(base).find((i) => i.key === "database")!.detail).toMatch(/12 ms/);
  });

  it("flags open sign-in, a temporary database and a failed query", () => {
    expect(labels({ ...base, website: { ...base.website, authMode: "open" } }).website).toBe("Needs attention");
    expect(labels({ ...base, database: { mode: "pglite-memory", pingMs: 1 } }).database).toBe("Needs attention");
    expect(labels({ ...base, database: { mode: "postgres", pingMs: null } }).database).toBe("Needs attention");
    expect(labels({ ...base, database: { mode: "postgres", pingMs: 2400 } }).database).toBe("Delayed");
  });

  it("judges background jobs by their last run and repeated failures", () => {
    expect(labels({ ...base, jobs: { lastRunAt: null, failing: [], everRan: false } }).jobs).toBe("Unavailable");
    expect(labels({ ...base, jobs: { lastRunAt: h(20), failing: [], everRan: true } }).jobs).toBe("Delayed");
    expect(labels({ ...base, jobs: { lastRunAt: h(1), failing: ["account-sync"], everRan: true } }).jobs).toBe("Needs attention");
  });

  it("does not invent Riot or syncing health when nothing is known", () => {
    expect(labels({ ...base, answers: [] })).toMatchObject({ riot: "Unavailable", accounts: "Unavailable" });
  });
});

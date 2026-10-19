import { describe, expect, it } from "vitest";
import { answerHealthQuestions, type HealthFacts } from "./data-health";

const now = new Date("2026-10-14T12:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3_600_000);
const base: HealthFacts = {
  now,
  riot: { configured: true, state: "accepted", lastOkAt: h(0.2), lastError: null },
  accounts: { total: 6, synced: 6, syncing: 0, pending: 0, delayed: 0, failed: 0 },
  failingJobs: [],
};
const labels = (f: HealthFacts) => Object.fromEntries(answerHealthQuestions(f).map((a) => [a.key, a.label]));

describe("data health answers", () => {
  it("says Healthy only when the data itself is there", () => {
    expect(labels(base)).toEqual({ riot: "Healthy", accounts: "Healthy", attention: "Healthy" });
  });

  it("asks for a person only when a person can fix it", () => {
    expect(labels({ ...base, riot: { ...base.riot, state: "rejected" } })).toMatchObject({ riot: "Needs attention", attention: "Needs attention" });
    expect(labels({ ...base, accounts: { ...base.accounts, synced: 3, syncing: 3 } })).toMatchObject({ accounts: "Updating", attention: "Healthy" });
    expect(labels({ ...base, accounts: { ...base.accounts, synced: 5, failed: 1 } })).toMatchObject({ accounts: "Needs attention", attention: "Needs attention" });
    expect(labels({ ...base, riot: { configured: false, state: "unknown", lastOkAt: null, lastError: null } })).toMatchObject({ riot: "Unavailable" });
  });
});

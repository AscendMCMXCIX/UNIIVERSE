import { describe, expect, it } from "vitest";
import "@/server/jobs";
import { listJobs } from "./registry";
import { RETIRED_JOB_KEYS } from "@/server/ops/refresh-status";

describe("job registry", () => {
  it("registers every current job and none of a removed feature (Draft, Meta & Trends, Clash Scout)", () => {
    const keys = listJobs().map((j) => j.key);
    expect(keys).toEqual(expect.arrayContaining(["account-sync", "db-usage", "perf-probe", "erasure-reconcile"]));
    expect(keys.filter((k) => RETIRED_JOB_KEYS.has(k))).toEqual([]);
    expect(keys).not.toContain("lab-benchmark");
  });

  it("registers the stored lane opponents' repair, run by hand only (never by the scheduler)", () => {
    const job = listJobs().find((j) => j.key === "lane-opponent-recompute");
    expect(job?.defaultIntervalMinutes).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import "@/server/jobs";
import { listJobs, type JobKind } from "./registry";
import { RETIRED_JOB_KEYS } from "@/server/ops/refresh-status";
import { JOB_NAMES } from "@/domain/job-names";

describe("job registry", () => {
  it("gives every job a plain name and one sentence for Data & Integrations, and names no retired job", () => {
    const keys = listJobs().map((j) => j.key);
    expect(keys.filter((k) => !JOB_NAMES[k])).toEqual([]);
    expect(Object.keys(JOB_NAMES).filter((k) => !keys.includes(k as never))).toEqual([]);
  });

  it("registers every current job and none of a removed feature (Draft, Meta & Trends, Clash Scout)", () => {
    const keys = listJobs().map((j) => j.key);
    expect(keys).toEqual(expect.arrayContaining(["account-sync", "db-usage", "perf-probe", "erasure-reconcile"]));
    expect(keys.filter((k) => RETIRED_JOB_KEYS.has(k))).toEqual([]);
    expect(keys).not.toContain("lab-benchmark");
  });

  /*
    The kind decides who may start a job from Admin Mode (server/actions/settings.ts runJobAction):
    a setup job only the Owner, with its phrase typed. What fails here: a job without a kind; a job
    on the SETUP list below filed as a check or a refresh, or without its title, effect and phrase;
    a setup job missing from the list; a check or a refresh that asks for a phrase; and a check or
    a setup job that runs on a schedule. The list is written by hand, so nothing here can tell that
    a new job changes the site's setup or repairs data: filed as a check or a refresh, it passes,
    and its author and reviewer must catch it. A stage that adds a setup or repair job (S1b's
    lane-opponent-recompute) adds it to SETUP here and in
    tests/db/admin-safety.test.ts, and counts it in e2e/admin-safety.spec.ts.
  */
  const SETUP = ["rank-schedule", "rank-schedule-off", "history-rescan", "erasure-reconcile", "verify-account", "lane-opponent-recompute"];
  const KINDS: readonly JobKind[] = ["check", "refresh", "setup"];

  it("gives every job a kind: check, refresh or setup", () => {
    const without = listJobs().filter((j) => !KINDS.includes(j.kind)).map((j) => j.key);
    expect(without).toEqual([]);
  });

  it("files exactly the jobs that change the site's setup or repair data as setup, each with its title, effect and phrase", () => {
    const setup = listJobs().filter((j) => j.kind === "setup");
    expect(setup.map((j) => j.key).sort()).toEqual([...SETUP].sort());
    for (const job of setup) {
      expect(job.confirm?.title, job.key).toBeTruthy();
      expect(job.confirm?.effect, job.key).toBeTruthy();
      // A phrase of capital words, short enough to type on a phone.
      expect(job.confirm?.phrase, job.key).toMatch(/^[A-Z]+(?: [A-Z]+)?$/);
    }
    // Only setup jobs ask for a phrase; none of them runs on a schedule.
    expect(listJobs().filter((j) => j.kind !== "setup" && j.confirm).map((j) => j.key)).toEqual([]);
    expect(setup.filter((j) => j.defaultIntervalMinutes !== null).map((j) => j.key)).toEqual([]);
  });

  it("says what the heavy reads cost, and asks once before a full champion sync", () => {
    const byKey = new Map(listJobs().map((j) => [j.key, j]));
    expect(byKey.get("perf-probe")?.cost).toMatch(/6 MB/);
    expect(byKey.get("data-audit")?.cost).toMatch(/every stored game/);
    expect(byKey.get("static-sync")?.asks).toBeTruthy();
    // Every job the scheduler runs is a refresh: a check or a setup job never runs by itself.
    expect(listJobs().filter((j) => j.defaultIntervalMinutes !== null && j.kind !== "refresh").map((j) => j.key)).toEqual([]);
  });

  it("registers the stored lane opponents' repair, run by hand only (never by the scheduler)", () => {
    const job = listJobs().find((j) => j.key === "lane-opponent-recompute");
    expect(job?.defaultIntervalMinutes).toBeNull();
  });
});

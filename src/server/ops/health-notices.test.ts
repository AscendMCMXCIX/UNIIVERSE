import { describe, expect, it } from "vitest";
import { formatDate, isoDay } from "@/lib/format";
import { healthNotices } from "./health-notices";

/*
  /api/health's notices, the rule alone (tests/db/health-route.test.ts reads them through the route,
  with the queries it makes). 18 Nov 2026 09:04 UTC is when the five-minute schedule was removed in
  production (recon §1.5).
*/

const SCHEDULED = ["version-check", "rank-watch", "account-sync", "rank-checks", "integrity", "timeline-backfill", "figures-backfill"];
const ON = Date.UTC(2026, 10, 18, 9, 4, 33);
const OFF = Date.UTC(2026, 10, 18, 9, 4, 34);

describe("healthNotices", () => {
  it("names a schedule turned off after it was on, with the day only", () => {
    const [notice, ...rest] = healthNotices({ rankScheduleOnAt: ON, rankScheduleOffAt: OFF, intervals: {}, scheduledJobs: SCHEDULED });
    expect(rest).toEqual([]);
    expect(notice).toEqual({ kind: "schedule-off", job: "rank-schedule", since: isoDay(OFF), message: `LP five-minute schedule off since ${formatDate(OFF)}` });
    // The installation's calendar day, as every date on the site: 18 Nov in Sydney (20:04 there) and in UTC.
    expect(notice!.message).toMatch(/^LP five-minute schedule off since \d{1,2} [A-Z][a-z]{2} 2026$/);
    // No time of day, no person, no link.
    expect(JSON.stringify(notice)).not.toMatch(/\d{2}:\d{2}|http|audit|by /i);
  });

  it("says nothing while the schedule is on, was turned on again, or was never installed", () => {
    expect(healthNotices({ rankScheduleOnAt: OFF + 60_000, rankScheduleOffAt: OFF, intervals: {}, scheduledJobs: SCHEDULED })).toEqual([]);
    expect(healthNotices({ rankScheduleOnAt: ON, rankScheduleOffAt: 0, intervals: {}, scheduledJobs: SCHEDULED })).toEqual([]);
    expect(healthNotices({ rankScheduleOnAt: 0, rankScheduleOffAt: OFF, intervals: {}, scheduledJobs: SCHEDULED })).toEqual([]);
    expect(healthNotices({ rankScheduleOnAt: 0, rankScheduleOffAt: 0, intervals: {}, scheduledJobs: SCHEDULED })).toEqual([]);
  });

  it("lists the scheduled jobs set to 0 by key, and no job that only runs on demand", () => {
    const notices = healthNotices({ rankScheduleOnAt: 0, rankScheduleOffAt: 0, intervals: { "version-check": 0, integrity: 0, "rank-watch": 10, "perf-probe": 0, "auth-audit": 0 }, scheduledJobs: SCHEDULED });
    expect(notices).toEqual([{ kind: "disabled", jobs: ["version-check", "integrity"], message: "Off by choice (interval 0 in Admin): version-check, integrity" }]);
    expect(healthNotices({ rankScheduleOnAt: 0, rankScheduleOffAt: 0, intervals: { "rank-watch": 10 }, scheduledJobs: SCHEDULED })).toEqual([]);
  });

  it("gives both at once, the schedule first", () => {
    expect(healthNotices({ rankScheduleOnAt: ON, rankScheduleOffAt: OFF, intervals: { "rank-watch": 0 }, scheduledJobs: SCHEDULED }).map((n) => n.kind)).toEqual(["schedule-off", "disabled"]);
  });
});

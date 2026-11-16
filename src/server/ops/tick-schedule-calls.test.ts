import { describe, expect, it } from "vitest";
import { sentByDatabase, tickScheduleSilentMs, TICK_SCHEDULE_SILENT_MAX_MS, TICK_SCHEDULE_SILENT_MIN_MS } from "./tick-schedule-calls";

/*
  The database's tick schedule (production's ten-minute uniiverse-tick) as /api/health knows it:
  by the User-Agent pg_net sends with every request, and by how long it may stay silent. Its record
  and the health check itself are in tests/db/job-endpoint.test.ts and tests/db/job-health.test.ts.
*/

const MIN = 60_000;

describe("the database's tick schedule", () => {
  it("is known by pg_net's User-Agent, never by those of the tick's other callers", () => {
    // pg_net up to 0.15 added its own header before a command's; the two arrive joined.
    for (const ua of ["pg_net/0.14.0", "pg_net/0.7.1", "PG_NET/0.19.5", "pg_net/0.10.0, custom"]) expect(sentByDatabase(ua)).toBe(true);
    // No header, GitHub's Data jobs runs, Vercel's daily cron, a browser, a name that only contains it.
    for (const ua of [null, "", "curl/8.5.0", "vercel-cron/1.0", "Mozilla/5.0 (X11; Linux x86_64)", "not pg_net/1.0"]) expect(sentByDatabase(ua)).toBe(false);
  });

  it("may be silent for four of its own intervals, never less than 40 minutes or more than four hours", () => {
    const at = Date.UTC(2026, 10, 16, 12, 0);
    expect(tickScheduleSilentMs({ at, previousAt: null })).toBe(TICK_SCHEDULE_SILENT_MIN_MS);
    expect(tickScheduleSilentMs({ at, previousAt: at - 10 * MIN })).toBe(40 * MIN);
    expect(tickScheduleSilentMs({ at, previousAt: at - 30 * MIN })).toBe(120 * MIN);
    // A call by hand right after a scheduled one, and the first call after a three-day pause.
    expect(tickScheduleSilentMs({ at, previousAt: at - MIN })).toBe(TICK_SCHEDULE_SILENT_MIN_MS);
    expect(tickScheduleSilentMs({ at, previousAt: at - 3 * 24 * 60 * MIN })).toBe(TICK_SCHEDULE_SILENT_MAX_MS);
  });
});

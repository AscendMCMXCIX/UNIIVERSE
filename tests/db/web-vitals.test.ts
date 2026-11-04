import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { recordVitals, vitalsReport } from "@/server/observability/web-vitals";

/*
  Field performance storage: each beacon adds one per metric to its day, bucket, page group and
  device class; the report sums the last days in the database and states what the counts prove;
  rows past the retention go.
*/

let handle: DbHandle;
const now = new Date("2026-10-21T10:00:00Z");

beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("field performance storage", () => {
  it("counts each page view once per metric, and reports the last days by device and page", async () => {
    const db = handle.db;
    for (let i = 0; i < 8; i++) await recordVitals(db, { page: "team", device: "phone", metrics: { LCP: 4, CLS: 0, INP: 2, TTFB: 3 } }, now);
    for (let i = 0; i < 2; i++) await recordVitals(db, { page: "players", device: "desktop", metrics: { LCP: 9, TTFB: 2 } }, now);
    // Counted on another day inside the window, and one far outside it.
    await recordVitals(db, { page: "team", device: "phone", metrics: { LCP: 0, TTFB: 0 } }, new Date("2026-10-01T10:00:00Z"));
    const rows = (await db.execute(sql`SELECT count(*)::int AS n, sum(count)::int AS total FROM web_vitals_daily`)) as unknown as { rows?: Array<{ n: number; total: number }> };
    const [stored] = rows.rows ?? (rows as unknown as Array<{ n: number; total: number }>);
    // One row per (day, metric, page, device, bucket): counts grow, rows do not.
    expect(stored).toEqual({ n: 8, total: 8 * 4 + 2 * 2 + 2 });

    const report = await vitalsReport(db, 28, now);
    expect(report.since).toBe("2026-09-24");
    const lcp = report.metrics.find((m) => m.metric === "LCP")!;
    expect(lcp.all).toMatchObject({ count: 11, p75AtMost: 2500 });
    expect(lcp.byDevice.map((d) => [d.device, d.summary.count])).toEqual([
      ["phone", 9],
      ["desktop", 2],
    ]);
    expect(report.pages.map((p) => [p.page, p.loads])).toEqual([
      ["team", 9],
      ["players", 2],
    ]);
    expect(report.pages[1]!.INP).toBeNull();
    expect(report.metrics.find((m) => m.metric === "FCP")!.all).toBeNull();

    // A shorter window leaves the older day out.
    expect((await vitalsReport(db, 7, now)).metrics.find((m) => m.metric === "LCP")!.all!.count).toBe(10);
  });

  it("deletes days past the retention as it writes", async () => {
    const db = handle.db;
    await db.execute(sql`INSERT INTO web_vitals_daily (day, metric, page, device, bucket, count) VALUES ('2026-08-01', 'LCP', 'team', 'phone', 0, 5)`);
    await recordVitals(db, { page: "team", device: "tablet", metrics: { LCP: 1 } }, new Date(now.getTime() + 2 * 3_600_000));
    const result = (await db.execute(sql`SELECT count(*)::int AS n FROM web_vitals_daily WHERE day = '2026-08-01'`)) as unknown as { rows?: Array<{ n: number }> };
    expect((result.rows ?? (result as unknown as Array<{ n: number }>))[0]!.n).toBe(0);
  });
  // Last: a beacon recorded now starts the hourly prune timer the test above relies on.
  it("the production probe reports each page's figures, as counts and bucket bounds only", async () => {
    const { fieldVitals } = await import("@/server/observability/perf-probe");
    const db = handle.db;
    await recordVitals(db, { page: "leaderboards", device: "desktop", metrics: { LCP: 2, INP: 1, CLS: 0, TTFB: 1 } });
    const field = await fieldVitals(db);
    expect("error" in field).toBe(false);
    const page = (field as { pages: Array<Record<string, unknown>> }).pages.find((p) => p.page === "leaderboards");
    expect(page).toMatchObject({ page: "leaderboards", loads: 1, lcpGood: expect.any(Number) });
    expect(typeof page!.lcpP75).toBe("number");
    expect(Object.keys(page!).sort()).toEqual(["clsP75", "inpP75", "lcpGood", "lcpP75", "loads", "page"]);
  });
});

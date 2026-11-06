import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { DEVICE_CLASSES, PAGE_GROUPS, VITAL_METRICS, VITALS, isDeviceClass, isPageGroup, isVitalMetric, summariseVital, type DeviceClass, type PageGroup, type VitalMetric, type VitalSummary, type VitalsBeacon } from "@/domain/web-vitals";

/*
  Field performance, stored (domain/web-vitals explains what is measured). Each page view's beacon
  adds one to a count per metric, bucket, page group, device class and UTC day: one statement, a
  write, which is not database egress. Rows older than VITALS_KEEP_DAYS go at most once an hour per
  instance. Admin Mode → System Health reads the totals grouped in the database.
*/

export const VITALS_KEEP_DAYS = 35;
let lastPrune = 0;

/** UNIIVERSE_FIELD_METRICS=off stops both the measuring and the storing. */
export const fieldMetricsEnabled = () => process.env.UNIIVERSE_FIELD_METRICS?.trim().toLowerCase() !== "off";

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

export async function recordVitals(db: Db, beacon: VitalsBeacon, now = new Date()): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  const values = Object.entries(beacon.metrics).map(([metric, bucket]) => sql`(${day}::date, ${metric}, ${beacon.page}, ${beacon.device}, ${bucket}::smallint, 1)`);
  if (!values.length) return;
  await db.execute(sql`
    INSERT INTO web_vitals_daily (day, metric, page, device, bucket, count) VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (day, metric, page, device, bucket) DO UPDATE SET count = web_vitals_daily.count + 1`);
  if (now.getTime() - lastPrune >= 3_600_000) {
    lastPrune = now.getTime();
    await db.execute(sql`DELETE FROM web_vitals_daily WHERE day < ${day}::date - ${sql.raw(String(VITALS_KEEP_DAYS))}`);
  }
}

export interface VitalsReport {
  /** The first UTC day counted. */
  since: string;
  days: number;
  /** Each metric across every page: all devices, then each device class with measurements. */
  metrics: Array<{ metric: VitalMetric; all: VitalSummary | null; byDevice: Array<{ device: DeviceClass; summary: VitalSummary }> }>;
  /**
   * Each page group with measurements: its page loads (TTFB is measured on every load), the three
   * Core Web Vitals and the server's first byte, then the loads, LCP and TTFB of each device class
   * (a page can be slow on phones only, or only before the server's first byte).
   */
  pages: Array<{ page: PageGroup; loads: number; LCP: VitalSummary | null; INP: VitalSummary | null; CLS: VitalSummary | null; TTFB: VitalSummary | null; REDIRECT: VitalSummary | null; SERVER: VitalSummary | null; byDevice: Array<{ device: DeviceClass; loads: number; LCP: VitalSummary | null; TTFB: VitalSummary | null; REDIRECT: VitalSummary | null; SERVER: VitalSummary | null }> }>;
}

/** The last `days` UTC days (today included), summarised. One grouped query: at most a few hundred rows. */
export async function vitalsReport(db: Db, days = 28, now = new Date()): Promise<VitalsReport> {
  const since = new Date(now.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = rowsOf<{ metric: string; page: string | null; device: string | null; bucket: number; count: number | string }>(
    await db.execute(sql`
      SELECT metric, page, device, bucket, sum(count) AS count FROM web_vitals_daily
      WHERE day >= ${since}::date
      GROUP BY GROUPING SETS ((metric, device, bucket), (metric, page, bucket), (metric, page, device, bucket))`),
  );
  const counts = new Map<string, number[]>();
  const add = (key: string, metric: VitalMetric, bucket: number, n: number) => {
    let c = counts.get(key);
    if (!c) counts.set(key, (c = new Array<number>(VITALS[metric].bounds.length + 1).fill(0)));
    if (bucket >= 0 && bucket < c.length) c[bucket]! += n;
  };
  for (const r of rows) {
    if (!isVitalMetric(r.metric)) continue;
    const n = Number(r.count);
    const device = r.device !== null && isDeviceClass(r.device) ? r.device : null;
    const page = r.page !== null && isPageGroup(r.page) ? r.page : null;
    // Each grouping set leaves the columns it does not group by empty.
    if (page && device) add(`${r.metric}|page|${page}|${device}`, r.metric, Number(r.bucket), n);
    else if (device && r.page === null) {
      add(`${r.metric}|device|${device}`, r.metric, Number(r.bucket), n);
      add(`${r.metric}|all`, r.metric, Number(r.bucket), n);
    } else if (page && r.device === null) add(`${r.metric}|page|${page}`, r.metric, Number(r.bucket), n);
  }
  const summary = (metric: VitalMetric, key: string) => {
    const c = counts.get(key);
    return c ? summariseVital(metric, c) : null;
  };
  return {
    since,
    days,
    metrics: VITAL_METRICS.map((metric) => ({
      metric,
      all: summary(metric, `${metric}|all`),
      byDevice: DEVICE_CLASSES.flatMap((device) => {
        const s = summary(metric, `${metric}|device|${device}`);
        return s ? [{ device, summary: s }] : [];
      }),
    })),
    pages: PAGE_GROUPS.flatMap((page) => {
      const TTFB = summary("TTFB", `TTFB|page|${page}`);
      const loads = TTFB?.count ?? 0;
      const LCP = summary("LCP", `LCP|page|${page}`);
      const INP = summary("INP", `INP|page|${page}`);
      const CLS = summary("CLS", `CLS|page|${page}`);
      // TTFB's parts: REDIRECT counts only the loads that had one, so its count over TTFB's is the share redirected.
      const REDIRECT = summary("REDIRECT", `REDIRECT|page|${page}`);
      const SERVER = summary("SERVER", `SERVER|page|${page}`);
      const byDevice = DEVICE_CLASSES.flatMap((device) => {
        const ttfb = summary("TTFB", `TTFB|page|${page}|${device}`);
        const lcp = summary("LCP", `LCP|page|${page}|${device}`);
        const redirect = summary("REDIRECT", `REDIRECT|page|${page}|${device}`);
        const server = summary("SERVER", `SERVER|page|${page}|${device}`);
        return ttfb || lcp ? [{ device, loads: ttfb?.count ?? 0, LCP: lcp, TTFB: ttfb, REDIRECT: redirect, SERVER: server }] : [];
      });
      return loads || LCP || INP || CLS ? [{ page, loads, LCP, INP, CLS, TTFB, REDIRECT, SERVER, byDevice }] : [];
    }).sort((a, b) => b.loads - a.loads),
  };
}

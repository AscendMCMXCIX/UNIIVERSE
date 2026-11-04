/*
  Field performance: how fast pages are for the people using them, measured in their own browsers
  (docs/MONITORING.md). Lab tools (Lighthouse, the browser tests) measure one emulated device; these
  are real page loads, so the two are reported apart and never mixed.

  Each measurement is reduced before it leaves the browser to a metric, a bucket, a page group and a
  device class. Nothing identifies the person, their account, the record they opened or the full
  address. The server keeps counts per day, bucket, page group and device class.

  The buckets bound the percentile honestly: "75% of loads were at most 2.5 s" is exact from the
  counts, where a single estimated figure would not be.
*/

export const VITAL_METRICS = ["LCP", "CLS", "INP", "FCP", "TTFB"] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];

export const DEVICE_CLASSES = ["phone", "tablet", "desktop"] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

/**
 * Page groups: the first part of the address, never the rest (a player's, block's or match's id
 * never reaches the server). Anything else is "other".
 */
export const PAGE_GROUPS = ["team", "players", "matches", "overview", "me", "leaderboards", "resources", "blocks", "ranked", "settings", "admin", "public", "login", "welcome", "other"] as const;
export type PageGroup = (typeof PAGE_GROUPS)[number];

interface MetricDefinition {
  label: string;
  unit: "ms" | "score";
  /** Google's Core Web Vitals thresholds: up to `good` is good, above `poor` is poor. */
  good: number;
  poor: number;
  /** Bucket upper bounds, ascending; the last bucket is everything above. They include both thresholds. */
  bounds: readonly number[];
  /** Larger values are discarded as measurement errors. */
  max: number;
}

export const VITALS: Record<VitalMetric, MetricDefinition> = {
  LCP: { label: "Largest Contentful Paint", unit: "ms", good: 2500, poor: 4000, bounds: [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 8000, 10000], max: 120_000 },
  INP: { label: "Interaction to Next Paint", unit: "ms", good: 200, poor: 500, bounds: [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 2000], max: 120_000 },
  CLS: { label: "Cumulative Layout Shift", unit: "score", good: 0.1, poor: 0.25, bounds: [0.01, 0.025, 0.05, 0.075, 0.1, 0.15, 0.25, 0.4, 0.6, 1], max: 50 },
  FCP: { label: "First Contentful Paint", unit: "ms", good: 1800, poor: 3000, bounds: [500, 1000, 1500, 1800, 2500, 3000, 4000, 6000, 10000], max: 120_000 },
  TTFB: { label: "Time to First Byte", unit: "ms", good: 800, poor: 1800, bounds: [100, 200, 300, 400, 600, 800, 1000, 1500, 1800, 3000], max: 120_000 },
};

export const isVitalMetric = (v: unknown): v is VitalMetric => typeof v === "string" && (VITAL_METRICS as readonly string[]).includes(v);
export const isDeviceClass = (v: unknown): v is DeviceClass => typeof v === "string" && (DEVICE_CLASSES as readonly string[]).includes(v);
export const isPageGroup = (v: unknown): v is PageGroup => typeof v === "string" && (PAGE_GROUPS as readonly string[]).includes(v);

/** The bucket a value falls in (0 = up to the first bound), or null for a value that is not a measurement. */
export function vitalBucket(metric: VitalMetric, value: number): number | null {
  const { bounds, max } = VITALS[metric];
  if (!Number.isFinite(value) || value < 0 || value > max) return null;
  const i = bounds.findIndex((b) => value <= b);
  return i === -1 ? bounds.length : i;
}

/** The page group of an address ("/players/1f3…/matches" → "players"). */
export function pageGroupOf(pathname: string): PageGroup {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return isPageGroup(first) ? first : "other";
}

/** The device class of a viewport width, in CSS pixels (the app's own breakpoints, docs/RESPONSIVE.md). */
export function deviceClassOf(width: number): DeviceClass {
  if (width < 640) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

export interface VitalSummary {
  count: number;
  /** At most this value for 75% of the measurements: the bound of the bucket that reaches 75%. Null above the last bound. */
  p75AtMost: number | null;
  /** Shares of measurements, 0–1. Each threshold is a bucket bound, so these are exact. */
  good: number;
  needsImprovement: number;
  poor: number;
}

/** A summary of one metric's bucket counts (index = bucket). */
export function summariseVital(metric: VitalMetric, counts: readonly number[]): VitalSummary | null {
  const { bounds, good, poor } = VITALS[metric];
  const count = counts.reduce((n, c) => n + c, 0);
  if (count === 0) return null;
  let running = 0;
  let p75AtMost: number | null = null;
  for (let i = 0; i < counts.length; i++) {
    running += counts[i] ?? 0;
    if (running >= count * 0.75) {
      p75AtMost = i < bounds.length ? bounds[i]! : null;
      break;
    }
  }
  const upTo = (limit: number) => counts.slice(0, bounds.indexOf(limit) + 1).reduce((n, c) => n + c, 0);
  const goodCount = upTo(good);
  const poorCount = count - upTo(poor);
  return { count, p75AtMost, good: goodCount / count, needsImprovement: (count - goodCount - poorCount) / count, poor: poorCount / count };
}

/** "≤ 2.5 s", "≤ 150 ms", "≤ 0.1", or "> 10 s" above the last bound. */
export function formatVitalBound(metric: VitalMetric, value: number | null): string {
  const { unit, bounds } = VITALS[metric];
  const show = (v: number) => (unit === "score" ? String(v) : v >= 1000 ? `${v / 1000} s` : `${v} ms`);
  return value === null ? `> ${show(bounds[bounds.length - 1]!)}` : `≤ ${show(value)}`;
}

/** The body one page view sends: at most one value per metric, already reduced to buckets. */
export interface VitalsBeacon {
  page: PageGroup;
  device: DeviceClass;
  metrics: Partial<Record<VitalMetric, number>>;
}

/** The beacon's contents if well formed, else null (the server stores nothing). */
export function parseVitalsBeacon(input: unknown): VitalsBeacon | null {
  if (!input || typeof input !== "object") return null;
  const { page, device, metrics } = input as Record<string, unknown>;
  if (!isPageGroup(page) || !isDeviceClass(device) || !metrics || typeof metrics !== "object" || Array.isArray(metrics)) return null;
  const out: Partial<Record<VitalMetric, number>> = {};
  for (const [name, bucket] of Object.entries(metrics)) {
    if (!isVitalMetric(name) || !Number.isInteger(bucket) || (bucket as number) < 0 || (bucket as number) > VITALS[name].bounds.length) return null;
    out[name] = bucket as number;
  }
  return Object.keys(out).length ? { page, device, metrics: out } : null;
}

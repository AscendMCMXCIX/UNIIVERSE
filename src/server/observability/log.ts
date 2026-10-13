/**
 * Structured server-side logging. One JSON object per line so Vercel's log drain and `vercel
 * logs` can filter on `event`, `level` and `ms`. Values that look like secrets (keys named like
 * tokens, passwords, connection strings, Riot keys) are redacted before they are written, and the
 * helpers never receive request bodies or cookies in the first place.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const SECRET_KEY = /(password|passwd|secret|token|cookie|authorization|api[-_]?key|database_url|connection|session)/i;
const SECRET_VALUE = /^(RGAPI-[0-9a-f-]{20,}|postgres(ql)?:\/\/|s1\.[A-Za-z0-9_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return SECRET_VALUE.test(value) ? "[redacted]" : value.length > 2000 ? `${value.slice(0, 2000)}…` : value;
  if (typeof value !== "object" || depth > 4) return value;
  if (value instanceof Error) return { name: value.name, message: redact(value.message), stack: process.env.NODE_ENV === "production" ? undefined : value.stack?.split("\n").slice(0, 6).join("\n") };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

const MIN_LEVEL: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = () => MIN_LEVEL[(process.env.UNIIVERSE_LOG_LEVEL as LogLevel) ?? (process.env.NODE_ENV === "production" ? "info" : "debug")] ?? 20;

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  if (MIN_LEVEL[level] < threshold()) return;
  if (process.env.UNIIVERSE_LOG_SILENT === "true") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(redact(fields) as Record<string, unknown>) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/** Milliseconds with one decimal, from a high-resolution start. */
export function elapsed(start: number): number {
  return Math.round((performance.now() - start) * 10) / 10;
}

/**
 * Times an async step. Returns the result; records the duration on the optional collector and
 * logs a warning when the step exceeds its budget. Errors propagate after being logged with the
 * step name (never with request data).
 */
export async function timed<T>(name: string, fn: () => Promise<T>, options: { collector?: Timings; slowMs?: number; fields?: Record<string, unknown> } = {}): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } catch (err) {
    log("error", "step.failed", { step: name, ms: elapsed(start), error: err, ...(options.fields ?? {}) });
    throw err;
  } finally {
    const ms = elapsed(start);
    options.collector?.add(name, ms);
    const slow = options.slowMs ?? Number(process.env.UNIIVERSE_SLOW_STEP_MS ?? 1500);
    if (ms > slow) log("warn", "step.slow", { step: name, ms, ...(options.fields ?? {}) });
  }
}

/** Accumulates named durations for one request/action, for a single summary line. */
export class Timings {
  private readonly entries: Array<{ name: string; ms: number }> = [];
  private readonly started = performance.now();
  add(name: string, ms: number): void {
    this.entries.push({ name, ms });
  }
  get total(): number {
    return elapsed(this.started);
  }
  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) out[e.name] = Math.round(((out[e.name] ?? 0) + e.ms) * 10) / 10;
    out.total = this.total;
    return out;
  }
  /** Logs one line; warns when the whole thing is slow. */
  report(event: string, fields: Record<string, unknown> = {}, slowMs = Number(process.env.UNIIVERSE_SLOW_REQUEST_MS ?? 2000)): void {
    const summary = this.summary();
    log(summary.total! > slowMs ? "warn" : "info", event, { ...fields, timings: summary });
  }
}

/** Wraps a server action: logs failures and slow runs with the action name only. */
export async function traced<T>(action: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const ms = elapsed(start);
    if (ms > Number(process.env.UNIIVERSE_SLOW_ACTION_MS ?? 800)) log("warn", "action.slow", { action, ms });
    else log("debug", "action.done", { action, ms });
    return result;
  } catch (err) {
    log("error", "action.failed", { action, ms: elapsed(start), error: err });
    throw err;
  }
}

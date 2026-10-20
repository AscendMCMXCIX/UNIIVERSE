import { createHash } from "node:crypto";

/*
  Database egress accounting. Supabase bills the bytes the database sends to the app ("egress"),
  and Postgres keeps no byte counts per query (pg_stat_statements counts calls and rows only).
  Every query the app sends passes through the concurrency gate (db/gate.ts), which hands its
  result here. Its size on the wire is estimated from the rows as Postgres sends them in the text
  protocol: each value as text (bytea as hex, json as text), 4 bytes of length per value, a 7-byte
  header per row, the column descriptions and the closing messages of each query. Measured against
  a byte-counting proxy, the estimate is within a few percent of the bytes Postgres sent
  (tests/db/egress.test.ts); TLS and connection set-up are not included.

  Totals are kept per query shape (verb, first table, a hash of the SQL text with its literals
  replaced, as pg_stat_statements shows it) and per UTC day, and written to db_egress_daily every
  few minutes, one upsert per server instance. No value ever leaves the process: queries carry
  their values as parameters, and literals in the text are replaced before a shape is kept.
  An instance stopped before its next write loses at most those few minutes of counts, so the
  totals are a floor.
*/

export interface EgressTotals {
  calls: number;
  rows: number;
  bytes: number;
}

export interface QueryShape {
  /** "<verb> <table> <hash>", stable for the same query text. */
  label: string;
  /** The query text with literals replaced and long lists shortened (at most 300 characters). */
  sample: string;
}

/** Messages around every result: ParseComplete, BindComplete, CommandComplete, ReadyForQuery. */
const QUERY_OVERHEAD = 31;
/** A RowDescription field: name, terminator and 18 bytes of type information. */
const FIELD_OVERHEAD = 19;
/** A DataRow: 1-byte type, 4-byte length, 2-byte value count. */
const ROW_OVERHEAD = 7;
/** Each value carries a 4-byte length (-1 for NULL). */
const VALUE_OVERHEAD = 4;
/** timestamptz as text, e.g. "2026-10-19 12:34:56.789+00". */
const TIMESTAMP_BYTES = 26;

/**
 * The size of one value as Postgres sends it in the text protocol. `raw` values (postgres-js
 * raw()) are the received bytes themselves.
 */
export function valueBytes(v: unknown, raw = false): number {
  if (v === null || v === undefined) return 0;
  if (raw && v instanceof Uint8Array) return v.byteLength;
  switch (typeof v) {
    case "string":
      return Buffer.byteLength(v);
    case "number":
    case "bigint":
      return String(v).length;
    case "boolean":
      return 1;
    case "object":
      if (v instanceof Date) return TIMESTAMP_BYTES;
      // bytea travels as hex text: "\x" and two characters per byte.
      if (v instanceof Uint8Array) return 2 + 2 * v.byteLength;
      // json/jsonb as text; jsonb puts a space after each ":" and ",", which JSON.stringify omits.
      return Math.round(Buffer.byteLength(JSON.stringify(v)) * 1.08);
    default:
      return 0;
  }
}

/** Rows and estimated wire bytes of one postgres-js result (row objects, value arrays or raw rows). */
export function resultBytes(result: unknown, raw = false): { rows: number; bytes: number } {
  if (!Array.isArray(result)) return { rows: 0, bytes: QUERY_OVERHEAD };
  const columns = (result as { columns?: Array<{ name?: string }> }).columns;
  let bytes = QUERY_OVERHEAD + (Array.isArray(columns) ? 7 + columns.reduce((s, c) => s + Buffer.byteLength(String(c?.name ?? "")) + FIELD_OVERHEAD, 0) : 5);
  for (const row of result as unknown[]) {
    const values = Array.isArray(row) ? row : row !== null && typeof row === "object" ? Object.values(row) : [row];
    bytes += ROW_OVERHEAD + VALUE_OVERHEAD * values.length;
    for (const v of values) bytes += valueBytes(v, raw);
  }
  return { rows: result.length, bytes };
}

const shapes = new Map<string, QueryShape>();
const MAX_SHAPES = 1000;

/** The shape of a query text, as pg_stat_statements would group it. */
export function queryShape(text: string): QueryShape {
  const known = shapes.get(text);
  if (known) return known;
  const sample = text
    .replace(/\s+/g, " ")
    .replace(/'(?:[^']|'')*'/g, "'?'")
    .replace(/\b\d+(?:\.\d+)?\b/g, "N")
    // Lists of parameters and multi-row VALUES differ only in length: one shape for all.
    .replace(/\$N(?:\s*,\s*\$N)+/g, "$N…")
    .replace(/\((?:[^()]|\([^()]*\))*\)(?:\s*,\s*\((?:[^()]|\([^()]*\))*\))+/g, "(…)…")
    .trim();
  const verb = (/^\(?\s*(\w+)/.exec(sample)?.[1] ?? "query").toLowerCase();
  const table = /\b(?:from|into|update|join)\s+"?([\w.]+)"?/i.exec(sample)?.[1] ?? "-";
  const shape = { label: `${verb} ${table} ${createHash("sha1").update(sample).digest("hex").slice(0, 8)}`, sample: sample.slice(0, 300) };
  if (shapes.size >= MAX_SHAPES) shapes.delete(shapes.keys().next().value!);
  shapes.set(text, shape);
  return shape;
}

declare global {
  var __uniiverseEgress: { pending: Map<string, EgressTotals & { day: string; label: string; sample: string }>; total: EgressTotals; lastFlush: number; flushing: boolean } | undefined;
}

function fresh() {
  return { pending: new Map(), total: { calls: 0, rows: 0, bytes: 0 }, lastFlush: Date.now(), flushing: false };
}

function state() {
  if (!globalThis.__uniiverseEgress) globalThis.__uniiverseEgress = fresh();
  return globalThis.__uniiverseEgress;
}

/** UTC day, as stored. */
export function egressDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Counts one query result against its shape and today's date. */
export function recordQuery(text: string, result: unknown, options: { raw?: boolean; now?: Date } = {}): void {
  if (typeof text !== "string" || !text) return;
  const now = options.now ?? new Date();
  const { label, sample } = queryShape(text);
  const { rows, bytes } = resultBytes(result, options.raw);
  const day = egressDay(now);
  const key = `${day}|${label}`;
  const s = state();
  const t = s.pending.get(key);
  if (t) {
    t.calls += 1;
    t.rows += rows;
    t.bytes += bytes;
  } else s.pending.set(key, { day, label, sample, calls: 1, rows, bytes });
  s.total.calls += 1;
  s.total.rows += rows;
  s.total.bytes += bytes;
}

/** Everything this process has counted since it started (the perf probe measures steps with it). */
export function processEgress(): EgressTotals {
  return { ...state().total };
}

/** How often an instance writes its totals. */
export const EGRESS_FLUSH_MS = Number(process.env.UNIIVERSE_EGRESS_FLUSH_MS ?? 5 * 60_000);
/** Rows older than this are deleted as new ones are written. */
export const EGRESS_KEEP_DAYS = 35;

export function egressFlushDue(now = Date.now()): boolean {
  const s = state();
  return !s.flushing && s.pending.size > 0 && now - s.lastFlush >= EGRESS_FLUSH_MS;
}

type Unsafe = (query: string, params?: unknown[]) => PromiseLike<unknown>;

/**
 * Writes the pending totals (one statement) and clears them. On failure they are kept for the
 * next attempt. The write is itself counted, like any other query.
 */
export async function flushEgress(unsafe: Unsafe, now = new Date()): Promise<boolean> {
  const s = state();
  if (s.flushing || s.pending.size === 0) return false;
  s.flushing = true;
  const batch = [...s.pending.values()];
  s.pending.clear();
  s.lastFlush = now.getTime();
  try {
    const params: unknown[] = [];
    const values = batch.map((t) => {
      params.push(t.day, t.label, t.sample, t.calls, t.rows, t.bytes);
      const n = params.length;
      return `($${n - 5}::date, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n})`;
    });
    await unsafe(
      `INSERT INTO db_egress_daily (day, label, sample, calls, rows, bytes) VALUES ${values.join(", ")}
       ON CONFLICT (day, label) DO UPDATE SET calls = db_egress_daily.calls + excluded.calls, rows = db_egress_daily.rows + excluded.rows, bytes = db_egress_daily.bytes + excluded.bytes, sample = excluded.sample`,
      params,
    );
    await unsafe(`DELETE FROM db_egress_daily WHERE day < (now() at time zone 'utc')::date - ${EGRESS_KEEP_DAYS}`);
    return true;
  } catch {
    // Keep the counts for the next attempt (the table may not exist yet during a deployment).
    for (const t of batch) {
      const key = `${t.day}|${t.label}`;
      const cur = s.pending.get(key);
      if (cur) {
        cur.calls += t.calls;
        cur.rows += t.rows;
        cur.bytes += t.bytes;
      } else s.pending.set(key, { ...t });
    }
    return false;
  } finally {
    s.flushing = false;
  }
}

/** Tests only. */
export function resetEgressForTests(): void {
  globalThis.__uniiverseEgress = fresh();
}

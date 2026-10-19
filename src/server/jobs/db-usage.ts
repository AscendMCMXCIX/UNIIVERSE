import { sql } from "drizzle-orm";
import { defineJob } from "./registry";

type Row = Record<string, unknown>;
const rows = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Read-only database usage report, to see what fills the database and what reads data out of it
 * (Supabase counts the bytes sent to the app as egress). Tables: size with indexes and TOAST, live
 * rows, and how often they were read whole (sequential scans and the rows those scans read).
 * Statements: Postgres' own statistics (pg_stat_statements, enabled on Supabase), where "rows"
 * is the number of rows sent back to the app, the best available proxy for egress; query texts are
 * normalised by Postgres (values replaced by $1, $2…), so no data appears. Changes nothing.
 */
defineJob({
  key: "db-usage",
  description: "Read-only report of table sizes and of the queries that return the most rows or take the most time (pg_stat_statements when available). Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const db = ctx.db;
    const [database] = rows(await db.execute(sql`SELECT pg_database_size(current_database()) AS bytes`).catch(() => [] as never));
    const tables = rows(
      await db.execute(sql`
        SELECT relname AS name, n_live_tup AS live_rows,
          pg_total_relation_size(relid) AS total_bytes, pg_relation_size(relid) AS heap_bytes, pg_indexes_size(relid) AS index_bytes,
          seq_scan, seq_tup_read, idx_scan, idx_tup_fetch, n_tup_ins, n_tup_upd, n_tup_del, n_dead_tup
        FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 25`),
    ).map((r) => ({
      name: String(r.name),
      liveRows: num(r.live_rows),
      totalMb: Math.round((Number(r.total_bytes) / 1048576) * 10) / 10,
      heapMb: Math.round((Number(r.heap_bytes) / 1048576) * 10) / 10,
      indexMb: Math.round((Number(r.index_bytes) / 1048576) * 10) / 10,
      seqScans: num(r.seq_scan),
      seqRowsRead: num(r.seq_tup_read),
      indexScans: num(r.idx_scan),
      indexRowsFetched: num(r.idx_tup_fetch),
      inserted: num(r.n_tup_ins),
      updated: num(r.n_tup_upd),
      deleted: num(r.n_tup_del),
      deadRows: num(r.n_dead_tup),
    }));
    // pg_stat_statements lives in the "extensions" schema on Supabase; elsewhere it may be absent.
    let statements: { available: boolean; since: string | null; byRows: Row[]; byTime: Row[]; byCalls: Row[]; error?: string } = { available: false, since: null, byRows: [], byTime: [], byCalls: [] };
    for (const view of ["extensions.pg_stat_statements", "public.pg_stat_statements"]) {
      try {
        const top = async (order: string) =>
          rows(
            await db.execute(
              sql.raw(`SELECT left(regexp_replace(query, '\\s+', ' ', 'g'), 220) AS query, calls, rows, round(total_exec_time::numeric) AS total_ms, round(mean_exec_time::numeric, 1) AS mean_ms, shared_blks_hit + shared_blks_read AS blocks
                FROM ${view} WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) AND query NOT ILIKE '%pg_stat_statements%'
                ORDER BY ${order} DESC LIMIT 20`),
            ),
          ).map((r) => ({ query: r.query, calls: num(r.calls), rows: num(r.rows), rowsPerCall: r.calls ? Math.round(Number(r.rows) / Number(r.calls)) : null, totalMs: num(r.total_ms), meanMs: num(r.mean_ms), blocks: num(r.blocks) }));
        const byRows = await top("rows");
        const byTime = await top("total_exec_time");
        const byCalls = await top("calls");
        const [info] = rows(await db.execute(sql.raw(`SELECT stats_reset FROM ${view.replace("pg_stat_statements", "pg_stat_statements_info")}`)).catch(() => [] as never));
        statements = { available: true, since: info?.stats_reset ? new Date(String(info.stats_reset)).toISOString() : null, byRows, byTime, byCalls };
        break;
      } catch (err) {
        statements.error = (err as Error).message.slice(0, 200);
      }
    }
    return { ok: true, summary: { databaseMb: database?.bytes ? Math.round(Number(database.bytes) / 1048576) : null, tables, statements } };
  },
});

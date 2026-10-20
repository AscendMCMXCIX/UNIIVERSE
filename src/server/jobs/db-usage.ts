import { sql } from "drizzle-orm";
import { defineJob } from "./registry";
import { appEgressReport } from "./egress";
import type { Db } from "@/server/db/types";

type Row = Record<string, unknown>;
const rows = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/*
  What the held cleanup migrations remove: the retired Meta & Trends tables (audit decision 2,
  docs/DATA_PIPELINES.md "Retired tables") and the Draft feature's tables, columns and enum types
  (decision 3, docs/ARCHITECTURE.md "Draft removed"). The report checks them against production
  before they go, and confirms afterwards that they went (a dropped one is reported as gone).
*/
const RETIRED_TABLES = [
  ...["ranked_matches", "ranked_participants", "ranked_bans", "match_fetch_queue", "champion_role_stats", "champion_ban_stats", "champion_matchups", "champion_synergies", "pro_pick_slot_stats", "pro_games", "pro_game_picks", "pro_game_bans"],
  ...["drafts", "draft_actions", "draft_role_swaps", "draft_presence", "draft_enemy_scouting", "matches", "series", "opponent_teams", "opponent_players"],
];
const RETIRED_COLUMNS: Array<[table: string, column: string]> = [
  ["riot_accounts", "opponent_player_id"],
  ["teams", "engine_config"],
];
const RETIRED_ENUMS = ["action_type", "competition_mode", "draft_status", "match_result", "scouting_confidence", "series_status"];
const list = (names: string[]) => sql.join(names.map((n) => sql`${n}`), sql`, `);

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
    let statements: { available: boolean; since: string | null; byRows: Row[]; byTime: Row[]; byCalls: Row[]; byBlocks: Row[]; error?: string } = { available: false, since: null, byRows: [], byTime: [], byCalls: [], byBlocks: [] };
    for (const view of ["extensions.pg_stat_statements", "public.pg_stat_statements"]) {
      try {
        const top = async (order: string) =>
          rows(
            await db.execute(
              sql.raw(`SELECT queryid::text AS id, left(regexp_replace(query, '\\s+', ' ', 'g'), 220) AS query, calls, rows, round(total_exec_time::numeric) AS total_ms, round(mean_exec_time::numeric, 1) AS mean_ms, shared_blks_hit + shared_blks_read AS blocks
                FROM ${view} WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) AND query NOT ILIKE '%pg_stat_statements%'
                ORDER BY ${order} DESC LIMIT 25`),
            ),
          ).map((r) => ({ id: r.id, query: r.query, calls: num(r.calls), rows: num(r.rows), rowsPerCall: r.calls ? Math.round(Number(r.rows) / Number(r.calls)) : null, totalMs: num(r.total_ms), meanMs: num(r.mean_ms), blocks: num(r.blocks) }));
        const byRows = await top("rows");
        const byTime = await top("total_exec_time");
        const byCalls = await top("calls");
        // Blocks read per statement: large values (images, match JSON) are few rows but many
        // blocks, so they rank here rather than by rows.
        const byBlocks = await top("shared_blks_hit + shared_blks_read");
        const [info] = rows(await db.execute(sql.raw(`SELECT stats_reset FROM ${view.replace("pg_stat_statements", "pg_stat_statements_info")}`)).catch(() => [] as never));
        statements = { available: true, since: info?.stats_reset ? new Date(String(info.stats_reset)).toISOString() : null, byRows, byTime, byCalls, byBlocks };
        break;
      } catch (err) {
        statements.error = (err as Error).message.slice(0, 200);
      }
    }
    // Every table in one line each (name, live rows, MB): which ones still hold anything.
    const allTables = rows(
      await db.execute(sql`SELECT relname AS name, n_live_tup AS live_rows, pg_total_relation_size(relid) AS total_bytes FROM pg_stat_user_tables ORDER BY relname`),
    ).map((r) => `${String(r.name)} ${num(r.live_rows)} rows ${Math.round((Number(r.total_bytes) / 1048576) * 100) / 100} MB`);
    // The retired tables, columns and types (counts and catalog entries only, never their values):
    // whether they still hold anything, whether anything still reads or writes them since the
    // statistics were last reset (compare two runs a day apart), and whether anything outside
    // them depends on them, which would make a drop without CASCADE fail.
    const retired = await retiredReport(db);
    // The largest stored values, by size only (never their contents).
    const images = rows(
      await db
        .execute(
          sql`SELECT 'brand:' || kind AS name, content_type, width, height, animated, octet_length(data) AS bytes, updated_at FROM brand_assets
              UNION ALL SELECT 'avatars', NULL, NULL, NULL, NULL, sum(octet_length(data)), max(updated_at) FROM user_avatars
              UNION ALL SELECT 'card-banners', NULL, NULL, NULL, NULL, sum(octet_length(data)), max(updated_at) FROM player_card_banners`,
        )
        .catch(() => [] as never),
    ).map((r) => ({ name: r.name, contentType: r.content_type ?? null, width: num(r.width), height: num(r.height), animated: r.animated ?? null, kb: r.bytes === null ? null : Math.round(Number(r.bytes) / 1024), updatedAt: r.updated_at ? new Date(String(r.updated_at)).toISOString() : null }));
    // JSON columns read by Match History and Matchups: what one row costs on the wire (as text).
    const json = rows(
      await db
        .execute(
          sql`SELECT 'match_details.participants' AS name, count(*) AS n, round(avg(octet_length(participants::text))) AS avg_text, max(octet_length(participants::text)) AS max_text, round(avg(pg_column_size(participants))) AS avg_stored FROM match_details
              UNION ALL SELECT 'match_timelines.frames', count(*), round(avg(octet_length(frames::text))), max(octet_length(frames::text)), round(avg(pg_column_size(frames))) FROM match_timelines WHERE frames IS NOT NULL`,
        )
        .catch(() => [] as never),
    ).map((r) => ({ name: r.name, rows: num(r.n), avgTextBytes: num(r.avg_text), maxTextBytes: num(r.max_text), avgStoredBytes: num(r.avg_stored) }));
    return { ok: true, summary: { databaseMb: database?.bytes ? Math.round(Number(database.bytes) / 1048576) : null, appEgress: await appEgressReport(db), images, json, retired, tables, allTables, statements } };
  },
});

async function retiredReport(db: Db) {
  const safe = async (query: ReturnType<typeof sql>) => rows(await db.execute(query).catch(() => [] as never));
  const tableOids = sql`SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN (${list(RETIRED_TABLES)})`;
  const [reset] = await safe(sql`SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()`);
  const stats = new Map((await safe(sql`SELECT relname AS name, n_live_tup AS live_rows, seq_scan, idx_scan, n_tup_ins + n_tup_upd + n_tup_del AS writes FROM pg_stat_user_tables WHERE schemaname = 'public' AND relname IN (${list(RETIRED_TABLES)})`)).map((r) => [String(r.name), r]));
  const tables = RETIRED_TABLES.map((name) => {
    const r = stats.get(name);
    return r ? { name, gone: false, rows: num(r.live_rows), seqScans: num(r.seq_scan), indexScans: num(r.idx_scan), writes: num(r.writes) } : { name, gone: true };
  });
  const present = new Set((await safe(sql`SELECT c.relname || '.' || a.attname AS name FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid WHERE c.relnamespace = 'public'::regnamespace AND NOT a.attisdropped AND a.attnum > 0 AND (c.relname, a.attname) IN (${sql.join(RETIRED_COLUMNS.map(([t, c]) => sql`(${t}, ${c})`), sql`, `)})`)).map((r) => String(r.name)));
  const columns = await Promise.all(
    RETIRED_COLUMNS.map(async ([table, column]) => {
      if (!present.has(`${table}.${column}`)) return { name: `${table}.${column}`, gone: true };
      // Rows with a value: a null, or an empty JSON object, holds nothing.
      const [r] = await safe(sql.raw(`SELECT count(*) AS n FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}"::text NOT IN ('{}', 'null')`));
      return { name: `${table}.${column}`, gone: false, rowsWithValue: num(r?.n) };
    }),
  );
  // Riot accounts of the Draft's scouted opponents (legacy owner type): the column drop leaves them unlinked.
  const [opponents] = await safe(sql`SELECT count(*) AS n FROM riot_accounts WHERE owner_type = 'opponent'`);
  const dependents = {
    // Foreign keys from a table that stays into one that goes (the column it sits on must go first).
    foreignKeys: (await safe(sql`SELECT conname AS name, conrelid::regclass::text AS from_table, confrelid::regclass::text AS to_table FROM pg_constraint WHERE contype = 'f' AND confrelid IN (${tableOids}) AND conrelid NOT IN (${tableOids}) ORDER BY 1`)).map((r) => ({ name: String(r.name), from: String(r.from_table), to: String(r.to_table) })),
    // Views built on a retired table or column.
    views: (await safe(sql`SELECT DISTINCT v.relname AS name FROM pg_depend d JOIN pg_rewrite w ON w.oid = d.objid JOIN pg_class v ON v.oid = w.ev_class
        WHERE d.classid = 'pg_rewrite'::regclass AND d.refclassid = 'pg_class'::regclass AND v.oid <> d.refobjid
          AND (d.refobjid IN (${tableOids}) OR (d.refobjid, d.refobjsubid) IN (SELECT a.attrelid, a.attnum FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid WHERE c.relnamespace = 'public'::regnamespace AND (c.relname, a.attname) IN (${sql.join(RETIRED_COLUMNS.map(([t, c]) => sql`(${t}, ${c})`), sql`, `)})))
        ORDER BY 1`)).map((r) => String(r.name)),
    // Columns of other tables or views that use a retired enum type.
    enumColumns: (await safe(sql`SELECT c.relname || '.' || a.attname AS name FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_type t ON t.oid = a.atttypid
        WHERE t.typnamespace = 'public'::regnamespace AND t.typname IN (${list(RETIRED_ENUMS)}) AND NOT a.attisdropped AND c.relkind IN ('r', 'v', 'm', 'p') AND c.oid NOT IN (${tableOids})
        ORDER BY 1`)).map((r) => String(r.name)),
    // Publications (Supabase Realtime) that list a retired table; a drop removes it from them.
    publications: (await safe(sql`SELECT pubname || ':' || tablename AS name FROM pg_publication_tables WHERE schemaname = 'public' AND tablename IN (${list(RETIRED_TABLES)}) ORDER BY 1`)).map((r) => String(r.name)),
  };
  const enums = new Set((await safe(sql`SELECT typname AS name FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname IN (${list(RETIRED_ENUMS)})`)).map((r) => String(r.name)));
  return {
    statsReset: reset?.stats_reset ? new Date(String(reset.stats_reset)).toISOString() : null,
    tables,
    columns,
    enums: RETIRED_ENUMS.map((name) => ({ name, gone: !enums.has(name) })),
    opponentAccounts: num(opponents?.n),
    dependents,
  };
}

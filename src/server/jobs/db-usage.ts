import { sql } from "drizzle-orm";
import { defineJob } from "./registry";
import { appEgressReport } from "./egress";

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
    // Retired Draft-era records still stored, and what still points at them (counts only), so
    // their removal can be checked against production first (docs/DATA_PIPELINES.md).
    const [retired] = rows(
      await db
        .execute(
          sql`SELECT (SELECT count(*) FROM drafts) AS drafts, (SELECT count(*) FROM draft_actions) AS draft_actions, (SELECT count(*) FROM draft_enemy_scouting) AS draft_enemy_scouting,
                (SELECT count(*) FROM draft_enemy_scouting WHERE tier IS NOT NULL AND puuid IS NOT NULL) AS scouted_ranks,
                (SELECT count(*) FROM matches) AS matches, (SELECT count(*) FROM matches WHERE draft_id IS NOT NULL) AS matches_with_draft,
                (SELECT count(*) FROM series) AS series, (SELECT count(*) FROM opponent_teams) AS opponent_teams, (SELECT count(*) FROM opponent_players) AS opponent_players,
                (SELECT count(*) FROM riot_accounts WHERE owner_type = 'opponent' OR opponent_player_id IS NOT NULL) AS opponent_accounts,
                (SELECT count(*) FROM tracked_summoners WHERE tier IS NOT NULL) AS ladder_ranks`,
        )
        .catch(() => [] as never),
    );
    const retiredDraftData = retired ? Object.fromEntries(Object.entries(retired).map(([k, v]) => [k, num(v)])) : null;
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
    return { ok: true, summary: { databaseMb: database?.bytes ? Math.round(Number(database.bytes) / 1048576) : null, appEgress: await appEgressReport(db), images, json, retiredDraftData, tables, allTables, statements } };
  },
});

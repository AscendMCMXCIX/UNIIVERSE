import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { defineJob } from "./registry";

type Row = Record<string, unknown>;
const rows = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
const num = (v: unknown) => Number(v ?? 0);

/** Supabase's Data API (PostgREST) roles: "anon" is reachable with the public key alone. */
const API_ROLES = ["anon", "authenticated"] as const;
/** Roles worth naming when they exist (Supabase creates them; plain Postgres has none of them). */
const KNOWN_ROLES = ["anon", "authenticated", "service_role", "authenticator", "postgres", "supabase_admin"];

/** The roles Supabase's Data API (PostgREST) runs requests as, and the one it logs in as. */
const DATA_API_ROLES = ["anon", "authenticated", "service_role", "authenticator"] as const;

async function query(db: Db, statement: ReturnType<typeof sql>): Promise<Row[]> {
  return rows(await db.execute(statement));
}

/** A query that may not exist everywhere (PGlite, older servers): no rows instead of an error. */
async function optional(db: Db, statement: ReturnType<typeof sql>): Promise<Row[]> {
  try {
    return await query(db, statement);
  } catch {
    return [];
  }
}

/**
 * Whether anything used Supabase's Data API: the statements its roles ran in this database since
 * Postgres' statement statistics were last reset (pg_stat_statements; null where it is absent).
 * PostgREST logs in as "authenticator" (which also reads the schema on its own) and runs every
 * request as anon, authenticated or service_role. Counts only: no query text, no values.
 */
export async function dataApiUse(db: Db): Promise<{ since: string | null; requests: number; byRole: Record<string, { statements: number; calls: number }> } | null> {
  // pg_stat_statements lives in the "extensions" schema on Supabase; elsewhere it may be absent.
  // Looked up first, so a missing view is no error (which would end a surrounding transaction).
  const [found] = await optional(db, sql`SELECT coalesce(to_regclass('extensions.pg_stat_statements'), to_regclass('public.pg_stat_statements'))::text AS view, coalesce(to_regclass('extensions.pg_stat_statements_info'), to_regclass('public.pg_stat_statements_info'))::text AS info`);
  const view = found?.view ? String(found.view) : null;
  if (!view) return null;
  try {
    const counts = await query(
      db,
      sql`SELECT r.rolname AS role, count(*)::int AS statements, coalesce(sum(s.calls), 0)::float8 AS calls
          FROM ${sql.raw(view)} s JOIN pg_roles r ON r.oid = s.userid
          WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) AND r.rolname IN (${sql.join(DATA_API_ROLES.map((r) => sql`${r}`), sql`, `)})
          GROUP BY r.rolname`,
    );
    const [info] = found?.info ? await query(db, sql`SELECT stats_reset FROM ${sql.raw(String(found.info))}`) : [];
    const byRole = Object.fromEntries(
      DATA_API_ROLES.map((role) => {
        const c = counts.find((r) => r.role === role);
        return [role, { statements: num(c?.statements), calls: num(c?.calls) }];
      }),
    );
    return { since: info?.stats_reset ? new Date(String(info.stats_reset)).toISOString() : null, requests: byRole.anon!.calls + byRole.authenticated!.calls + byRole.service_role!.calls, byRole };
  } catch {
    return null;
  }
}

/**
 * Who the app connects as and what other database roles could reach, read from the catalog only.
 * It answers the questions Row Level Security depends on: does the app own every table (owners
 * are exempt from RLS), can Supabase's Data API roles read tables that have no RLS, and is there
 * a view or a SECURITY DEFINER function those roles could use to get round it. Names of tables,
 * roles and settings only: no rows, no connection strings, no secrets.
 */
export async function accessReport(db: Db) {
  const [me] = await query(db, sql`SELECT current_user AS name, session_user AS session, r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls, r.rolcreaterole AS create_role, current_setting('server_version') AS version FROM pg_roles r WHERE r.rolname = current_user`);
  const [ssl] = await optional(db, sql`SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()`);
  const tables = await query(
    db,
    sql`SELECT c.relname AS name, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY c.relname`,
  );
  const [policies] = await query(db, sql`SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`);
  const views = await query(
    db,
    sql`SELECT c.relname AS name, c.relkind AS kind, pg_get_userbyid(c.relowner) AS owner, coalesce(array_to_string(c.reloptions, ','), '') AS options
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm') ORDER BY c.relname`,
  );
  const functions = await query(
    db,
    sql`SELECT p.oid::int AS oid, p.proname AS name, p.prosecdef AS security_definer, pg_get_userbyid(p.proowner) AS owner,
          EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e') AS from_extension
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' ORDER BY p.proname`,
  );
  const roleRows = await query(db, sql`SELECT rolname AS name, rolsuper AS superuser, rolbypassrls AS bypass_rls, rolcanlogin AS can_login FROM pg_roles WHERE rolname IN (${sql.join(KNOWN_ROLES.map((r) => sql`${r}`), sql`, `)}) ORDER BY rolname`);
  const roles = Object.fromEntries(roleRows.map((r) => [String(r.name), { superuser: !!r.superuser, bypassRls: !!r.bypass_rls, canLogin: !!r.can_login }]));

  const apiAccess: Record<string, Record<string, unknown>> = {};
  for (const role of API_ROLES) {
    if (!roles[role]) continue;
    const [t] = await query(
      db,
      sql`SELECT has_schema_privilege(${role}, 'public', 'USAGE') AS schema_usage,
            count(*) FILTER (WHERE c.relkind IN ('r', 'p') AND has_table_privilege(${role}, c.oid, 'SELECT'))::int AS can_select,
            count(*) FILTER (WHERE c.relkind IN ('r', 'p') AND has_table_privilege(${role}, c.oid, 'INSERT'))::int AS can_insert,
            count(*) FILTER (WHERE c.relkind IN ('r', 'p') AND has_table_privilege(${role}, c.oid, 'UPDATE'))::int AS can_update,
            count(*) FILTER (WHERE c.relkind IN ('r', 'p') AND has_table_privilege(${role}, c.oid, 'DELETE'))::int AS can_delete,
            count(*) FILTER (WHERE c.relkind IN ('r', 'p') AND has_table_privilege(${role}, c.oid, 'SELECT') AND NOT c.relrowsecurity)::int AS readable_without_rls,
            count(*) FILTER (WHERE c.relkind IN ('v', 'm') AND has_table_privilege(${role}, c.oid, 'SELECT'))::int AS readable_views
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'`,
    );
    const executable = functions.filter((f) => !f.from_extension).length
      ? await query(db, sql`SELECT p.proname AS name, p.prosecdef AS security_definer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND has_function_privilege(${role}, p.oid, 'EXECUTE') AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`)
      : [];
    apiAccess[role] = {
      schemaUsage: !!t?.schema_usage,
      tablesSelect: num(t?.can_select),
      tablesInsert: num(t?.can_insert),
      tablesUpdate: num(t?.can_update),
      tablesDelete: num(t?.can_delete),
      readableWithoutRls: num(t?.readable_without_rls),
      readableViews: num(t?.readable_views),
      executableFunctions: executable.map((f) => String(f.name)),
      executableSecurityDefiner: executable.filter((f) => f.security_definer).map((f) => String(f.name)),
    };
  }

  const extensions = (await optional(db, sql`SELECT e.extname AS name, n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY e.extname`)).map((e) => `${e.name} (${e.schema})`);
  const publications = (await optional(db, sql`SELECT p.pubname AS name, p.puballtables AS all_tables, (SELECT count(*) FROM pg_publication_tables pt WHERE pt.pubname = p.pubname AND pt.schemaname = 'public')::int AS public_tables FROM pg_publication p ORDER BY p.pubname`)).map((p) => ({ name: String(p.name), allTables: !!p.all_tables, publicTables: num(p.public_tables) }));
  // Settings that say whether WAL is archived (what point-in-time recovery relies on). Never the
  // archive command itself, which can hold storage credentials.
  const [wal] = await optional(db, sql`SELECT current_setting('archive_mode', true) AS archive_mode, current_setting('wal_level', true) AS wal_level`);

  const owner = String(me?.name ?? "");
  const exempt = !!me?.superuser || !!me?.bypass_rls;
  const notOwned = tables.filter((t) => t.owner !== owner).map((t) => `${t.name} (${t.owner})`);
  const withoutRls = tables.filter((t) => !t.rls).map((t) => String(t.name));
  const viewsWithoutInvoker = views.filter((v) => v.kind === "v" && !/security_invoker=(true|on|1)/i.test(String(v.options))).map((v) => String(v.name));

  const problems: string[] = [];
  if (notOwned.length && !exempt) problems.push(`the app does not own ${notOwned.length} table(s), so Row Level Security would block it there: ${notOwned.join(", ")}`);
  if (tables.some((t) => t.forced)) problems.push("a table forces Row Level Security on its owner, which would block the app");
  for (const [role, a] of Object.entries(apiAccess)) {
    if (num(a.readableWithoutRls) > 0) problems.push(`${role} can read ${a.readableWithoutRls} table(s) that have no Row Level Security`);
    if (num(a.readableViews) > 0) problems.push(`${role} can read ${a.readableViews} view(s); views run as their owner and get round Row Level Security`);
    if ((a.executableSecurityDefiner as string[]).length) problems.push(`${role} can run SECURITY DEFINER function(s): ${(a.executableSecurityDefiner as string[]).join(", ")}`);
  }

  return {
    problems,
    summary: {
      connection: { user: owner, sessionUser: String(me?.session ?? ""), superuser: !!me?.superuser, bypassRls: !!me?.bypass_rls, createRole: !!me?.create_role, ssl: ssl ? !!ssl.ssl : null, serverVersion: String(me?.version ?? "") },
      tables: {
        total: tables.length,
        owners: Object.fromEntries([...new Set(tables.map((t) => String(t.owner)))].map((o) => [o, tables.filter((t) => t.owner === o).length])),
        notOwnedByApp: notOwned,
        rowLevelSecurity: tables.length - withoutRls.length,
        withoutRowLevelSecurity: withoutRls,
        forced: tables.filter((t) => t.forced).map((t) => String(t.name)),
        policies: num(policies?.n),
      },
      views: views.map((v) => ({ name: String(v.name), kind: v.kind === "m" ? "materialized" : "view", owner: String(v.owner), securityInvoker: !viewsWithoutInvoker.includes(String(v.name)) && v.kind === "v" })),
      functions: { total: functions.length, fromExtensions: functions.filter((f) => f.from_extension).length, securityDefiner: functions.filter((f) => f.security_definer && !f.from_extension).map((f) => String(f.name)) },
      roles,
      dataApiAccess: apiAccess,
      dataApiUse: await dataApiUse(db),
      extensions,
      publications,
      wal: wal ? { archiveMode: wal.archive_mode ?? null, walLevel: wal.wal_level ?? null } : null,
    },
  };
}

/**
 * Read-only database access check (Row Level Security and Supabase's Data API). Changes nothing.
 */
defineJob({
  key: "access-audit",
  description: "Read-only database access check: who the app connects as, table owners, Row Level Security, views, functions and what Supabase's Data API roles could read. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const report = await accessReport(ctx.db);
    return {
      ok: true,
      degraded: report.problems.length > 0,
      error: report.problems.length ? `Access audit: ${report.problems.join("; ")}.` : undefined,
      summary: report.summary,
    };
  },
});

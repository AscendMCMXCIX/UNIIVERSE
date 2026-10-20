import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accessReport, dataApiUse } from "@/server/jobs/access-audit";
import { runJob } from "@/server/jobs";

/*
  The read-only access audit reads the catalog to say what Row Level Security depends on: the app
  owns every table, and nothing lets Supabase's Data API roles read round it.
*/

let handle: DbHandle;

beforeAll(async () => {
  handle = await testDb();
});
afterAll(async () => {
  await handle.close();
});

describe("access audit", () => {
  it("reports who the app connects as and that it owns every table", async () => {
    const report = await accessReport(handle.db);
    expect(report.summary.tables.total).toBeGreaterThan(40);
    expect(report.summary.tables.notOwnedByApp).toEqual([]);
    expect(Object.keys(report.summary.tables.owners)).toEqual([report.summary.connection.user]);
    expect(report.summary.views).toEqual([]);
    expect(report.summary.functions.securityDefiner).toEqual([]);
  });

  it.runIf(!!process.env.TEST_DATABASE_URL)("counts the statements Supabase's Data API roles ran, from pg_stat_statements", async () => {
    // Plain Postgres in tests has no pg_stat_statements; a table with its columns stands in for it,
    // in a transaction that is rolled back (roles included).
    const use = await handle.db
      .transaction(async (tx) => {
        await tx.execute(sql.raw(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$`));
        await tx.execute(sql.raw(`CREATE TABLE public.pg_stat_statements (userid oid, dbid oid, calls bigint)`));
        await tx.execute(sql.raw(`CREATE TABLE public.pg_stat_statements_info (stats_reset timestamptz)`));
        await tx.execute(sql.raw(`INSERT INTO public.pg_stat_statements SELECT r.oid, d.oid, 7 FROM pg_roles r, pg_database d WHERE r.rolname = 'anon' AND d.datname = current_database()`));
        await tx.execute(sql.raw(`INSERT INTO public.pg_stat_statements SELECT r.oid, d.oid, 5 FROM pg_roles r, pg_database d WHERE r.rolname = current_user AND d.datname = current_database()`));
        await tx.execute(sql.raw(`INSERT INTO public.pg_stat_statements SELECT r.oid, 0, 9 FROM pg_roles r WHERE r.rolname = 'anon'`));
        await tx.execute(sql.raw(`INSERT INTO public.pg_stat_statements_info VALUES ('2026-10-13T00:00:00Z')`));
        throw Object.assign(new Error("rollback"), { use: await dataApiUse(tx as unknown as DbHandle["db"]) });
      })
      .catch((err: Error & { use?: Awaited<ReturnType<typeof dataApiUse>> }) => {
        if (!("use" in err)) throw err;
        return err.use;
      });
    // Only this database's statements, only the Data API's roles; the app's own are not counted.
    expect(use?.byRole.anon).toEqual({ statements: 1, calls: 7 });
    expect(use?.byRole.authenticated).toEqual({ statements: 0, calls: 0 });
    expect(use?.requests).toBe(7);
    expect(use?.since).toBe("2026-10-13T00:00:00.000Z");
    // Without the view there is nothing to report, and no error.
    expect(await dataApiUse(handle.db)).toBeNull();
  });

  it("runs as a read-only job and records its result", async () => {
    const result = await runJob(handle.db, "access-audit", "cli");
    expect(result.ok).toBe(true);
    expect((result.summary as { tables: { total: number } }).tables.total).toBeGreaterThan(40);
  });

  it.runIf(!!process.env.TEST_DATABASE_URL)("names every way the Data API's anon role could read data", async () => {
    // Everything here is undone: the transaction rolls back, roles and grants included.
    const problems = await handle.db
      .transaction(async (tx) => {
        await tx.execute(sql.raw(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF; END $$`));
        await tx.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO anon`));
        await tx.execute(sql.raw(`CREATE TABLE audit_probe_table (id int)`));
        await tx.execute(sql.raw(`GRANT SELECT ON players, audit_probe_table TO anon`));
        await tx.execute(sql.raw(`CREATE VIEW audit_probe_view AS SELECT id FROM players`));
        await tx.execute(sql.raw(`GRANT SELECT ON audit_probe_view TO anon`));
        await tx.execute(sql.raw(`CREATE FUNCTION audit_probe_fn() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'`));
        await tx.execute(sql.raw(`GRANT EXECUTE ON FUNCTION audit_probe_fn() TO anon`));
        const report = await accessReport(tx as unknown as DbHandle["db"]);
        throw Object.assign(new Error("rollback"), { report });
      })
      .catch((err: Error & { report?: Awaited<ReturnType<typeof accessReport>> }) => {
        if (!err.report) throw err;
        return err.report.problems;
      });
    expect(problems.join("\n")).toMatch(/anon can read 1 table\(s\) that have no Row Level Security/);
    expect(problems.join("\n")).toMatch(/anon can read 1 view\(s\)/);
    expect(problems.join("\n")).toMatch(/anon can run SECURITY DEFINER function\(s\): audit_probe_fn/);
  });
});

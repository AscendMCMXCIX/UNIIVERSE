import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./helpers";
import type { DbHandle } from "@/server/db/create";
import { accessReport } from "@/server/jobs/access-audit";
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
